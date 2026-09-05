import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("underpass infrastructure", () => {
  test("creates a publicly readable, service-role writable underpasses table", () => {
    const migrationName = readdirSync(resolve(root, "supabase/migrations")).find((name) =>
      name.endsWith("_create_underpasses.sql"),
    );

    expect(migrationName).toBeDefined();
    const sql = readFileSync(resolve(root, "supabase/migrations", migrationName!), "utf8");
    expect(sql).toMatch(/create table public\.underpasses/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/grant select on table public\.underpasses to anon, authenticated/i);
    expect(sql).toMatch(/grant all on table public\.underpasses to service_role/i);
    expect(sql).toMatch(/create index[\s\S]+lat[\s\S]+lng/i);
  });
});
