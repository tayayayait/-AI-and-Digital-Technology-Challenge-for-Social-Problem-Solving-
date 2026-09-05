import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  fetchApiHealthHistory,
  groupApiHealthHistory,
  summarizeApiHealth,
  summarizeApiStatus,
  toMeasuredApiHealthItems,
} from "./useApiStatus";
import type { ApiResult } from "@/lib/api/types";
import type { ApiHealthSourceSnapshot } from "@/store/apiHealth";

const apiHealthQuery = vi.hoisted(() => {
  const order = vi.fn();
  const gte = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ gte }));
  const from = vi.fn(() => ({ select }));
  return { from, select, gte, order };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: apiHealthQuery.from },
}));

beforeEach(() => {
  apiHealthQuery.from.mockClear();
  apiHealthQuery.select.mockClear();
  apiHealthQuery.gte.mockClear();
  apiHealthQuery.order.mockReset();
  apiHealthQuery.order.mockResolvedValue({ data: [], error: null });
});

const result = (status: ApiResult<unknown>["status"]): ApiResult<unknown> => ({
  data: {},
  status,
  timestamp: "2026-06-11T08:00:00.000Z",
  source: "unit",
});

describe("summarizeApiStatus", () => {
  test("prefers FAILED over FALLBACK, STALE, and OK", () => {
    expect(summarizeApiStatus([result("OK"), result("FAILED"), result("STALE")])).toBe("FAILED");
  });

  test("prefers FALLBACK over STALE and OK", () => {
    expect(summarizeApiStatus([result("OK"), result("STALE"), result("FALLBACK")])).toBe(
      "FALLBACK",
    );
  });

  test("returns OK when all results are OK", () => {
    expect(summarizeApiStatus([result("OK")])).toBe("OK");
  });
});

describe("measured API health", () => {
  test("실측값이 없는 소스는 정상 추정 대신 미조회로 표시한다", () => {
    const sources: Record<string, ApiHealthSourceSnapshot> = {
      "기상청 초단기실황/단기예보": {
        status: "FAILED",
        timestamp: "2026-09-03T04:00:00.000Z",
        durationMs: 820,
        error: "network offline",
      },
    };

    expect(
      toMeasuredApiHealthItems(sources, ["기상청 초단기실황/단기예보", "행정안전부 긴급재난문자"]),
    ).toEqual([
      {
        name: "기상청 초단기실황/단기예보",
        status: "FAILED",
        lastSuccess: "확실한 정보 없음",
        responseTime: 820,
        lastError: "network offline",
        lastChecked: "2026-09-03T04:00:00.000Z",
      },
      {
        name: "행정안전부 긴급재난문자",
        status: "UNQUERIED",
        lastSuccess: "확실한 정보 없음",
        lastChecked: "확실한 정보 없음",
      },
    ]);
  });

  test("미조회 소스를 종합 상태에서 별도로 집계한다", () => {
    const summary = summarizeApiHealth([
      {
        name: "조회됨",
        status: "OK",
        lastSuccess: "2026-09-03T04:00:00.000Z",
        lastChecked: "2026-09-03T04:00:00.000Z",
      },
      {
        name: "미조회",
        status: "UNQUERIED",
        lastSuccess: "확실한 정보 없음",
        lastChecked: "확실한 정보 없음",
      },
    ]);

    expect(summary).toMatchObject({ total: 2, ok: 1, unqueried: 1, worst: "UNQUERIED" });
  });

  test("24시간 메트릭을 API 이름별 시간순으로 묶는다", () => {
    const history = groupApiHealthHistory([
      {
        api_name: "기상청",
        status: "FAILED",
        response_time_ms: 500,
        created_at: "2026-09-03T04:05:00.000Z",
      },
      {
        api_name: "기상청",
        status: "OK",
        response_time_ms: 100,
        created_at: "2026-09-03T04:00:00.000Z",
      },
      {
        api_name: "ITS",
        status: "OK",
        response_time_ms: 80,
        created_at: "2026-09-03T04:03:00.000Z",
      },
    ]);

    expect(history["기상청"]?.map((metric) => metric.response_time_ms)).toEqual([100, 500]);
    expect(history.ITS).toHaveLength(1);
  });

  test("현재 시각 기준 최근 24시간 메트릭만 오래된 순서로 조회한다", async () => {
    await fetchApiHealthHistory(24, () => Date.parse("2026-09-03T04:00:00.000Z"));

    expect(apiHealthQuery.from).toHaveBeenCalledWith("api_health_metrics");
    expect(apiHealthQuery.select).toHaveBeenCalledWith(
      "api_name,status,response_time_ms,created_at",
    );
    expect(apiHealthQuery.gte).toHaveBeenCalledWith("created_at", "2026-09-02T04:00:00.000Z");
    expect(apiHealthQuery.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });
});
