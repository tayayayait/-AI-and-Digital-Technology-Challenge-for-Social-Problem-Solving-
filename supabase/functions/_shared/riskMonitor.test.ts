import { describe, expect, test } from "vitest";

import {
  calculateMonitoredRisk,
  calculateMonitoredRiskState,
  forEachWithConcurrency,
  getKmaUltraForecastBase,
  groupSubscriptionsByGrid,
} from "./riskMonitor";

describe("groupSubscriptionsByGrid", () => {
  test("좌표를 소수점 2자리 격자로 묶어 같은 위치 계산을 공유한다", () => {
    const groups = groupSubscriptionsByGrid([
      { id: "a", region_lat: 37.501, region_lng: 127.021 },
      { id: "b", region_lat: 37.504, region_lng: 127.024 },
      { id: "c", region_lat: 37.516, region_lng: 127.026 },
    ]);

    expect([...groups.keys()]).toEqual(["37.50,127.02", "37.52,127.03"]);
    expect(groups.get("37.50,127.02")?.map((row) => row.id)).toEqual(["a", "b"]);
  });

  test("한 번에 최대 1,000건만 그룹화한다", () => {
    const rows = Array.from({ length: 1_005 }, (_, index) => ({
      id: String(index),
      region_lat: 37.5,
      region_lng: 127.02,
    }));

    expect(groupSubscriptionsByGrid(rows).get("37.50,127.02")).toHaveLength(1_000);
  });

  test("1,000건을 제한된 전역 동시성으로 처리한다", async () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => index);
    let active = 0;
    let maxActive = 0;
    let processed = 0;

    await forEachWithConcurrency(rows, 20, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      processed += 1;
      active -= 1;
    });

    expect(processed).toBe(1_000);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(20);
  });
});

describe("calculateMonitoredRisk", () => {
  test("기상과 센서 두 데이터가 모두 실패하면 UNKNOWN이다", () => {
    expect(calculateMonitoredRisk({ weather: null, sensors: null, failedSources: 2 })).toBe(
      "UNKNOWN",
    );
  });

  test("심각 수위 센서는 CRITICAL로 판정한다", () => {
    expect(
      calculateMonitoredRisk({
        weather: { rainfallMmPerHour: 0 },
        sensors: [{ status: "ACTIVE", riskLevel: "CRITICAL" }],
        failedSources: 0,
      }),
    ).toBe("CRITICAL");
  });

  test("현재 위험과 더 높은 시간대별 예상 위험을 구분한다", () => {
    expect(
      calculateMonitoredRiskState({
        weather: {
          rainfallMmPerHour: 0,
          hourlyForecast: [
            {
              forecastAt: "2026-09-05T19:00:00+09:00",
              rainfallMmPerHour: 30,
            },
          ],
        },
        sensors: [{ status: "ACTIVE", riskLevel: "WATCH" }],
        failedSources: 0,
      }),
    ).toEqual({
      currentLevel: "WATCH",
      alertLevel: "WARNING",
      forecastAt: "2026-09-05T19:00:00+09:00",
    });
  });
});

describe("KMA forecast base", () => {
  test("초단기예보 발표 지연 45분과 자정 경계를 적용한다", () => {
    expect(getKmaUltraForecastBase(new Date("2026-06-10T15:44:00.000Z"))).toEqual({
      forecastBaseDate: "20260610",
      forecastBaseTime: "2330",
    });
    expect(getKmaUltraForecastBase(new Date("2026-06-10T15:45:00.000Z"))).toEqual({
      forecastBaseDate: "20260611",
      forecastBaseTime: "0030",
    });
  });
});
