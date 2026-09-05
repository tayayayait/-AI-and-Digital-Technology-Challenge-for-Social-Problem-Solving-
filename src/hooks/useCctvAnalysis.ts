import { useCallback, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { CctvFeed } from "@/lib/api/cctvInfo";
import {
  canRequestCctvAnalysis,
  parseCctvAnalysisResponse,
  type CctvAnalysisRequestContext,
  type CctvAnalysisResponse,
} from "@/lib/cctv/cctvAnalysis";
import { captureCctvFrame } from "@/lib/cctv/captureFrame";
import { useCctvAnalysisStore } from "@/store/cctvAnalysis";

interface CctvAnalysisRequest {
  camera: {
    id: string;
    name: string;
    position: CctvFeed["position"];
    streamUrl: string;
  };
  frameDataUrl: string;
}

type CaptureFrame = (streamUrl: string) => Promise<string>;
type InvokeAnalysis = (request: CctvAnalysisRequest) => Promise<unknown>;
type RefreshCamera = (cameraId: string) => Promise<CctvFeed | null>;

interface UseCctvAnalysisOptions {
  captureFrame?: CaptureFrame;
  invoke?: InvokeAnalysis;
  refreshCamera?: RefreshCamera;
}

const invokeCctvAnalysis: InvokeAnalysis = async (request) => {
  const { data, error } = await supabase.functions.invoke("cctv-analyze", {
    body: request,
  });
  if (error) throw new Error(error.message);
  return data;
};

const isExpiredStreamError = (error: unknown) =>
  error instanceof Error && /(?:401|unauthori[sz]ed|token.*(?:expired|만료))/i.test(error.message);

const analysisMessage = (response: CctvAnalysisResponse) => {
  if (response.message) return response.message;
  if (response.status === "LOW_CONFIDENCE") {
    return "영상 판독 신뢰도가 70% 미만이어서 결과를 반영하지 않았습니다.";
  }
  if (response.status === "DAILY_LIMIT") {
    return "오늘의 CCTV AI 판독 호출 상한에 도달했습니다.";
  }
  return undefined;
};

const userFacingError = (error: unknown) => {
  if (error instanceof Error && error.message.startsWith("CCTV")) return error.message;
  return "CCTV AI 판독을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
};

export function useCctvAnalysis({
  captureFrame = captureCctvFrame,
  invoke = invokeCctvAnalysis,
  refreshCamera,
}: UseCctvAnalysisOptions = {}) {
  const analysisByCamera = useCctvAnalysisStore((state) => state.analyses);
  const record = useCctvAnalysisStore((state) => state.record);
  const [pendingCameraId, setPendingCameraId] = useState<string | null>(null);
  const [messageByCamera, setMessageByCamera] = useState<Record<string, string>>({});

  const setMessage = useCallback((cameraId: string, message?: string) => {
    setMessageByCamera((current) => {
      if (message) return { ...current, [cameraId]: message };
      if (!(cameraId in current)) return current;
      const next = { ...current };
      delete next[cameraId];
      return next;
    });
  }, []);

  const analyze = useCallback(
    async (camera: CctvFeed, context: CctvAnalysisRequestContext = {}) => {
      if (!canRequestCctvAnalysis(context)) {
        setMessage(
          camera.id,
          "CCTV AI 판독 요청 조건을 충족하지 않았습니다. 담당자 요청 또는 경보 지역 2km 이내에서 사용할 수 있습니다.",
        );
        return null;
      }

      setPendingCameraId(camera.id);
      setMessage(camera.id);
      try {
        let activeCamera = camera;
        let frameDataUrl: string;
        try {
          frameDataUrl = await captureFrame(activeCamera.streamUrl);
        } catch (error) {
          if (!refreshCamera || !isExpiredStreamError(error)) throw error;
          const refreshed = await refreshCamera(camera.id);
          if (!refreshed) throw error;
          activeCamera = refreshed;
          frameDataUrl = await captureFrame(activeCamera.streamUrl);
        }

        const response = parseCctvAnalysisResponse(
          await invoke({
            camera: {
              id: activeCamera.id,
              name: activeCamera.name,
              position: activeCamera.position,
              streamUrl: activeCamera.streamUrl,
            },
            frameDataUrl,
          }),
        );

        if (response.analysis) record(response.analysis);
        setMessage(camera.id, analysisMessage(response));
        return response;
      } catch (error) {
        setMessage(camera.id, userFacingError(error));
        return null;
      } finally {
        setPendingCameraId((current) => (current === camera.id ? null : current));
      }
    },
    [captureFrame, invoke, record, refreshCamera, setMessage],
  );

  return {
    analysisByCamera,
    pendingCameraId,
    messageByCamera,
    analyze,
  };
}
