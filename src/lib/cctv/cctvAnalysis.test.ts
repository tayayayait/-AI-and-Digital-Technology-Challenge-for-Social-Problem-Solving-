import { describe, expect, test } from "vitest";

import {
  canRequestCctvAnalysis,
  parseCctvAnalysisResponse,
  selectRelevantCctvEvidence,
  type CctvAnalysisResult,
} from "./cctvAnalysis";

const result = (
  cameraId: string,
  overrides: Partial<CctvAnalysisResult> = {},
): CctvAnalysisResult => ({
  cameraId,
  cameraName: `${cameraId} CCTV`,
  position: { lat: 36.1195, lng: 128.3446 },
  flooded: true,
  depthGrade: "SHALLOW",
  passable: true,
  confidence: 0.9,
  observation: "노면에 얕은 물고임이 보입니다.",
  frameDataUrl: "data:image/jpeg;base64,YWJj",
  analyzedAt: "2026-09-03T05:00:00.000Z",
  expiresAt: "2026-09-03T05:10:00.000Z",
  ...overrides,
});

describe("client CCTV analysis", () => {
  test("Edge Function의 신뢰 가능한 구조화 응답을 파싱한다", () => {
    const analysis = result("cam-1");
    expect(
      parseCctvAnalysisResponse({ status: "OK", cached: false, analysis, durationMs: 420 }),
    ).toEqual({ status: "OK", cached: false, analysis, durationMs: 420 });
    expect(() =>
      parseCctvAnalysisResponse({
        status: "OK",
        cached: false,
        analysis: { ...analysis, confidence: 2 },
      }),
    ).toThrow();
  });

  test("10분 이내·2km 이내·신뢰도 0.7 이상인 가장 강한 근거만 선택한다", () => {
    const evidence = selectRelevantCctvEvidence(
      [
        result("low", { confidence: 0.69, depthGrade: "IMPASSABLE" }),
        result("far", {
          position: { lat: 36.15, lng: 128.3446 },
          depthGrade: "IMPASSABLE",
        }),
        result("expired", {
          depthGrade: "IMPASSABLE",
          expiresAt: "2026-09-03T04:59:59.000Z",
        }),
        result("deep", { confidence: 0.71, depthGrade: "DEEP", passable: false }),
        result("shallow", { confidence: 0.99, depthGrade: "SHALLOW" }),
      ],
      { lat: 36.1195, lng: 128.3446 },
      Date.parse("2026-09-03T05:00:00.000Z"),
    );

    expect(evidence?.cameraId).toBe("deep");
    expect(evidence?.depthGrade).toBe("DEEP");
  });

  test("담당자 요청 또는 WARNING 이상이면서 2km 이내인 경우에만 판독을 허용한다", () => {
    expect(canRequestCctvAnalysis({ requestedByOperator: true })).toBe(true);
    expect(canRequestCctvAnalysis({ riskLevel: "WARNING", distanceMeters: 2_000 })).toBe(true);
    expect(canRequestCctvAnalysis({ riskLevel: "CRITICAL", distanceMeters: 1_999 })).toBe(true);
    expect(canRequestCctvAnalysis({ riskLevel: "WATCH", distanceMeters: 500 })).toBe(false);
    expect(canRequestCctvAnalysis({ riskLevel: "WARNING", distanceMeters: 2_001 })).toBe(false);
    expect(canRequestCctvAnalysis({ riskLevel: "WARNING" })).toBe(false);
  });
});
