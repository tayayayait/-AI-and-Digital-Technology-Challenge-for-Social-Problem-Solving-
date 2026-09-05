import { describe, expect, test } from "vitest";
import { calculateRiskScore } from "./calculateRiskScore";
import type { RiskCalculationInput } from "@/lib/types";

describe("calculateRiskScore", () => {
  const baseInput = {
    weather: { rainfallMmPerHour: 0 },
    forecast: { rainfallMmPerHour: 0 },
    floodTrace: false,
    floodTraceOverlap: 0,
    riverFlood: false,
    riverFloodOverlap: 0,
    disasterMessages: [],
    hasUnderpass: false,
    trafficControl: false,
    failedDataCount: 0,
  };

  test("calculates weather score correctly based on limits", () => {
    // 0mm = 0 score
    expect(
      calculateRiskScore({
        ...baseInput,
        weather: { rainfallMmPerHour: 0 },
      }).weather,
    ).toBe(0);

    // 15mm = Math.round(30 * (15 / 30)) = 15 score
    expect(
      calculateRiskScore({
        ...baseInput,
        weather: { rainfallMmPerHour: 15 },
      }).weather,
    ).toBe(15);

    // 30mm = 30 score
    expect(
      calculateRiskScore({
        ...baseInput,
        weather: { rainfallMmPerHour: 30 },
      }).weather,
    ).toBe(30);

    // 50mm = 30 score (capped)
    expect(
      calculateRiskScore({
        ...baseInput,
        weather: { rainfallMmPerHour: 50 },
      }).weather,
    ).toBe(30);
  });

  test("calculates floodTrace score using overlap ratio", () => {
    // 0% overlap = 0 score
    expect(calculateRiskScore({ ...baseInput, floodTraceOverlap: 0 }).floodTrace).toBe(0);

    // 50% overlap = Math.round(25 * 0.5) = 13
    expect(calculateRiskScore({ ...baseInput, floodTraceOverlap: 0.5 }).floodTrace).toBe(13);

    // 100% overlap = 25
    expect(calculateRiskScore({ ...baseInput, floodTraceOverlap: 1 }).floodTrace).toBe(25);
  });

  test("returns UNKNOWN level if 2 or more data sources failed", () => {
    const result = calculateRiskScore({
      ...baseInput,
      failedDataCount: 2,
    });
    expect(result.level).toBe("UNKNOWN");
    expect(result.total).toBe(-1);
  });

  test("raises risk to CRITICAL when HRFCO water level reaches serious threshold", () => {
    const result = calculateRiskScore({
      ...baseInput,
      sensors: [
        {
          id: "hrfco-waterlevel-1018683",
          status: "ACTIVE",
          type: "WATER_LEVEL",
          currentLevel: 6.1,
          attentionLevel: 3.9,
          warningLevel: 4.5,
          alarmLevel: 5.5,
          seriousLevel: 6,
          riskLevel: "CRITICAL",
        },
      ],
    });

    expect(result.riverFlood).toBe(80);
    expect(result.level).toBe("CRITICAL");
    expect(result.reasons).toContain("실시간 수위·홍수예보 위험");
  });

  test("uses HRFCO hourly rainfall as early warning weather input", () => {
    const result = calculateRiskScore({
      ...baseInput,
      sensors: [
        {
          id: "hrfco-rainfall-10184100",
          status: "ACTIVE",
          type: "RAINFALL",
          currentRainfallMmPerHour: 32,
          riskLevel: "WARNING",
        },
      ],
    });

    expect(result.weather).toBe(30);
    expect(result.level).toBe("WATCH");
  });

  test("uses active HRFCO sensor data instead of UNKNOWN when weather data is missing", () => {
    const result = calculateRiskScore({
      ...baseInput,
      weather: null,
      forecast: null,
      sensors: [
        {
          id: "hrfco-waterlevel-1018683",
          status: "ACTIVE",
          type: "WATER_LEVEL",
          currentLevel: 6.1,
          seriousLevel: 6,
          riskLevel: "CRITICAL",
        },
      ],
    });

    expect(result.total).toBe(80);
    expect(result.level).toBe("CRITICAL");
  });

  test("adds five points and uses the actual traffic-control title", () => {
    const result = calculateRiskScore({
      ...baseInput,
      trafficControl: true,
      trafficControlTitle: "강남대로 침수 통제중",
    });

    expect(result.trafficControl).toBe(5);
    expect(result.total).toBe(5);
    expect(result.reasons).toContain("강남대로 침수 통제중");
  });

  test("does not treat a location name alone as disaster evidence", () => {
    const result = calculateRiskScore({
      ...baseInput,
      disasterMessages: [
        {
          region: "서울 강남구",
          body: "생활 안전 정보를 확인하세요.",
          issuedAt: "2026-09-03T00:00:00.000Z",
          source: "MOIS",
        },
      ],
    });

    expect(result.disasterMessages).toBe(0);
  });

  test.each([
    ["NONE", 0],
    ["SHALLOW", 5],
    ["DEEP", 10],
    ["IMPASSABLE", 15],
  ] as const)("adds %s CCTV evidence as %i points", (depthGrade, expected) => {
    const result = calculateRiskScore({
      ...baseInput,
      cctvFloodEvidence: { depthGrade, confidence: 0.9 },
    });

    expect(result.cctvFlood).toBe(expected);
    expect(result.total).toBe(expected);
    expect(result.level).toBe("SAFE");
  });

  test.each([
    [0.69, 0],
    [0.7, 15],
    [0.71, 15],
  ])("applies the CCTV confidence boundary at %s", (confidence, expected) => {
    expect(
      calculateRiskScore({
        ...baseInput,
        cctvFloodEvidence: { depthGrade: "IMPASSABLE", confidence },
      }).cctvFlood,
    ).toBe(expected);
  });
});

describe("기상특보 반영", () => {
  const base: RiskCalculationInput = {
    weather: { rainfallMmPerHour: 0, alerts: [] },
    forecast: { rainfallMmPerHour: 0, alerts: [] },
    floodTrace: false,
    riverFlood: false,
    disasterMessages: [],
    hasUnderpass: false,
    trafficControl: false,
  };

  test("특보가 없으면 강우 점수만 반영한다", () => {
    expect(calculateRiskScore(base).weather).toBe(0);
  });

  test("호우주의보는 강우 관측이 0이어도 점수를 올린다", () => {
    const result = calculateRiskScore({
      ...base,
      floodWarningLevel: "WARNING",
      floodWarningTitle: "호우주의보",
    });
    expect(result.weather).toBe(22);
    expect(result.reasons).toContain("호우주의보");
  });

  test("호우경보는 기상 항목을 최대로 올린다", () => {
    expect(calculateRiskScore({ ...base, floodWarningLevel: "CRITICAL" }).weather).toBe(30);
  });

  test("강우 실황이 특보 가중치보다 높으면 실황을 쓴다", () => {
    const result = calculateRiskScore({
      ...base,
      weather: { rainfallMmPerHour: 30, alerts: [] },
      floodWarningLevel: "WATCH",
    });
    expect(result.weather).toBe(30);
  });

  test("특보명이 없으면 기존 문구로 되돌아간다", () => {
    const result = calculateRiskScore({ ...base, floodWarningLevel: "WARNING" });
    expect(result.reasons).toContain("강우·예보 위험");
  });
});
