import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CURRENT_PROJECT_REF = "qlaeegqbopzwqdcbjbxc";
const RETIRED_PROJECT_REF = "qsuxpldbwzqnomvtmtyw";
const LEAST_PRIVILEGE_MIGRATION =
  "supabase/migrations/20260903155129_restrict_public_table_privileges.sql";
const SECURE_CRON_MIGRATION = "supabase/migrations/20260903160009_secure_risk_monitor_cron.sql";

const projectBoundFiles = [
  "supabase/config.toml",
  "scripts/deploy-supabase-all.ps1",
  "scripts/set-supabase-secrets.ps1",
  "scripts/set-supabase-vertex-secrets.ps1",
  "supabase/migrations/20260831145748_enable_pg_cron.sql",
];

const itsKeyConsumerFiles = [
  "supabase/functions/traffic-events/index.ts",
  "scripts/probe/test-api.js",
  "scripts/probe/test_traffic_direct.js",
];

describe("Supabase project configuration", () => {
  it.each(projectBoundFiles)("targets the active project in %s", (path) => {
    const contents = readFileSync(path, "utf8");

    expect(contents).toContain(CURRENT_PROJECT_REF);
    expect(contents).not.toContain(RETIRED_PROJECT_REF);
  });

  it("links the active project before pushing migrations", () => {
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");
    const linkPosition = deployScript.indexOf('link", "--project-ref", $ProjectRef');
    const pushPosition = deployScript.indexOf('db", "push", "--linked');

    expect(linkPosition).toBeGreaterThan(-1);
    expect(pushPosition).toBeGreaterThan(linkPosition);
  });

  it("restricts CCTV camera writes to the service role", () => {
    const migration = readFileSync(
      "supabase/migrations/20260615090352_create_cctv_cameras_table.sql",
      "utf8",
    );

    expect(migration).toMatch(
      /CREATE POLICY "CCTV cameras are insertable by service role"[\s\S]*?FOR INSERT\s+TO service_role/i,
    );
    expect(migration).toMatch(
      /CREATE POLICY "CCTV cameras are updatable by service role"[\s\S]*?FOR UPDATE\s+TO service_role/i,
    );
  });

  it("explicitly grants the Data API privileges required by each RLS policy", () => {
    const roles = readFileSync(
      "supabase/migrations/20260611152840_add_roles_and_profiles.sql",
      "utf8",
    );
    const shelters = readFileSync(
      "supabase/migrations/20260611153043_create_shelter_operations.sql",
      "utf8",
    );
    const notifications = readFileSync(
      "supabase/migrations/20260611153658_create_notification_and_sensor_tables.sql",
      "utf8",
    );
    const monitoring = readFileSync(
      "supabase/migrations/20260611153949_create_audit_and_monitoring.sql",
      "utf8",
    );
    const cctv = readFileSync(
      "supabase/migrations/20260615090352_create_cctv_cameras_table.sql",
      "utf8",
    );

    expect(roles).toMatch(/grant select, update on table public\.profiles to authenticated/i);
    expect(roles).toMatch(/grant all on table public\.profiles to service_role/i);
    expect(shelters).toMatch(/grant select on table public\.shelter_operations to anon/i);
    expect(shelters).toMatch(
      /grant select, insert, update, delete on table public\.shelter_operations to authenticated/i,
    );
    expect(notifications).toMatch(
      /grant select, insert, update on table public\.notification_preferences to authenticated/i,
    );
    expect(notifications).toMatch(/grant select on table public\.sensor_feeds to anon/i);
    expect(monitoring).toMatch(
      /grant select, insert on table public\.audit_logs to authenticated/i,
    );
    expect(monitoring).toMatch(
      /grant select, insert on table public\.api_health_metrics to authenticated/i,
    );
    expect(cctv).toMatch(/grant select on table public\.cctv_cameras to anon, authenticated/i);
    expect(cctv).toMatch(/grant all on table public\.cctv_cameras to service_role/i);
  });

  it("does not leave public SECURITY DEFINER helpers executable by every role", () => {
    const migration = readFileSync(
      "supabase/migrations/20260611152840_add_roles_and_profiles.sql",
      "utf8",
    );

    expect(migration).toMatch(
      /revoke all on function public\.handle_new_user_profile\(\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.current_user_role\(\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.current_user_role\(\) to authenticated/i,
    );
  });

  it("revokes broad default table privileges before restoring least privilege", () => {
    const exists = existsSync(LEAST_PRIVILEGE_MIGRATION);

    expect(exists).toBe(true);
    if (!exists) return;

    const migration = readFileSync(LEAST_PRIVILEGE_MIGRATION, "utf8");

    expect(migration).toMatch(
      /alter default privileges for role postgres in schema public\s+revoke all on tables from anon, authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all privileges on all tables in schema public from anon, authenticated/i,
    );
    expect(migration).toMatch(/grant select, update on table public\.profiles to authenticated/i);
    expect(migration).toMatch(/grant select on table public\.shelter_operations to anon/i);
    expect(migration).toMatch(
      /grant select, insert, update, delete on table public\.shelter_operations to authenticated/i,
    );
    expect(migration).toMatch(
      /grant select, insert, update on table public\.notification_preferences to authenticated/i,
    );
    expect(migration).toMatch(/grant select on table public\.sensor_feeds to anon/i);
    expect(migration).toMatch(/grant select, insert on table public\.audit_logs to authenticated/i);
    expect(migration).toMatch(
      /grant select, insert on table public\.api_health_metrics to authenticated/i,
    );
    expect(migration).toMatch(/grant select on table public\.cctv_cameras to anon, authenticated/i);
    expect(migration).toMatch(
      /alter function public\.touch_updated_at\(\) set search_path = pg_catalog, public/i,
    );
  });

  it("authenticates scheduled risk monitoring with a dedicated internal secret", () => {
    const exists = existsSync(SECURE_CRON_MIGRATION);

    expect(exists).toBe(true);
    if (!exists) return;

    const migration = readFileSync(SECURE_CRON_MIGRATION, "utf8");
    const edgeFunction = readFileSync("supabase/functions/risk-monitor/index.ts", "utf8");
    const envExample = readFileSync(".env.example", "utf8");
    const secretScript = readFileSync("scripts/set-supabase-secrets.ps1", "utf8");

    expect(migration).toContain("risk_monitor_cron_secret");
    expect(migration).not.toContain("risk_monitor_service_role_key");
    expect(edgeFunction).toContain('requireEnv("RISK_MONITOR_CRON_SECRET")');
    expect(edgeFunction).toMatch(/authorization[^\n]*cronSecret/i);
    expect(envExample).toContain("RISK_MONITOR_CRON_SECRET=");
    expect(secretScript).toContain('"RISK_MONITOR_CRON_SECRET"');
  });

  it("keeps ITS credentials in environment variables and out of source or logs", () => {
    for (const path of itsKeyConsumerFiles) {
      const contents = readFileSync(path, "utf8");
      expect(contents, path).not.toMatch(/["'][0-9a-f]{32}["']/i);
      expect(contents, path).not.toMatch(
        /console\.log\(["']Fetching:["'],\s*url(?:\.toString\(\))?\)/,
      );
    }

    const edgeFunction = readFileSync("supabase/functions/traffic-events/index.ts", "utf8");
    expect(edgeFunction).toContain("readTrafficEventsApiKey");
    expect(edgeFunction).toContain('trafficEventsUnavailableBody("ITS_API_KEY is not configured")');
  });
});
