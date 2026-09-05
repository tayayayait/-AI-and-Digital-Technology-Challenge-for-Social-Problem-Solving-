import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const STATUS_DOC = "docs/implementation-verification.md";

describe("implementation documentation and CI contracts", () => {
  test("summarizes every completed implementation phase", () => {
    expect(existsSync(STATUS_DOC)).toBe(true);
    if (!existsSync(STATUS_DOC)) return;

    const contents = readFileSync(STATUS_DOC, "utf8");
    for (let phase = 1; phase <= 7; phase += 1) {
      expect(contents).toContain(`Phase ${phase}`);
    }
  });

  test("documents the accessibility route and region-neutral fallback behavior", () => {
    const api = readFileSync("docs/api-integrations.md", "utf8");
    const ui = readFileSync("docs/ui-routing.md", "utf8");

    expect(api).toContain("searchOption=30");
    expect(api).toContain("계단 정보 없음");
    expect(api).toContain("빈 목록");
    expect(api).not.toContain("호출 실패, 파싱 실패, 서비스키 누락 시 앱은 demo fallback");
    expect(ui).toContain("이동약자 모드");
    expect(ui).toContain("45m/분");
  });

  test("keeps Web Push deployment and cron secrets documented", () => {
    const api = readFileSync("docs/api-integrations.md", "utf8");

    expect(api).toContain("push-subscribe");
    expect(api).toContain("push-notify");
    expect(api).toContain("risk-monitor");
    expect(api).toContain("RISK_MONITOR_CRON_SECRET");
    expect(api).toContain("risk_monitor_cron_secret");
    expect(api).not.toContain("`FCM_SERVER_KEY`");
  });

  test("runs lint, typecheck, and tests as required CI steps", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(ci).toContain("pnpm install --frozen-lockfile");
    expect(ci).toContain("pnpm run lint");
    expect(ci).toContain("tsc --noEmit");
    expect(ci).toContain("pnpm test");
    expect(ci).not.toContain("continue-on-error");
  });
});
