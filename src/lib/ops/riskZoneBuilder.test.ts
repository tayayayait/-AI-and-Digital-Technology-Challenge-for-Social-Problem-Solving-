import { describe, expect, test, vi } from "vitest";

import { createBoundsFromCenter } from "@/lib/map/wms";
import type { RiskZone } from "@/lib/types";
import {
  buildRiskZones,
  RISK_GRID_SIZE_METERS,
  selectTopRiskZones,
  splitBoundsIntoGrid,
  type RiskZoneOverlapCache,
} from "./riskZoneBuilder";

const center = { lat: 35.1631, lng: 129.1635 };
const bounds = createBoundsFromCenter(center, 500);

const baseSignals = {
  weather: { rainfallMmPerHour: 0 },
  forecast: { rainfallMmPerHour: 0 },
  disasterMessages: [],
  sensors: [],
  trafficEvents: [],
  floodWarningLevel: null,
  failedDataCount: 0,
};

const zone = (id: string, level: RiskZone["level"]): RiskZone => ({
  id,
  name: id,
  level,
  polygon: [
    [129.16, 35.16],
    [129.17, 35.16],
    [129.17, 35.17],
    [129.16, 35.17],
  ],
  reasons: [id],
});

describe("risk zone grid", () => {
  test("관심 영역을 약 500m 격자로 분할한다", () => {
    const cells = splitBoundsIntoGrid(bounds, RISK_GRID_SIZE_METERS);

    expect(cells).toHaveLength(4);
    expect(cells.every((cell) => cell.polygon.length === 4)).toBe(true);
    expect(cells[0]?.center.lat).toBeGreaterThanOrEqual(bounds.south);
    expect(cells[0]?.center.lng).toBeGreaterThanOrEqual(bounds.west);
  });

  test("위험 점수 순으로 안전 구역을 제외하고 상위 N개만 선택한다", () => {
    const selected = selectTopRiskZones(
      [
        { zone: zone("safe", "SAFE"), score: 0 },
        { zone: zone("watch", "WATCH"), score: 30 },
        { zone: zone("warning", "WARNING"), score: 59 },
        { zone: zone("critical", "CRITICAL"), score: 86 },
      ],
      2,
    );

    expect(selected.map((item) => item.id)).toEqual(["critical", "warning"]);
  });

  test("위험 점수가 모두 0이면 정상 빈 결과를 반환한다", async () => {
    const fetchFeatureInfo = vi.fn().mockResolvedValue({ overlap: 0, features: [] });

    const result = await buildRiskZones({
      bounds,
      regionName: "부산 해운대구",
      signals: baseSignals,
      fetchFeatureInfo,
    });

    expect(result.status).toBe("EMPTY");
    expect(result.zones).toEqual([]);
  });

  test("격자별 WMS 중첩률로 점수를 계산하고 상위 5개만 반환한다", async () => {
    const wideBounds = createBoundsFromCenter(center, 1_000);
    const fetchFeatureInfo = vi.fn(({ layer }: { layer: string }) =>
      Promise.resolve({
        overlap: layer === "A2SM_FLUDMARKS" ? 1 : 0,
        features: [],
      }),
    );

    const result = await buildRiskZones({
      bounds: wideBounds,
      regionName: "부산 해운대구",
      signals: baseSignals,
      fetchFeatureInfo,
    });

    expect(result.status).toBe("READY");
    expect(result.zones).toHaveLength(5);
    expect(result.zones.every((item) => item.reasons.includes("침수흔적 중첩"))).toBe(true);
    expect(result.zones.every((item) => item.name.startsWith("부산 해운대구"))).toBe(true);
  });

  test("모든 격자의 WMS 조회가 실패하면 목데이터로 대체하지 않는다", async () => {
    const fetchFeatureInfo = vi.fn().mockRejectedValue(new Error("WMS unavailable"));

    const result = await buildRiskZones({
      bounds,
      regionName: "부산 해운대구",
      signals: baseSignals,
      fetchFeatureInfo,
    });

    expect(result.status).toBe("FAILED");
    expect(result.zones).toEqual([]);
    expect(result.failedCells).toBe(result.sampledCells);
  });

  test("같은 격자 WMS 중첩률을 10분 동안 재사용한다", async () => {
    const fetchFeatureInfo = vi.fn().mockResolvedValue({ overlap: 0.5, features: [] });
    const cache: RiskZoneOverlapCache = new Map();
    const options = {
      bounds,
      regionName: "부산 해운대구",
      signals: baseSignals,
      fetchFeatureInfo,
      cache,
      now: () => 1_000,
    };

    await buildRiskZones(options);
    await buildRiskZones(options);

    expect(fetchFeatureInfo).toHaveBeenCalledTimes(8);
  });

  test("전체 조회가 시간 초과되면 더 적은 격자로 한 번 재시도한다", async () => {
    const initialCellCount = splitBoundsIntoGrid(bounds).length;
    const fetchFeatureInfo = vi.fn(({ layer }: { layer: string }) => {
      if (fetchFeatureInfo.mock.calls.length <= 2) {
        return new Promise<{ overlap: number; features: unknown[] }>(() => undefined);
      }
      return Promise.resolve({
        overlap: layer === "A2SM_FLUDMARKS" ? 1 : 0,
        features: [],
      });
    });

    const build = buildRiskZones({
      bounds,
      regionName: "부산 해운대구",
      signals: baseSignals,
      fetchFeatureInfo,
      concurrency: 1,
      attemptTimeoutMs: 10,
      retryCellLimit: 2,
    });
    const result = await Promise.race([
      build,
      new Promise<"timed-out">((resolve) => {
        setTimeout(() => resolve("timed-out"), 100);
      }),
    ]);

    expect(result).not.toBe("timed-out");
    if (result === "timed-out") return;
    expect(result.status).toBe("READY");
    expect(result.sampledCells).toBe(2);
    expect(result.sampledCells).toBeLessThan(initialCellCount);
    expect(fetchFeatureInfo).toHaveBeenCalledTimes(6);
  });
});
