import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RouteResult, Shelter, TrafficEvent } from "@/lib/types";
import { useScenario } from "@/store/scenario";
import { Route } from "./help";

const mocks = vi.hoisted(() => ({
  explainRoute: vi.fn(),
  reverseGeocode: vi.fn((_origin: unknown, _fallback?: string) => "부산 해운대구"),
  riskAssessment: vi.fn(),
  routes: vi.fn(),
  shelters: vi.fn(),
  trafficEvents: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
      <a href={to ?? "#"}>{children}</a>
    ),
  };
});

vi.mock("@/components/notifications/NotificationConsentCard", () => ({
  NotificationConsentCard: () => <div>알림 설정</div>,
}));

vi.mock("@/components/settings/SpeechSettingsCard", () => ({
  SpeechSettingsCard: () => <div>음성 설정</div>,
}));

vi.mock("@/hooks/useShelters", () => ({
  useShelters: (origin: unknown) => mocks.shelters(origin),
}));

vi.mock("@/hooks/useTrafficEvents", () => ({
  useTrafficEvents: (origin: unknown) => mocks.trafficEvents(origin),
}));

vi.mock("@/hooks/useRoutes", () => ({
  useRoutes: (options: unknown) => mocks.routes(options),
}));

vi.mock("@/hooks/useReverseGeocode", () => ({
  useReverseGeocode: (origin: unknown, fallback?: string) => mocks.reverseGeocode(origin, fallback),
}));

vi.mock("@/hooks/useRiskAssessment", () => ({
  useRiskAssessment: (origin: unknown) => mocks.riskAssessment(origin),
}));

vi.mock("@/lib/api/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gemini")>();
  return { ...actual, explainRouteWithGemini: (input: unknown) => mocks.explainRoute(input) };
});

const origin = { lat: 35.1631, lng: 129.1635 };

const shelter: Shelter = {
  id: "busan-shelter-1",
  name: "해운대구 문화복합센터",
  address: "부산 해운대구 센텀중앙로 170",
  position: { lat: 35.169, lng: 129.18 },
  capacity: 1200,
  status: "OPERATING",
  underground: false,
  type: "지자체 대피시설",
};

const trafficEvent: TrafficEvent = {
  id: "busan-event-1",
  type: "통제",
  eventType: "침수",
  position: { lat: 35.165, lng: 129.17 },
  roadName: "센텀중앙로",
  message: "센텀중앙로 침수 통제",
  source: "ITS",
};

const route: RouteResult = {
  id: "busan-route-1",
  mode: "WALK",
  status: "RECOMMENDED",
  name: "센텀중앙로 우회 보행 경로",
  distanceMeters: 920,
  durationSeconds: 780,
  safetyScore: 88,
  riskReasons: ["센텀중앙로 통제 구간 회피"],
  geometry: [origin, shelter.position],
  shelterId: shelter.id,
};

const Help = Route.options.component!;

beforeEach(() => {
  vi.clearAllMocks();
  useScenario.setState({
    origin,
    locationStatus: "GRANTED",
    riskLevel: "WARNING",
  });
  mocks.shelters.mockReturnValue({ shelters: [shelter], isLoading: false, error: null });
  mocks.trafficEvents.mockReturnValue({ events: [trafficEvent], isLoading: false });
  mocks.routes.mockReturnValue({ routes: [route], isLoading: false });
  mocks.riskAssessment.mockReturnValue({
    dataSources: [
      {
        label: "기상청 단기예보",
        timestamp: "2026-08-31T08:00:00.000Z",
        status: "OK",
      },
      {
        label: "긴급재난문자",
        timestamp: "2026-08-31T08:05:00.000Z",
        status: "OK",
      },
    ],
  });
  mocks.explainRoute.mockResolvedValue({
    judgement: "WALK_TO_SHELTER",
    judgementLabel: "우회 경로로 이동",
    reasons: ["통제 구간을 피합니다."],
    basis: ["ITS"],
    timestamp: "2026-08-31T08:00:00.000Z",
    verified: true,
  });
});

describe("HelpPage live data", () => {
  test("홈과 같은 위치·대피소·교통 이벤트로 실제 경로를 조회한다", () => {
    render(<Help />);

    expect(mocks.shelters).toHaveBeenCalledWith(origin);
    expect(mocks.trafficEvents).toHaveBeenCalledWith(origin);
    expect(mocks.routes).toHaveBeenCalledWith({
      origin,
      shelters: [shelter],
      trafficEvents: [trafficEvent],
      enabled: true,
    });
  });

  test("AI 입력은 실제 부산 위치·대피소·경로만 사용한다", async () => {
    const user = userEvent.setup();
    render(<Help />);

    await user.click(screen.getByRole("button", { name: "지금 나가도 되나요?" }));

    await waitFor(() => expect(mocks.explainRoute).toHaveBeenCalledOnce());
    const input = mocks.explainRoute.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      recommendedRouteId: route.id,
      recommendedShelterId: shelter.id,
      shelterName: shelter.name,
      routeReasons: route.riskReasons,
      dataTimestamp: "2026-08-31T08:00:00.000Z",
    });
    expect(input.allowedProperNouns).toEqual(
      expect.arrayContaining(["부산 해운대구", shelter.name, shelter.address, route.name]),
    );
    expect(JSON.stringify(input)).not.toMatch(/서울 강남구|강남역|역삼동|탄천/);
  });

  test("대피소 로딩 중에는 빈 데이터로 AI 질문을 보내지 않는다", () => {
    mocks.shelters.mockReturnValue({ shelters: [], isLoading: true, error: null });

    render(<Help />);

    expect(screen.getByRole("button", { name: "지금 나가도 되나요?" })).toBeDisabled();
  });

  test("위치가 설정되지 않으면 질문을 막고 홈 주소 설정으로 유도한다", () => {
    useScenario.setState({ locationStatus: "PROMPT" });

    render(<Help />);

    expect(screen.getByRole("button", { name: "지금 나가도 되나요?" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "홈에서 위치 설정" })).toHaveAttribute("href", "/");
    expect(mocks.routes).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
