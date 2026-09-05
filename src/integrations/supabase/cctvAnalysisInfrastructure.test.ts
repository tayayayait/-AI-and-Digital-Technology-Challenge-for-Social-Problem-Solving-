import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const migrationPath = "supabase/migrations/20260903053000_create_cctv_analysis.sql";

describe("CCTV analysis infrastructure", () => {
  test("creates a ten-minute analysis cache table with protected writes", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/create table public\.cctv_analysis/i);
    expect(sql).toContain("depth_grade");
    expect(sql).toContain("frame_data_url");
    expect(sql).toContain("expires_at");
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/camera_id, analyzed_at desc/i);
    expect(sql).toMatch(/create or replace function public\.claim_cctv_analysis_usage/i);
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i);
  });

  test("enforces cache, timeout, confidence, and daily-cap rules in the Edge Function", () => {
    const source = readFileSync("supabase/functions/cctv-analyze/index.ts", "utf8");

    expect(source).toContain('from("cctv_analysis")');
    expect(source).toContain("CCTV_ANALYSIS_CACHE_MS = 10 * 60 * 1000");
    expect(source).toContain("GEMINI_TIMEOUT_MS = 25_000");
    expect(source).toContain("maxOutputTokens: 256");
    expect(source).toContain("thinkingBudget: 0");
    expect(source).toContain('Deno.env.get("CCTV_ANALYSIS_DAILY_LIMIT")');
    expect(source).toMatch(/\.rpc\(\s*"claim_cctv_analysis_usage"/);
    expect(source).toContain("reliableCctvAnalysis");
    expect(source).toContain("withJsonDuration");
  });

  test("documents and registers the configurable daily call cap as a Supabase secret", () => {
    const envExample = readFileSync(".env.example", "utf8");
    const secretScript = readFileSync("scripts/set-supabase-secrets.ps1", "utf8");

    expect(envExample).toMatch(/^CCTV_ANALYSIS_DAILY_LIMIT=100$/m);
    expect(secretScript).toContain('"CCTV_ANALYSIS_DAILY_LIMIT"');
  });
});
