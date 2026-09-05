import { describe, expect, test } from "vitest";

import { RENOTIFY_COOLDOWN_MS, shouldNotify } from "./riskNotification";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");

const decide = (overrides: Partial<Parameters<typeof shouldNotify>[0]> = {}) =>
  shouldNotify({
    currentLevel: "WARNING",
    lastNotifiedLevel: null,
    lastNotifiedAt: null,
    threshold: "WARNING",
    now: NOW,
    ...overrides,
  });

describe("shouldNotify", () => {
  test("위험이 임계값에 처음 도달하면 발송한다", () => {
    expect(decide()).toBe(true);
  });

  test("WATCH에서 WARNING으로 상승하면 발송한다", () => {
    expect(decide({ lastNotifiedLevel: "WATCH" })).toBe(true);
  });

  test("WARNING에서 WATCH로 하락하면 발송하지 않는다", () => {
    expect(
      decide({
        currentLevel: "WATCH",
        lastNotifiedLevel: "WARNING",
        threshold: "WATCH",
      }),
    ).toBe(false);
  });

  test("같은 등급이 59분 유지되면 재발송하지 않는다", () => {
    expect(
      decide({
        lastNotifiedLevel: "WARNING",
        lastNotifiedAt: new Date(NOW - 59 * 60 * 1000).toISOString(),
      }),
    ).toBe(false);
  });

  test("같은 등급이 61분 유지되면 재발송한다", () => {
    expect(
      decide({
        lastNotifiedLevel: "WARNING",
        lastNotifiedAt: new Date(NOW - 61 * 60 * 1000).toISOString(),
      }),
    ).toBe(true);
    expect(RENOTIFY_COOLDOWN_MS).toBe(60 * 60 * 1000);
  });

  test("사용자 임계값 미만이면 발송하지 않는다", () => {
    expect(decide({ currentLevel: "WATCH", threshold: "WARNING" })).toBe(false);
  });

  test("UNKNOWN은 어떤 경우에도 발송하지 않는다", () => {
    expect(decide({ currentLevel: "UNKNOWN", threshold: "WATCH" })).toBe(false);
  });
});
