import { create } from "zustand";

import type { ApiHealthStatus } from "@/hooks/useApiStatus";
import type { ApiResult, ApiStatus } from "@/lib/api/types";
import { recordApiHealthMetrics } from "@/lib/ops/monitoring";

export const API_HEALTH_METRIC_THROTTLE_MS = 5 * 60 * 1000;

export const API_HEALTH_SOURCE_NAMES = {
  naverDirections: "NAVER Directions 5",
  tmapPedestrian: "TMAP 보행자 경로",
  weather: "기상청 초단기실황/단기예보",
  weatherWarnings: "기상청 기상특보",
  disasterMessages: "행정안전부 긴급재난문자",
  trafficEvents: "ITS 돌발상황",
  sensorFeeds: "한강홍수통제소 수문 센서",
  shelters: "이재민 임시주거시설",
  safeMapWms: "생활안전지도 WMS",
  geminiNotice: "Gemini 안내문",
} as const;

export type ApiHealthSourceName =
  (typeof API_HEALTH_SOURCE_NAMES)[keyof typeof API_HEALTH_SOURCE_NAMES];

export interface ApiHealthSourceSnapshot {
  status: ApiStatus;
  timestamp: string;
  lastSuccessAt?: string;
  durationMs?: number;
  error?: string;
}

interface ApiHealthState {
  sources: Record<string, ApiHealthSourceSnapshot>;
  metricRecordedAt: Record<string, number>;
  report: (name: string, result: ApiResult<unknown>, durationMs?: number) => void;
  reset: () => void;
}

const normalizedDuration = (durationMs?: number) =>
  typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0
    ? Math.round(durationMs)
    : undefined;

const toMetricItem = (name: string, snapshot: ApiHealthSourceSnapshot): ApiHealthStatus => ({
  name,
  status: snapshot.status,
  lastSuccess: snapshot.lastSuccessAt ?? "확실한 정보 없음",
  lastChecked: snapshot.timestamp,
  responseTime: snapshot.durationMs,
  lastError: snapshot.error,
});

export const useApiHealthStore = create<ApiHealthState>((set, get) => ({
  sources: {},
  metricRecordedAt: {},
  report: (name, result, durationMs) => {
    const previous = get().sources[name];
    const snapshot: ApiHealthSourceSnapshot = {
      status: result.status,
      timestamp: result.timestamp,
      lastSuccessAt: result.status === "OK" ? result.timestamp : previous?.lastSuccessAt,
      durationMs: normalizedDuration(durationMs),
      error: result.error?.slice(0, 800),
    };
    const now = Date.now();
    const lastMetricAt = get().metricRecordedAt[name];
    const shouldRecordMetric =
      lastMetricAt == null || now - lastMetricAt >= API_HEALTH_METRIC_THROTTLE_MS;

    set((state) => ({
      sources: { ...state.sources, [name]: snapshot },
      metricRecordedAt: shouldRecordMetric
        ? { ...state.metricRecordedAt, [name]: now }
        : state.metricRecordedAt,
    }));

    if (shouldRecordMetric) {
      void recordApiHealthMetrics([toMetricItem(name, snapshot)]).catch(() => undefined);
    }
  },
  reset: () => set({ sources: {}, metricRecordedAt: {} }),
}));
