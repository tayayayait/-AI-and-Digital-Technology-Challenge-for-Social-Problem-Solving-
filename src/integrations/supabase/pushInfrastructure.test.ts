import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

describe("Phase 3 push infrastructure contracts", () => {
  test("push_subscriptions migration keeps endpoints unique, location coarse, and RLS explicit", () => {
    const migration = readFileSync(
      "supabase/migrations/20260831142613_create_push_subscriptions.sql",
      "utf8",
    );

    expect(migration).toMatch(/endpoint text not null unique/i);
    expect(migration).toContain("round(new.region_lat::numeric, 3)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "revoke all on table public.push_subscriptions from anon, authenticated",
    );
    expect(migration).toContain("push_subscriptions_select_own");
    expect(migration).toContain("push_subscriptions_update_own");
  });

  test("cron migration reads authentication only from Vault and schedules every five minutes", () => {
    const migration = readFileSync("supabase/migrations/20260831145748_enable_pg_cron.sql", "utf8");

    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("risk_monitor_service_role_key");
    expect(migration).toContain("'*/5 * * * *'");
    expect(migration).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  test("Edge functions pin current dependencies and no longer configure legacy FCM", () => {
    const denoConfig = readFileSync("supabase/functions/push-notify/deno.json", "utf8");
    const envExample = readFileSync(".env.example", "utf8");

    expect(denoConfig).toContain("npm:web-push@3.6.7");
    expect(denoConfig).toContain("npm:@supabase/supabase-js@2.108.1");
    expect(envExample).toContain("VAPID_PRIVATE_KEY=");
    expect(envExample).toContain("VAPID_SUBJECT=");
    expect(envExample).not.toContain("FCM_SERVER_KEY");
  });

  test("citizens can reach the notification consent card from an existing bottom tab", () => {
    const helpRoute = readFileSync("src/routes/help.tsx", "utf8");

    expect(helpRoute).toContain("<NotificationConsentCard />");
  });
});
