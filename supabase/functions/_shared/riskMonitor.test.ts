import { describe, expect, test } from "vitest";

import {
  calculateMonitoredRisk,
  forEachWithConcurrency,
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
});
