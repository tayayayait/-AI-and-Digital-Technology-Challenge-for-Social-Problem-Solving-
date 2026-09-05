import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { ApiHealthStatus, ApiHealthMetricPoint } from "@/hooks/useApiStatus";
import { ApiStatusTable } from "./ApiStatusTable";

const items: ApiHealthStatus[] = [
  {
    name: "기상청",
    status: "OK",
    lastSuccess: "2026-09-03T04:05:00.000Z",
    lastChecked: "2026-09-03T04:06:00.000Z",
    responseTime: 120,
  },
  {
    name: "ITS",
    status: "UNQUERIED",
    lastSuccess: "확실한 정보 없음",
    lastChecked: "확실한 정보 없음",
  },
];

const metric = (createdAt: string, responseTime: number): ApiHealthMetricPoint => ({
  api_name: "기상청",
  status: "OK",
  response_time_ms: responseTime,
  created_at: createdAt,
});

describe("ApiStatusTable", () => {
  test("2개 이상의 24시간 메트릭은 스파크라인으로 표시한다", () => {
    render(
      <ApiStatusTable
        items={items}
        historyBySource={{
          기상청: [
            metric("2026-09-03T04:00:00.000Z", 100),
            metric("2026-09-03T04:05:00.000Z", 120),
          ],
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "기상청 24시간 응답시간 추이" })).toBeInTheDocument();
    expect(screen.getByText("2026-09-03T04:06:00.000Z")).toBeInTheDocument();
  });

  test("메트릭이 부족한 소스는 수집 중으로 표시하고 미조회 상태를 구분한다", () => {
    render(
      <ApiStatusTable
        items={items}
        historyBySource={{ 기상청: [metric("2026-09-03T04:00:00.000Z", 100)] }}
      />,
    );

    expect(screen.getAllByText("수집 중")).toHaveLength(2);
    expect(screen.getByText("미조회")).toBeInTheDocument();
  });
});
