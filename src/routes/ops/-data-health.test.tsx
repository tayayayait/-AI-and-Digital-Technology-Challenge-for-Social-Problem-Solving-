import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiHealthMetricPoint, ApiHealthStatus } from "@/hooks/useApiStatus";
import { Route } from "./data-health";

const mocks = vi.hoisted(() => ({
  measuredItems: vi.fn(),
  history: vi.fn(),
}));

vi.mock("@/hooks/useApiStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useApiStatus")>();
  return {
    ...actual,
    useMeasuredApiHealthItems: () => mocks.measuredItems(),
    useApiHealthHistory: () => mocks.history(),
  };
});

vi.mock("@/hooks/useDisasterMessages", () => ({
  useDisasterMessages: () => ({
    result: {
      data: [],
      status: "OK",
      timestamp: "2026-09-03T04:00:00.000Z",
      source: "unit",
    },
  }),
}));

vi.mock("@/store/scenario", () => ({
  useScenario: () => ({
    scenarioPresetId: "NORMAL",
    apiStatus: "OK",
    wmsStatus: "OK",
    geminiStatus: "OK",
  }),
}));

vi.mock("@/components/ops/OpsLayout", () => ({
  OpsLayout: ({
    title,
    description,
    children,
    detail,
  }: {
    title: string;
    description: string;
    children: React.ReactNode;
    detail: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      <main>{children}</main>
      <aside>{detail}</aside>
    </div>
  ),
}));

vi.mock("@/lib/ops/audit", () => ({ recordAuditLog: vi.fn() }));
vi.mock("@/lib/ops/monitoring", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops/monitoring")>();
  return { ...actual, recordApiHealthMetrics: vi.fn() };
});

const items: ApiHealthStatus[] = [
  {
    name: "기상청 초단기실황/단기예보",
    status: "FAILED",
    lastSuccess: "2026-09-03T03:55:00.000Z",
    lastChecked: "2026-09-03T04:00:00.000Z",
    responseTime: 321,
    lastError: "network offline",
  },
  {
    name: "Gemini 안내문",
    status: "UNQUERIED",
    lastSuccess: "확실한 정보 없음",
    lastChecked: "확실한 정보 없음",
  },
];

const metrics: ApiHealthMetricPoint[] = [
  {
    api_name: "기상청 초단기실황/단기예보",
    status: "OK",
    response_time_ms: 100,
    created_at: "2026-09-03T03:55:00.000Z",
  },
  {
    api_name: "기상청 초단기실황/단기예보",
    status: "FAILED",
    response_time_ms: 321,
    created_at: "2026-09-03T04:00:00.000Z",
  },
];

const DataHealthPage = Route.options.component!;

describe("Ops data health", () => {
  beforeEach(() => {
    mocks.measuredItems.mockReset().mockReturnValue(items);
    mocks.history.mockReset().mockReturnValue({
      metrics,
      grouped: { "기상청 초단기실황/단기예보": metrics },
      isLoading: false,
      error: null,
    });
  });

  test("프리셋이 아니라 저장된 실제 호출 결과와 24시간 추이를 표시한다", () => {
    render(<DataHealthPage />);

    expect(
      screen.getByText("최근 실제 호출 결과 · 5분 간격 자동 기록 · 24시간 추이"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("실패").length).toBeGreaterThan(0);
    expect(screen.getAllByText("321ms").length).toBeGreaterThan(0);
    expect(screen.getAllByText("network offline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("미조회").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", { name: "기상청 초단기실황/단기예보 24시간 응답시간 추이" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "현재 상태 기록" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/현재 preset|시나리오 preset/);
  });
});
