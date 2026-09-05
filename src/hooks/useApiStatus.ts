import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { ApiResult, ApiStatus } from "@/lib/api/types";
import {
  API_HEALTH_METRIC_THROTTLE_MS,
  API_HEALTH_SOURCE_NAMES,
  useApiHealthStore,
  type ApiHealthSourceSnapshot,
} from "@/store/apiHealth";

const STATUS_PRIORITY: ApiStatus[] = ["FAILED", "FALLBACK", "STALE", "OK"];
const DISPLAY_STATUS_PRIORITY: ApiHealthDisplayStatus[] = [
  "FAILED",
  "FALLBACK",
  "STALE",
  "UNQUERIED",
  "OK",
];

export type ApiHealthDisplayStatus = ApiStatus | "UNQUERIED";

export interface ApiHealthStatus {
  name: string;
  status: ApiHealthDisplayStatus;
  lastSuccess: string;
  lastChecked: string;
  lastError?: string;
  responseTime?: number;
}

export const API_STATUS_META: Record<
  ApiHealthDisplayStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  OK: { label: "정상", bg: "#dcfce7", text: "#166534", border: "#86efac" },
  STALE: { label: "지연", bg: "#fef9c3", text: "#854d0e", border: "#fde68a" },
  FAILED: { label: "실패", bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
  FALLBACK: { label: "대체", bg: "#dbeafe", text: "#1d4ed8", border: "#bfdbfe" },
  UNQUERIED: { label: "미조회", bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" },
};

export const summarizeApiStatus = (results: Array<ApiResult<unknown> | null | undefined>) => {
  const statuses = new Set(
    results
      .filter((result): result is ApiResult<unknown> => result != null)
      .map((result) => result.status),
  );
  return STATUS_PRIORITY.find((status) => statuses.has(status)) ?? "OK";
};

export const useApiStatus = (results: Array<ApiResult<unknown> | null | undefined>) =>
  useMemo(() => summarizeApiStatus(results), [results]);

export const toMeasuredApiHealthItems = (
  sources: Record<string, ApiHealthSourceSnapshot>,
  names: readonly string[] = Object.values(API_HEALTH_SOURCE_NAMES),
): ApiHealthStatus[] =>
  names.map((name) => {
    const source = sources[name];
    if (!source) {
      return {
        name,
        status: "UNQUERIED",
        lastSuccess: "확실한 정보 없음",
        lastChecked: "확실한 정보 없음",
      };
    }

    return {
      name,
      status: source.status,
      lastSuccess: source.lastSuccessAt ?? "확실한 정보 없음",
      lastChecked: source.timestamp,
      responseTime: source.durationMs,
      lastError: source.error,
    };
  });

export const useMeasuredApiHealthItems = () => {
  const sources = useApiHealthStore((state) => state.sources);
  return useMemo(() => toMeasuredApiHealthItems(sources), [sources]);
};

export const summarizeApiHealth = (items: ApiHealthStatus[]) => ({
  total: items.length,
  ok: items.filter((item) => item.status === "OK").length,
  degraded: items.filter((item) => item.status === "STALE" || item.status === "FALLBACK").length,
  failed: items.filter((item) => item.status === "FAILED").length,
  unqueried: items.filter((item) => item.status === "UNQUERIED").length,
  worst:
    DISPLAY_STATUS_PRIORITY.find((status) => items.some((item) => item.status === status)) ??
    "UNQUERIED",
});

export type ApiHealthMetricPoint = Pick<
  Tables<"api_health_metrics">,
  "api_name" | "status" | "response_time_ms" | "created_at"
>;

export const groupApiHealthHistory = (metrics: ApiHealthMetricPoint[]) =>
  metrics.reduce<Record<string, ApiHealthMetricPoint[]>>((grouped, metric) => {
    const entries = grouped[metric.api_name] ?? [];
    grouped[metric.api_name] = [...entries, metric].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return grouped;
  }, {});

export const fetchApiHealthHistory = async (
  hours = 24,
  now: () => number = Date.now,
): Promise<ApiHealthMetricPoint[]> => {
  const cutoff = new Date(now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("api_health_metrics")
    .select("api_name,status,response_time_ms,created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
};

export const useApiHealthHistory = () => {
  const query = useQuery({
    queryKey: ["api-health-history", "24h"],
    queryFn: () => fetchApiHealthHistory(24),
    staleTime: API_HEALTH_METRIC_THROTTLE_MS,
    refetchInterval: API_HEALTH_METRIC_THROTTLE_MS,
  });
  const metrics = useMemo(() => query.data ?? [], [query.data]);

  return {
    metrics,
    grouped: useMemo(() => groupApiHealthHistory(metrics), [metrics]),
    isLoading: query.isLoading,
    error: query.isError ? "24시간 추이를 불러오지 못했습니다." : null,
  };
};
