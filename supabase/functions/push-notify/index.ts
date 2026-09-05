import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

import { handleCorsPreflight, jsonError, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { parsePushNotificationRequest, pushFailureAction } from "../_shared/push.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, requireEnv } from "../_shared/upstream.ts";

const isServiceRoleRequest = (request: Request, serviceRoleKey: string) =>
  request.headers.get("authorization")?.trim() === `Bearer ${serviceRoleKey}`;

const statusCodeOf = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }
  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(statusCode) ? statusCode : undefined;
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const supabaseUrl = requireEnv("SUPABASE_URL");
      const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      if (!isServiceRoleRequest(request, serviceRoleKey)) {
        return jsonError("Unauthorized", 401);
      }

      const input = parsePushNotificationRequest(await parseJsonBody(request));
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
      const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim();
      if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
        return jsonOk({ status: "PENDING_ACCESS", sent: false });
      }

      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: subscription, error } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, failure_count")
        .eq("id", input.subscriptionId)
        .maybeSingle();
      if (error) throw error;
      if (!subscription) return jsonError("Push subscription not found", 404);
      if (subscription.failure_count > 5) {
        return jsonOk({ status: "DISABLED", sent: false });
      }

      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: input.title,
            body: input.body,
            data: input.data,
          }),
          { TTL: 300, urgency: "high" },
        );

        const { error: resetError } = await admin
          .from("push_subscriptions")
          .update({ failure_count: 0 })
          .eq("id", subscription.id);
        if (resetError) throw resetError;
        return jsonOk({ status: "SENT", sent: true });
      } catch (sendError) {
        const statusCode = statusCodeOf(sendError);
        if (pushFailureAction(statusCode) === "DELETE") {
          const { error: deleteError } = await admin
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
          if (deleteError) throw deleteError;
          return jsonOk({ status: "EXPIRED", sent: false, deleted: true });
        }

        const { error: updateError } = await admin
          .from("push_subscriptions")
          .update({ failure_count: subscription.failure_count + 1 })
          .eq("id", subscription.id);
        if (updateError) throw updateError;
        console.error("Web Push delivery failed", {
          subscriptionId: subscription.id,
          statusCode,
        });
        return jsonOk(
          {
            status: "FAILED",
            sent: false,
            failureCount: subscription.failure_count + 1,
          },
          { status: 502 },
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid")) {
        return jsonError(error.message, 400);
      }
      return edgeError(error);
    }
  }),
);
