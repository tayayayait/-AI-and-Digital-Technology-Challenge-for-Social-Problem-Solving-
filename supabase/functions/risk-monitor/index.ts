import { createClient } from "@supabase/supabase-js";

import { handleCorsPreflight, jsonError, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { type RiskLevel, shouldNotify } from "../_shared/riskNotification.ts";
import {
  calculateMonitoredRisk,
  forEachWithConcurrency,
  getKmaNowcastBase,
  groupSubscriptionsByGrid,
  MAX_SUBSCRIPTIONS_PER_RUN,
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

const notificationCopy = (level: RiskLevel) => {
  const copy = {
    WATCH: ["침수 위험 주의", "이동 전 주변 위험과 안전 경로를 확인하세요."],
    WARNING: ["침수 위험 경계", "안전한 대피소 이동을 준비하고 추천 경로를 확인하세요."],
    CRITICAL: ["침수 위험 심각", "즉시 안전한 곳으로 이동하세요. 가장 안전한 경로를 확인하세요."],
  } as const;
  return copy[level === "WATCH" || level === "WARNING" ? level : "CRITICAL"];
};

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
  const weatherRequest = { ...toKmaGrid({ lat, lng }), ...getKmaNowcastBase() };
  const [weatherResult, sensorsResult] = await Promise.allSettled([
    callFunction<{ rainfallMmPerHour?: number }>(
      supabaseUrl,
      serviceRoleKey,
      "weather",
      weatherRequest,
    ),
    callFunction<Array<Record<string, unknown>>>(supabaseUrl, serviceRoleKey, "sensors", {
      origin: { lat, lng },
    }),
  ]);
  const failedSources =
    Number(weatherResult.status === "rejected") + Number(sensorsResult.status === "rejected");
  return calculateMonitoredRisk({
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

      const risksByGrid = new Map<string, RiskLevel>();
      await forEachWithConcurrency(groups, GRID_CONCURRENCY, async ([key]) => {
        const [lat, lng] = key.split(",").map(Number);
        const currentLevel = await calculateGridRisk(supabaseUrl, serviceRoleKey, lat, lng);
        if (currentLevel === "UNKNOWN") unknownGroups += 1;
        risksByGrid.set(key, currentLevel);
      });

      const work = groups.flatMap(([key, rows]) => {
        const currentLevel = risksByGrid.get(key) ?? "UNKNOWN";
        return rows.map((subscription) => ({ currentLevel, subscription }));
      });
      await forEachWithConcurrency(
        work,
        SUBSCRIPTION_CONCURRENCY,
        async ({ currentLevel, subscription }) => {
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
            const [title, body] = notificationCopy(currentLevel);
            try {
              const result = await callFunction<{ sent?: boolean }>(
                supabaseUrl,
                serviceRoleKey,
                "push-notify",
                {
                  subscriptionId: subscription.id,
                  title,
                  body,
                  data: {
                    url: "/routes",
                    tag: `flood-risk-${currentLevel.toLowerCase()}`,
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
