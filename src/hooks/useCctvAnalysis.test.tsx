import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CctvFeed } from "@/lib/api/cctvInfo";
import type { CctvAnalysisResult } from "@/lib/cctv/cctvAnalysis";
import { useCctvAnalysisStore } from "@/store/cctvAnalysis";
import { useCctvAnalysis } from "./useCctvAnalysis";

const camera: CctvFeed = {
  id: "camera-1",
  cctvType: "4",
  streamUrl: "https://cctv.example.test/old.m3u8",
  position: { lat: 36.1195, lng: 128.3446 },
  format: "HLS",
  name: "구미대교 CCTV",
  source: "ITS cctvInfo",
};

const trustedAnalysis: CctvAnalysisResult = {
  cameraId: camera.id,
  cameraName: camera.name,
  position: camera.position,
  flooded: true,
  depthGrade: "SHALLOW",
  passable: true,
  confidence: 0.88,
  observation: "차로 가장자리에 얕은 물고임이 보입니다.",
  frameDataUrl: "data:image/jpeg;base64,YWJj",
  analyzedAt: "2099-09-03T05:00:00.000Z",
  expiresAt: "2099-09-03T05:10:00.000Z",
};

describe("useCctvAnalysis", () => {
  beforeEach(() => {
    useCctvAnalysisStore.getState().reset();
  });

  test("담당자의 명시적 요청에서 프레임을 캡처하고 구조화 판독을 저장한다", async () => {
    const captureFrame = vi.fn().mockResolvedValue("data:image/jpeg;base64,YWJj");
    const invoke = vi.fn().mockResolvedValue({
      status: "OK",
      cached: false,
      analysis: trustedAnalysis,
      durationMs: 310,
    });
    const { result } = renderHook(() => useCctvAnalysis({ captureFrame, invoke }));

    await act(async () => {
      await result.current.analyze(camera, { requestedByOperator: true });
    });

    expect(captureFrame).toHaveBeenCalledWith(camera.streamUrl);
    expect(invoke).toHaveBeenCalledWith({
      camera: {
        id: camera.id,
        name: camera.name,
        position: camera.position,
        streamUrl: camera.streamUrl,
      },
      frameDataUrl: "data:image/jpeg;base64,YWJj",
    });
    expect(result.current.analysisByCamera[camera.id]).toEqual(trustedAnalysis);
    expect(result.current.pendingCameraId).toBeNull();
    expect(result.current.messageByCamera[camera.id]).toBeUndefined();
  });

  test("신뢰도 미달 응답은 저장하지 않고 안내만 노출한다", async () => {
    const invoke = vi.fn().mockResolvedValue({
      status: "LOW_CONFIDENCE",
      cached: false,
      analysis: null,
      message: "영상이 흐려 판독 신뢰도가 부족합니다.",
    });
    const { result } = renderHook(() =>
      useCctvAnalysis({
        captureFrame: vi.fn().mockResolvedValue("data:image/jpeg;base64,YWJj"),
        invoke,
      }),
    );

    await act(async () => {
      await result.current.analyze(camera, { requestedByOperator: true });
    });

    expect(result.current.analysisByCamera[camera.id]).toBeUndefined();
    expect(result.current.messageByCamera[camera.id]).toContain("신뢰도");
  });

  test("자동 요청은 WARNING 이상이면서 2km 이내가 아니면 차단한다", async () => {
    const invoke = vi.fn();
    const captureFrame = vi.fn();
    const { result } = renderHook(() => useCctvAnalysis({ captureFrame, invoke }));

    await act(async () => {
      await result.current.analyze(camera, {
        riskLevel: "WATCH",
        distanceMeters: 500,
      });
    });

    expect(captureFrame).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.messageByCamera[camera.id]).toContain("요청 조건");
  });

  test("HLS 토큰 만료 오류이면 카메라를 재조회한 뒤 한 번 다시 캡처한다", async () => {
    const refreshedCamera = {
      ...camera,
      streamUrl: "https://cctv.example.test/refreshed.m3u8",
    };
    const captureFrame = vi
      .fn()
      .mockRejectedValueOnce(new Error("401 Unauthorized"))
      .mockResolvedValueOnce("data:image/jpeg;base64,YWJj");
    const refreshCamera = vi.fn().mockResolvedValue(refreshedCamera);
    const invoke = vi.fn().mockResolvedValue({
      status: "OK",
      cached: false,
      analysis: trustedAnalysis,
    });
    const { result } = renderHook(() => useCctvAnalysis({ captureFrame, invoke, refreshCamera }));

    await act(async () => {
      await result.current.analyze(camera, { requestedByOperator: true });
    });

    expect(refreshCamera).toHaveBeenCalledWith(camera.id);
    expect(captureFrame).toHaveBeenNthCalledWith(1, camera.streamUrl);
    expect(captureFrame).toHaveBeenNthCalledWith(2, refreshedCamera.streamUrl);
    expect(invoke).toHaveBeenCalledOnce();
  });
});
