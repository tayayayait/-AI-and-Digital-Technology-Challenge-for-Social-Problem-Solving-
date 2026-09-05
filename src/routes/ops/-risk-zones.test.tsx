import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RiskZone, Shelter, TrafficEvent } from "@/lib/types";
import { Route } from "./risk-zones";

const useDynamicRiskZonesMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useDynamicRiskZones", () => ({
  useDynamicRiskZones: () => useDynamicRiskZonesMock(),
}));

vi.mock("@/components/ops/OpsLayout", () => ({
  OpsLayout: ({ children, detail }: { children: React.ReactNode; detail: React.ReactNode }) => (
    <div>
      <main>{children}</main>
      <aside>{detail}</aside>
    </div>
  ),
}));

const riskZone: RiskZone = {
  id: "grid-busan",
  name: "부산 해운대구 격자 1-1",
  level: "WARNING",
  polygon: [
    [129.16, 35.16],
    [129.17, 35.16],
    [129.17, 35.17],
    [129.16, 35.17],
  ],
  reasons: ["침수흔적 중첩"],
};

const shelter: Shelter = {
  id: "busan-shelter",
  name: "해운대구 문화복합센터",
  address: "부산 해운대구 센텀중앙로 170",
  position: { lat: 35.165, lng: 129.165 },
  capacity: 1200,
  status: "OPERATING",
  underground: false,
  type: "지자체 대피시설",
};

const trafficEvent: TrafficEvent = {
  id: "busan-event",
  type: "통제",
  eventType: "침수",
  position: { lat: 35.165, lng: 129.165 },
  roadName: "센텀중앙로",
  message: "침수 전면 통제",
  source: "ITS",
};

const RiskZonesPage = Route.options.component!;

beforeEach(() => {
  useDynamicRiskZonesMock.mockReset();
  useDynamicRiskZonesMock.mockReturnValue({
    riskZones: [riskZone],
    status: "READY",
    isLoading: false,
    region: "부산 해운대구",
    shelters: [shelter],
    trafficEvents: [trafficEvent],
    sampledCells: 36,
    failedCells: 0,
  });
});

describe("Ops risk zones", () => {
  test("동적으로 산출한 지역과 실제 통제 도로를 표시한다", () => {
    render(<RiskZonesPage />);

    expect(screen.getAllByText("부산 해운대구 격자 1-1").length).toBeGreaterThan(0);
    expect(screen.getByText("센텀중앙로")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/강남대로|테헤란로|역삼로/);
  });

  test("위험구역 0개는 오류가 아닌 정상 상태로 표시한다", () => {
    useDynamicRiskZonesMock.mockReturnValue({
      riskZones: [],
      status: "EMPTY",
      isLoading: false,
      region: "부산 해운대구",
      shelters: [shelter],
      trafficEvents: [],
      sampledCells: 36,
      failedCells: 0,
    });

    render(<RiskZonesPage />);

    expect(screen.getByText("현재 기준 위험구역 없음")).toBeInTheDocument();
  });

  test("격자 전체 실패 시 목데이터 대신 데이터 상태 안내를 표시한다", () => {
    useDynamicRiskZonesMock.mockReturnValue({
      riskZones: [],
      status: "FAILED",
      isLoading: false,
      region: "부산 해운대구",
      shelters: [shelter],
      trafficEvents: [],
      sampledCells: 36,
      failedCells: 36,
    });

    render(<RiskZonesPage />);

    expect(
      screen.getByText("위험구역을 산출할 수 없습니다 · 데이터 상태 확인"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/강남역 일대/)).not.toBeInTheDocument();
  });
});
