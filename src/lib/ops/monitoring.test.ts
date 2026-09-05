import { beforeEach, describe, expect, test, vi } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import type { ApiHealthStatus } from "@/hooks/useApiStatus";
import { calculateApiObservability, recordApiHealthMetrics } from "./monitoring";

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    from: vi.fn(),
  },
}));

const measured: ApiHealthStatus[] = [
  {
    name: "weather",
    status: "OK",
    lastSuccess: "2026-09-03T04:00:00.000Z",
    lastChecked: "2026-09-03T04:00:00.000Z",
    responseTime: 100,
  },
  {
    name: "traffic",
    status: "FALLBACK",
    lastSuccess: "확실한 정보 없음",
    lastChecked: "2026-09-03T04:00:00.000Z",
    responseTime: 300,
    lastError: "upstream timeout",
  },
  {
    name: "notice",
    status: "UNQUERIED",
    lastSuccess: "확실한 정보 없음",
    lastChecked: "확실한 정보 없음",
  },
];

describe("API health monitoring", () => {
  beforeEach(() => {
    getSessionMock.mockReset().mockResolvedValue({
      data: { session: { user: { id: "operator-1" } } },
      error: null,
    });
    vi.mocked(supabase.from).mockReset();
  });

  test("미조회 소스는 관측 지표의 분모에서 제외한다", () => {
    expect(calculateApiObservability(measured)).toEqual({
      averageResponseTimeMs: 200,
      fallbackRatePercent: 50,
      failedCount: 0,
    });
  });

  test("인증되지 않은 시민 화면에서는 운영자 전용 DB 기록을 시도하지 않는다", async () => {
    const insert = vi.fn(async (_rows: unknown[]) => ({ error: null }));
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await expect(recordApiHealthMetrics(measured)).resolves.toEqual({ ok: true });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  test("미조회 소스는 DB 자동 기록에서 제외한다", async () => {
    const insert = vi.fn(async (_rows: unknown[]) => ({ error: null }));
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await expect(recordApiHealthMetrics(measured)).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toHaveLength(2);
    expect(insert.mock.calls[0]?.[0]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ api_name: "notice" })]),
    );
  });
});
