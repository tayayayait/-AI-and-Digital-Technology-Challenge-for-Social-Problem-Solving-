import { createClient } from "@supabase/supabase-js";

import { handleCorsPreflight, jsonError, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import {
  buildRiskNotificationCopy,
  type RiskLevel,
  shouldNotify,
} from "../_shared/riskNotification.ts";
import {
  calculateMonitoredRiskState,
  forEachWithConcurrency,
  getKmaNowcastBase,
  getKmaUltraForecastBase,
  groupSubscriptionsByGrid,
  MAX_SUBSCRIPTIONS_PER_RUN,
  type MonitoredRiskState,
  toKmaGrid,
} from "../_shared/riskMonitor.ts";
import { assertAllowedMethod } from "../_shared/validation.ts";
import { edgeError, requireEnv } from "../_shared/upstream.ts";

interface PushSubscriptionRow {
  id: string;
  region_lat: number;
  region_lng: number;
  alert_threshold: "WATCH" | "WARNING" | "CRITICAL";
  last_notified_level: string | null;
  last_notified_at: string | null;
}

const RISK_LEVELS = new Set<RiskLevel>(["SAFE", "WATCH", "WARNING", "CRITICAL", "UNKNOWN"]);
const GRID_CONCURRENCY = 4;
const SUBSCRIPTION_CONCURRENCY = 20;
const riskLevelOrNull = (value: string | null): RiskLevel | null =>
  value && RISK_LEVELS.has(value as RiskLevel) ? (value as RiskLevel) : null;

const callFunction = async <T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  name: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${name} ${response.status}: ${text.slice(0, 160)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
};

const calculateGridRisk = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  lat: number,
  lng: number,
) => {
  const now = new Date();
  const weatherRequest = {
    ...toKmaGrid({ lat, lng }),
    ...getKmaNowcastBase(now),
    ...getKmaUltraForecastBase(now),
  };
  const [weatherResult, sensorsResult] = await Promise.allSettled([
    callFunction<{
      rainfallMmPerHour?: number;
      hourlyForecast?: Array<{ forecastAt: string; rainfallMmPerHour: number }>;
    }>(supabaseUrl, serviceRoleKey, "weather", weatherRequest),
    callFunction<Array<Record<string, unknown>>>(supabaseUrl, serviceRoleKey, "sensors", {
      origin: { lat, lng },
    }),
  ]);
  const failedSources =
    Number(weatherResult.status === "rejected") + Number(sensorsResult.status === "rejected");
  return calculateMonitoredRiskState({
    weather: weatherResult.status === "fulfilled" ? weatherResult.value : null,
    sensors: sensorsResult.status === "fulfilled" ? sensorsResult.value : null,
    failedSources,
  });
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const supabaseUrl = requireEnv("SUPABASE_URL");
      const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      const cronSecret = requireEnv("RISK_MONITOR_CRON_SECRET");
      const authorization = request.headers.get("authorization")?.trim();
      if (
        authorization !== `Bearer ${serviceRoleKey}` &&
        authorization !== `Bearer ${cronSecret}`
      ) {
        return jsonError("Unauthorized", 401);
      }

      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await admin
        .from("push_subscriptions")
        .select(
          "id, region_lat, region_lng, alert_threshold, last_notified_level, last_notified_at",
        )
        .not("region_lat", "is", null)
        .not("region_lng", "is", null)
        .lte("failure_count", 5)
        .order("updated_at", { ascending: true })
        .limit(MAX_SUBSCRIPTIONS_PER_RUN);
      if (error) throw error;

      const subscriptions = (data ?? []) as PushSubscriptionRow[];
      const groups = [...groupSubscriptionsByGrid(subscriptions).entries()];
      const now = new Date();
      let sent = 0;
      let unknownGroups = 0;

      const risksByGrid = new Map<string, MonitoredRiskState>();
      await forEachWithConcurrency(groups, GRID_CONCURRENCY, async ([key]) => {
        const [lat, lng] = key.split(",").map(Number);
        const risk = await calculateGridRisk(supabaseUrl, serviceRoleKey, lat, lng);
        if (risk.alertLevel === "UNKNOWN") unknownGroups += 1;
        risksByGrid.set(key, risk);
      });

      const work = groups.flatMap(([key, rows]) => {
        const risk = risksByGrid.get(key) ?? {
          currentLevel: "UNKNOWN" as const,
          alertLevel: "UNKNOWN" as const,
        };
        return rows.map((subscription) => ({ risk, subscription }));
      });
      await forEachWithConcurrency(
        work,
        SUBSCRIPTION_CONCURRENCY,
        async ({ risk, subscription }) => {
          const currentLevel = risk.alertLevel;
          const lastNotifiedLevel = riskLevelOrNull(subscription.last_notified_level);
          const notify = shouldNotify({
            currentLevel,
            lastNotifiedLevel,
            lastNotifiedAt: subscription.last_notified_at,
            threshold: subscription.alert_threshold,
            now: now.getTime(),
          });

          let delivered = false;
          if (notify) {
            const copy = buildRiskNotificationCopy({
              level: currentLevel,
              forecastAt: risk.forecastAt,
            });
            try {
              const result = await callFunction<{ sent?: boolean }>(
                supabaseUrl,
                serviceRoleKey,
                "push-notify",
                {
                  subscriptionId: subscription.id,
                  title: copy.title,
                  body: copy.body,
                  data: {
                    url: copy.url,
                    tag: copy.tag,
                  },
                },
              );
              delivered = result.sent === true;
              if (delivered) sent += 1;
            } catch (deliveryError) {
              console.error("risk-monitor delivery failed", {
                subscriptionId: subscription.id,
                error:
                  deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
              });
            }
          }

          const update: Record<string, unknown> = {
            updated_at: now.toISOString(),
          };
          if (delivered) {
            update.last_notified_level = currentLevel;
            update.last_notified_at = now.toISOString();
          } else if (!notify && currentLevel !== "UNKNOWN" && currentLevel !== lastNotifiedLevel) {
            update.last_notified_level = currentLevel;
          }
          const { error: updateError } = await admin
            .from("push_subscriptions")
            .update(update)
            .eq("id", subscription.id);
          if (updateError) throw updateError;
        },
      );

      return jsonOk({
        status: "OK",
        subscriptions: subscriptions.length,
        groups: groups.length,
        sent,
        unknownGroups,
        capped: subscriptions.length === MAX_SUBSCRIPTIONS_PER_RUN,
      });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
