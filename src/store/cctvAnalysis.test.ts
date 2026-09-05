import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CctvAnalysisResult } from "@/lib/cctv/cctvAnalysis";
import { useCctvAnalysisStore } from "./cctvAnalysis";

const analysis = (
  cameraId: string,
  overrides: Partial<CctvAnalysisResult> = {},
): CctvAnalysisResult => ({
  cameraId,
  cameraName: `${cameraId} CCTV`,
  position: { lat: 36.1195, lng: 128.3446 },
  flooded: false,
  depthGrade: "NONE",
  passable: true,
  confidence: 0.91,
  observation: "노면 침수 징후가 보이지 않습니다.",
  frameDataUrl: "data:image/jpeg;base64,YWJj",
  analyzedAt: "2026-09-03T05:00:00.000Z",
  expiresAt: "2026-09-03T05:10:00.000Z",
  ...overrides,
});

describe("cctvAnalysis store", () => {
  beforeEach(() => {
    useCctvAnalysisStore.getState().reset();
  });

  test("신뢰도 기준을 충족한 판독만 메모리에 보관하고 브라우저 저장소에는 쓰지 않는다", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const store = useCctvAnalysisStore.getState();

    store.record(analysis("trusted"), Date.parse("2026-09-03T05:00:00.000Z"));
    store.record(
      analysis("uncertain", { confidence: 0.69 }),
      Date.parse("2026-09-03T05:00:00.000Z"),
    );

    expect(Object.keys(useCctvAnalysisStore.getState().analyses)).toEqual(["trusted"]);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  test("만료된 원본 프레임과 판독 결과를 제거한다", () => {
    const store = useCctvAnalysisStore.getState();
    store.record(analysis("old"), Date.parse("2026-09-03T05:00:00.000Z"));
    store.record(
      analysis("fresh", {
        analyzedAt: "2026-09-03T05:09:00.000Z",
        expiresAt: "2026-09-03T05:19:00.000Z",
      }),
      Date.parse("2026-09-03T05:09:00.000Z"),
    );

    store.pruneExpired(Date.parse("2026-09-03T05:10:00.000Z"));

    expect(Object.keys(useCctvAnalysisStore.getState().analyses)).toEqual(["fresh"]);
  });
});
