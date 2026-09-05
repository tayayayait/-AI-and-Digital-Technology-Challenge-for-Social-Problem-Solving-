import { describe, expect, test } from "vitest";

import { buildRiskNotificationCopy, RENOTIFY_COOLDOWN_MS, shouldNotify } from "./riskNotification";

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

describe("buildRiskNotificationCopy", () => {
  test("미래 위험 알림을 예상으로 표시하고 전망 화면으로 연결한다", () => {
    expect(
      buildRiskNotificationCopy({
        level: "WARNING",
        forecastAt: "2026-09-05T19:00:00+09:00",
      }),
    ).toEqual({
      title: "6시간 내 침수 위험 경계 예상",
      body: "19시경 위험 상승이 예상됩니다. 대피소와 이동 경로를 미리 확인하세요.",
      url: "/forecast",
      tag: "flood-forecast-warning",
    });
  });

  test("현재 위험 알림은 즉시 행동 화면으로 연결한다", () => {
    expect(buildRiskNotificationCopy({ level: "CRITICAL" })).toMatchObject({
      title: "침수 위험 심각",
      url: "/routes",
      tag: "flood-risk-critical",
    });
  });
});
