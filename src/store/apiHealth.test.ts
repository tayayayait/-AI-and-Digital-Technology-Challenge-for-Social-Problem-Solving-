import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiResult } from "@/lib/api/types";
import { API_HEALTH_METRIC_THROTTLE_MS, useApiHealthStore } from "./apiHealth";

const recordApiHealthMetricsMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("@/lib/ops/monitoring", () => ({
  recordApiHealthMetrics: recordApiHealthMetricsMock,
}));

const result = (
  status: ApiResult<unknown>["status"],
  timestamp: string,
  error?: string,
): ApiResult<unknown> => ({
  data: status === "FAILED" ? null : {},
  status,
  timestamp,
  source: "unit",
  error,
});

describe("apiHealth store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T04:00:00.000Z"));
    recordApiHealthMetricsMock.mockClear();
    useApiHealthStore.getState().reset();
  });

  test("실제 호출 결과와 클라이언트 체감 응답시간을 저장한다", () => {
    useApiHealthStore
      .getState()
      .report("기상청 초단기실황/단기예보", result("OK", "2026-09-03T03:59:58.000Z"), 127.8);

    expect(useApiHealthStore.getState().sources["기상청 초단기실황/단기예보"]).toEqual({
      status: "OK",
      timestamp: "2026-09-03T03:59:58.000Z",
      lastSuccessAt: "2026-09-03T03:59:58.000Z",
      durationMs: 128,
      error: undefined,
    });
    expect(recordApiHealthMetricsMock).toHaveBeenCalledOnce();
  });

  test("동일 API 메트릭은 5분에 한 번만 자동 적재한다", () => {
    const store = useApiHealthStore.getState();
    store.report("생활안전지도 WMS", result("OK", "2026-09-03T04:00:00.000Z"), 80);
    store.report("생활안전지도 WMS", result("OK", "2026-09-03T04:01:00.000Z"), 75);
    store.report("행정안전부 긴급재난문자", result("OK", "2026-09-03T04:01:00.000Z"), 91);

    expect(recordApiHealthMetricsMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(API_HEALTH_METRIC_THROTTLE_MS);
    useApiHealthStore
      .getState()
      .report("생활안전지도 WMS", result("FAILED", "2026-09-03T04:06:00.000Z"), 250);

    expect(recordApiHealthMetricsMock).toHaveBeenCalledTimes(3);
  });

  test("후속 호출이 실패해도 마지막 성공시각을 보존하고 오류를 기록한다", () => {
    const store = useApiHealthStore.getState();
    store.report("TMAP 보행자 경로", result("OK", "2026-09-03T03:55:00.000Z"), 100);
    store.report(
      "TMAP 보행자 경로",
      result("FAILED", "2026-09-03T04:00:00.000Z", "upstream timeout"),
      500,
    );

    expect(useApiHealthStore.getState().sources["TMAP 보행자 경로"]).toEqual({
      status: "FAILED",
      timestamp: "2026-09-03T04:00:00.000Z",
      lastSuccessAt: "2026-09-03T03:55:00.000Z",
      durationMs: 500,
      error: "upstream timeout",
    });
  });
});
