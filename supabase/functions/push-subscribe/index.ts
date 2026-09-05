import { createClient } from "@supabase/supabase-js";

import { handleCorsPreflight, jsonError, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { parsePushSubscriptionRequest } from "../_shared/push.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, requireEnv } from "../_shared/upstream.ts";

const bearerToken = (request: Request) => {
  const value = request.headers.get("authorization")?.trim() ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : null;
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const input = parsePushSubscriptionRequest(await parseJsonBody(request));
      const supabaseUrl = requireEnv("SUPABASE_URL");
      const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const token = bearerToken(request);
      let userId: string | null = null;
      if (token && token !== serviceRoleKey) {
        const { data: userData, error: userError } = await admin.auth.getUser(token);
        if (!userError && userData.user) userId = userData.user.id;
      }

      if (input.action === "unsubscribe") {
        const { data: removed, error } = await admin
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", input.endpoint)
          .eq("auth", input.auth)
          .select("user_id");
        if (error) throw error;

        if (userId) {
          const { count, error: countError } = await admin
            .from("push_subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId);
          if (countError) throw countError;
          if ((count ?? 0) === 0) {
            const { error: preferenceError } = await admin
              .from("notification_preferences")
              .update({
                push_consent: false,
                revoked_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
            if (preferenceError) throw preferenceError;
          }
        }

        return jsonOk({ status: "UNSUBSCRIBED", removed: removed?.length ?? 0 });
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("push_subscriptions")
        .upsert(
          {
            user_id: userId,
            endpoint: input.subscription.endpoint,
            p256dh: input.subscription.keys.p256dh,
            auth: input.subscription.keys.auth,
            region_lat: input.region?.lat ?? null,
            region_lng: input.region?.lng ?? null,
            alert_threshold: input.alertThreshold,
            failure_count: 0,
          },
          { onConflict: "endpoint" },
        )
        .select("id")
        .single();
      if (error) throw error;

      if (userId) {
        const { error: preferenceError } = await admin.from("notification_preferences").upsert(
          {
            user_id: userId,
            push_consent: true,
            browser_permission: "granted",
            alert_threshold: input.alertThreshold,
            background_location_enabled: false,
            consented_at: now,
            revoked_at: null,
          },
          { onConflict: "user_id" },
        );
        if (preferenceError) throw preferenceError;
      }

      return jsonOk({ status: "SUBSCRIBED", subscriptionId: data.id });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid")) {
        return jsonError(error.message, 400);
      }
      return edgeError(error);
    }
  }),
);
