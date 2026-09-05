import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RiskZone, Shelter, TrafficEvent } from "@/lib/types";
import { Route } from "./messages";

const useDynamicRiskZonesMock = vi.hoisted(() => vi.fn());
const noticeGeneratorMock = vi.hoisted(() =>
  vi.fn((_props: Record<string, unknown>) => <div data-testid="notice-generator" />),
);

vi.mock("@/hooks/useDynamicRiskZones", () => ({
  useDynamicRiskZones: () => useDynamicRiskZonesMock(),
}));

vi.mock("@/components/ops/NoticeGenerator", () => ({
  NoticeGenerator: (props: Record<string, unknown>) => noticeGeneratorMock(props),
}));

vi.mock("@/components/ops/OpsLayout", () => ({
  OpsLayout: ({ children, detail }: { children: React.ReactNode; detail: React.ReactNode }) => (
    <div>
      <main>{children}</main>
      <aside>{detail}</aside>
    </div>
  ),
}));

vi.mock("@/lib/ops/audit", () => ({
  recordAuditLog: vi.fn(),
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

const OpsMessagesPage = Route.options.component!;

beforeEach(() => {
  noticeGeneratorMock.mockClear();
  useDynamicRiskZonesMock.mockReset();
  useDynamicRiskZonesMock.mockReturnValue({
    riskZones: [riskZone],
    status: "READY",
    region: "부산 해운대구",
    shelters: [shelter],
    trafficEvents: [trafficEvent],
    dataTimestamp: "2026-09-01T01:00:00.000Z",
  });
});

describe("Ops messages", () => {
  test("동적 위험구역의 실제 지역·대피소·도로만 안내문 생성기에 전달한다", () => {
    render(<OpsMessagesPage />);

    expect(screen.getByTestId("notice-generator")).toBeInTheDocument();
    const props = noticeGeneratorMock.mock.calls[0]?.[0];
    expect(props).toBeDefined();
    if (!props) throw new Error("NoticeGenerator props were not captured");
    expect(props).toMatchObject({
      region: "부산 해운대구",
      riskLevel: "WARNING",
      riskFactors: ["침수흔적 중첩"],
      dataTimestamp: "2026-09-01T01:00:00.000Z",
    });
    expect(props.allowedProperNouns).toEqual(
      expect.arrayContaining([
        "부산 해운대구",
        "부산 해운대구 격자 1-1",
        "해운대구 문화복합센터",
        "센텀중앙로",
      ]),
    );
    expect(JSON.stringify(props)).not.toMatch(/서울 강남구|강남역|탄천|역삼동/);
  });

  test("위험구역이 없으면 정상 상태를 표시하고 생성기를 숨긴다", () => {
    useDynamicRiskZonesMock.mockReturnValue({
      riskZones: [],
      status: "EMPTY",
      region: "부산 해운대구",
      shelters: [shelter],
      trafficEvents: [],
      dataTimestamp: null,
    });

    render(<OpsMessagesPage />);

    expect(screen.getByText("현재 기준 안내 대상 위험구역 없음")).toBeInTheDocument();
    expect(screen.queryByTestId("notice-generator")).not.toBeInTheDocument();
  });

  test("위험구역 산출 실패 시 목 안내문 대신 데이터 상태 안내를 표시한다", () => {
    useDynamicRiskZonesMock.mockReturnValue({
      riskZones: [],
      status: "FAILED",
      region: "부산 해운대구",
      shelters: [shelter],
      trafficEvents: [],
      dataTimestamp: null,
    });

    render(<OpsMessagesPage />);

    expect(
      screen.getByText("안내 대상을 산출할 수 없습니다 · 데이터 상태 확인"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("notice-generator")).not.toBeInTheDocument();
  });
});
