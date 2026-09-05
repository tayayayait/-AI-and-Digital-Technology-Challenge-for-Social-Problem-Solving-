import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { ApiHealthStatus } from "@/hooks/useApiStatus";
import type { ApiStatus } from "@/lib/api/types";
import { redactSensitiveText } from "@/lib/ops/audit";

const parseTimestamp = (value: string): string | null => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
};

export const toApiHealthMetricInsert = (
  item: ApiHealthStatus & { status: ApiStatus },
): TablesInsert<"api_health_metrics"> => ({
  api_name: item.name,
  status: item.status,
  response_time_ms: item.responseTime ?? null,
  fallback_used: item.status === "FALLBACK",
  last_success_at: parseTimestamp(item.lastSuccess),
  error_code: item.lastError ? item.status : null,
  user_message:
    item.status === "OK"
      ? "정상"
      : "일부 데이터가 지연되거나 실패해 대체 정보를 표시하고 있습니다.",
  operator_message: item.lastError ? redactSensitiveText(item.lastError) : null,
});

export const calculateApiObservability = (items: ApiHealthStatus[]) => {
  const measuredItems = items.filter((item) => item.status !== "UNQUERIED");
  const responseTimes = measuredItems
    .map((item) => item.responseTime)
    .filter((value): value is number => typeof value === "number");
  const fallbackCount = measuredItems.filter((item) => item.status === "FALLBACK").length;
  const failedCount = measuredItems.filter((item) => item.status === "FAILED").length;

  return {
    averageResponseTimeMs: responseTimes.length
      ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
      : null,
    fallbackRatePercent: measuredItems.length
      ? Math.round((fallbackCount / measuredItems.length) * 100)
      : 0,
    failedCount,
  };
};

export const recordApiHealthMetrics = async (items: ApiHealthStatus[]) => {
  const measuredItems = items.filter(
    (item): item is ApiHealthStatus & { status: ApiStatus } => item.status !== "UNQUERIED",
  );
  if (measuredItems.length === 0) return { ok: true as const };

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) return { ok: true as const };

  const rows = measuredItems.map(toApiHealthMetricInsert);
  const { error } = await supabase.from("api_health_metrics").insert(rows);

  if (error) {
    return {
      ok: false as const,
      userMessage: "API 상태 기록을 저장하지 못했습니다.",
      operatorMessage: redactSensitiveText(error.message),
    };
  }

  return { ok: true as const };
};
