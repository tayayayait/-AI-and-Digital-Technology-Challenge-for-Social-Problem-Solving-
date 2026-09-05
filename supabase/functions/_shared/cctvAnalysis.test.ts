import { describe, expect, test } from "vitest";

import {
  CCTV_ANALYSIS_CONFIDENCE_THRESHOLD,
  cctvFloodEvidenceScore,
  parseCctvAnalyzeRequest,
  parseCctvAnalysis,
  readCctvAnalysisDailyLimit,
  reliableCctvAnalysis,
} from "./cctvAnalysis";

const analysis = (confidence: number, depthGrade = "SHALLOW") => ({
  flooded: depthGrade !== "NONE",
  depthGrade,
  passable: depthGrade !== "IMPASSABLE",
  confidence,
  observation: "차로 일부에 물이 고여 있습니다.",
});

describe("CCTV Gemini analysis", () => {
  test("구조화된 판독 결과를 엄격하게 파싱한다", () => {
    expect(parseCctvAnalysis(analysis(0.91, "DEEP"))).toEqual(analysis(0.91, "DEEP"));
    expect(() => parseCctvAnalysis({ ...analysis(0.91), passable: "yes" })).toThrow(
      "Invalid CCTV analysis",
    );
    expect(() => parseCctvAnalysis(analysis(1.1))).toThrow("Invalid CCTV analysis");
  });

  test("신뢰도 0.70부터 채택하고 0.69는 폐기한다", () => {
    expect(CCTV_ANALYSIS_CONFIDENCE_THRESHOLD).toBe(0.7);
    expect(reliableCctvAnalysis(analysis(0.69))).toBeNull();
    expect(reliableCctvAnalysis(analysis(0.7))?.confidence).toBe(0.7);
    expect(reliableCctvAnalysis(analysis(0.71))?.confidence).toBe(0.71);
  });

  test("수심 등급별 가산 점수를 0/5/10/15점으로 매핑한다", () => {
    expect(cctvFloodEvidenceScore(analysis(0.9, "NONE"))).toBe(0);
    expect(cctvFloodEvidenceScore(analysis(0.9, "SHALLOW"))).toBe(5);
    expect(cctvFloodEvidenceScore(analysis(0.9, "DEEP"))).toBe(10);
    expect(cctvFloodEvidenceScore(analysis(0.9, "IMPASSABLE"))).toBe(15);
    expect(cctvFloodEvidenceScore(analysis(0.69, "IMPASSABLE"))).toBe(0);
  });

  test("카메라 메타데이터와 안전한 이미지 data URL만 허용한다", () => {
    expect(
      parseCctvAnalyzeRequest({
        camera: {
          id: "cam-1",
          name: "구미대교 CCTV",
          streamUrl: "https://example.test/live.m3u8",
          position: { lat: 36.1195, lng: 128.3446 },
        },
        frameDataUrl: "data:image/jpeg;base64,YWJj",
      }),
    ).toMatchObject({
      camera: { id: "cam-1", position: { lat: 36.1195, lng: 128.3446 } },
      frame: { mimeType: "image/jpeg", data: "YWJj" },
    });

    expect(() =>
      parseCctvAnalyzeRequest({
        camera: { id: "cam-1", name: "CCTV" },
        frameDataUrl: "data:image/svg+xml;base64,YWJj",
      }),
    ).toThrow("Invalid CCTV analysis request");
  });

  test("일일 호출 상한은 기본 100회이며 1~1000 사이 정수만 허용한다", () => {
    expect(readCctvAnalysisDailyLimit(undefined)).toBe(100);
    expect(readCctvAnalysisDailyLimit("250")).toBe(250);
    expect(readCctvAnalysisDailyLimit("0")).toBe(100);
    expect(readCctvAnalysisDailyLimit("1001")).toBe(100);
  });
});
