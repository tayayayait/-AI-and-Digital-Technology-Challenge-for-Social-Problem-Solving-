import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useScenario } from "@/store/scenario";
import { LocationPermissionPrompt, Route, ShelterPicker } from "./index";
import type { AiAnswer, RouteResult, Shelter } from "@/lib/types";

const clientMapMock = vi.hoisted(() => vi.fn());
const geocodeAddressMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const useAiAdviceMock = vi.hoisted(() =>
  vi.fn((_input: unknown): { data: AiAnswer | null; isLoading: boolean } => ({
    data: null,
    isLoading: false,
  })),
);
const useRoutesMock = vi.hoisted(() => vi.fn());
const useSheltersMock = vi.hoisted(() => vi.fn());
const useTrafficEventsMock = vi.hoisted(() => vi.fn((_input: unknown) => ({ events: [] })));
const riskAssessmentMock = vi.hoisted(() =>
  vi.fn(() => ({
    total: 12,
    level: "SAFE",
    reasons: [] as string[],
    missingDataCount: 0,
    weather: 0,
    floodTrace: 0,
    riverFlood: 0,
    disasterMessages: 0,
    underpass: 0,
    trafficControl: 0,
    floodTraceOverlap: 0,
    riverFloodOverlap: 0,
    safeMapEvidence: [],
    region: "강남구",
    isCurrentDataConfirmed: false,
    dataSources: [
      {
        label: "기상청 단기예보",
        timestamp: "2026-06-15T13:00:00+09:00",
        status: "OK",
      },
      {
        label: "기상청 기상특보",
        timestamp: "2026-06-14T13:00:00+09:00",
        status: "OK",
      },
      {
        label: "긴급재난문자",
        timestamp: "2026-06-13T13:00:00+09:00",
        status: "FALLBACK",
      },
    ],
  })),
);

vi.mock("@/components/map/ClientMap", () => ({
  ClientMap: (props: unknown) => {
    clientMapMock(props);
    return <div data-testid="home-map" />;
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
      <a href={to ?? "#"}>{children}</a>
    ),
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/lib/geocoding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/geocoding")>();
  return {
    ...actual,
    geocodeAddress: geocodeAddressMock,
  };
});

vi.mock("@/hooks/useShelters", () => ({
  useShelters: (...args: unknown[]) => useSheltersMock(...args),
}));

vi.mock("@/hooks/useRiskAssessment", () => ({
  useRiskAssessment: () => riskAssessmentMock(),
}));

vi.mock("@/hooks/useAiAdvice", () => ({
  useAiAdvice: (input: unknown) => useAiAdviceMock(input),
}));

vi.mock("@/hooks/useRoutes", () => ({
  useRoutes: (input: unknown) => useRoutesMock(input),
}));

vi.mock("@/hooks/useTrafficEvents", () => ({
  useTrafficEvents: (input: unknown) => useTrafficEventsMock(input),
}));

const shelter: Shelter = {
  id: "s-01",
  name: "역삼초등학교 체육관",
  address: "서울 강남구 역삼로 153",
  position: { lat: 37.5005, lng: 127.0354 },
  capacity: 420,
  status: "OPERATING",
  underground: false,
  type: "민방위대피시설",
};

const actualRoute: RouteResult = {
  id: "actual-walk-route",
  mode: "WALK",
  status: "RECOMMENDED",
  name: "TMAP 실시간 보행 경로",
  distanceMeters: 880,
  durationSeconds: 760,
  safetyScore: 91,
  riskReasons: ["실제 교통통제 구간 회피", "실시간 보행 경로 안전점수 반영"],
  geometry: [{ lat: 37.4979, lng: 127.0276 }, shelter.position],
  shelterId: shelter.id,
};

const geocodeResult = {
  id: "manual-gangnam",
  label: "강남역",
  address: "서울 강남구 강남대로",
  position: { lat: 37.4979, lng: 127.0276 },
  source: "NAVER" as const,
};

const Home = Route.options.component!;

beforeEach(() => {
  clientMapMock.mockClear();
  geocodeAddressMock.mockReset();
  navigateMock.mockClear();
  useAiAdviceMock.mockClear();
  useRoutesMock.mockReset();
  useRoutesMock.mockReturnValue({
    routes: [actualRoute],
    results: {
      walk: {
        data: [actualRoute],
        status: "OK",
        timestamp: "2026-06-15T04:00:00.000Z",
        source: "tmap-pedestrian",
      },
      drive: {
        data: [],
        status: "FAILED",
        timestamp: "2026-06-15T04:00:00.000Z",
        source: "naver-directions",
        error: "No drive route",
      },
    },
    apiStatus: "FAILED",
    isLoading: false,
    fallbackShelters: [],
  });
  useSheltersMock.mockReset();
  useSheltersMock.mockReturnValue({ shelters: [shelter], isLoading: false, error: null });
  useTrafficEventsMock.mockClear();
  riskAssessmentMock.mockClear();
  useScenario.setState({
    origin: { lat: 37.4979, lng: 127.0276 },
    locationStatus: "PROMPT",
    riskLevel: "SAFE",
    riskScore: 12,
    lastConfirmedAt: null,
    lastRecommendation: null,
  });
});

describe("LocationPermissionPrompt", () => {
  test("is a non-modal prompt so bottom navigation remains reachable", () => {
    render(<LocationPermissionPrompt onAllow={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "위치 권한 요청" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "허용 안 함" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "위치 허용" })).toBeInTheDocument();
  });
});

describe("Home location gate", () => {
  test("CRITICAL 위치 화면에서만 가장 안전한 자동 경로 CTA를 노출한다", async () => {
    const user = userEvent.setup();
    useScenario.setState({ locationStatus: "GRANTED", riskLevel: "CRITICAL", riskScore: 86 });

    render(<Home />);

    await user.click(await screen.findByRole("button", { name: "가장 안전한 경로 시작" }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/routes",
      search: { mode: "safest", auto: true },
    });
  });

  test("WARNING 위치 화면에는 긴급 바를 노출하지 않는다", async () => {
    useScenario.setState({ locationStatus: "GRANTED", riskLevel: "WARNING", riskScore: 59 });

    render(<Home />);

    await screen.findByTestId("home-map");
    expect(screen.queryByRole("button", { name: "가장 안전한 경로 시작" })).not.toBeInTheDocument();
  });

  test("CRITICAL에서 경로 계산이 실패하면 대피소 목록 CTA로 유지한다", async () => {
    const user = userEvent.setup();
    useScenario.setState({ locationStatus: "GRANTED", riskLevel: "CRITICAL", riskScore: 86 });
    useRoutesMock.mockReturnValue({
      routes: [],
      results: {
        walk: { data: null, status: "FAILED", timestamp: null, source: "tmap-pedestrian" },
        drive: { data: null, status: "FAILED", timestamp: null, source: "naver-directions" },
      },
      apiStatus: "FAILED",
      isLoading: false,
      fallbackShelters: [{ shelter, distanceMeters: 880 }],
      failureMessage: "경로를 계산하지 못했습니다.",
    });

    render(<Home />);

    await user.click(
      await screen.findByRole("button", {
        name: "경로를 계산할 수 없습니다 · 대피소 목록 보기",
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith({ to: "/shelters" });
  });

  test("CRITICAL에서 대피소 후보가 없으면 119 신고 CTA로 전환한다", async () => {
    useScenario.setState({ locationStatus: "GRANTED", riskLevel: "CRITICAL", riskScore: 86 });
    useSheltersMock.mockReturnValue({ shelters: [], isLoading: false, error: null });
    useRoutesMock.mockReturnValue({
      routes: [],
      results: {
        walk: { data: null, status: "FAILED", timestamp: null, source: "tmap-pedestrian" },
        drive: { data: null, status: "FAILED", timestamp: null, source: "naver-directions" },
      },
      apiStatus: "FAILED",
      isLoading: false,
      fallbackShelters: [],
      failureMessage: "주변 반경에 탐색된 대피소가 없습니다.",
    });

    render(<Home />);

    expect(
      await screen.findByRole("link", { name: "주변 대피소가 없습니다 · 119 신고" }),
    ).toHaveAttribute("href", "tel:119");
  });

  test("does not render the map before the user chooses a location source", async () => {
    render(<Home />);

    expect(await screen.findByRole("region", { name: "위치 권한 요청" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "주소 검색" })).toBeInTheDocument();
    expect(screen.queryByTestId("home-map")).not.toBeInTheDocument();
    expect(clientMapMock).not.toHaveBeenCalled();
  });

  test("renders the map for the manually selected address", async () => {
    const user = userEvent.setup();
    geocodeAddressMock.mockResolvedValue([geocodeResult]);

    render(<Home />);

    await user.type(screen.getByRole("textbox"), "강남역");
    await user.click(screen.getByRole("button", { name: "주소 검색" }));
    await user.click(await screen.findByRole("button", { name: /강남역/ }));

    expect(await screen.findByTestId("home-map")).toBeInTheDocument();
    expect(clientMapMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: geocodeResult.position }),
    );
  });

  test("지도보다 현재 위험도와 즉시 행동 안내를 먼저 보여준다", async () => {
    useScenario.setState({ locationStatus: "GRANTED", riskLevel: "WARNING", riskScore: 59 });

    render(<Home />);

    const guide = await screen.findByRole("region", { name: "추천 행동" });
    const map = await screen.findByTestId("home-map");

    expect(guide.compareDocumentPosition(map)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole("region", { name: "현재 위험도" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "지금 해야 할 행동" })).toBeInTheDocument();
  });

  test("passes actual route analysis and flood evidence to AI advice after location is available", async () => {
    useScenario.setState({ locationStatus: "GRANTED" });
    riskAssessmentMock.mockReturnValue({
      total: 54,
      level: "WARNING",
      reasons: ["재난문자 위험지역", "지하차도 통과 가능성"],
      missingDataCount: 0,
      weather: 15,
      floodTrace: 20,
      riverFlood: 10,
      disasterMessages: 9,
      underpass: 0,
      trafficControl: 0,
      floodTraceOverlap: 0.34,
      riverFloodOverlap: 0.12,
      safeMapEvidence: [],
      region: "강남구",
      isCurrentDataConfirmed: false,
      dataSources: [
        {
          label: "기상청 단기예보",
          timestamp: "2026-06-15T13:00:00+09:00",
          status: "OK",
        },
        {
          label: "기상청 기상특보",
          timestamp: "2026-06-14T13:00:00+09:00",
          status: "OK",
        },
        {
          label: "긴급재난문자",
          timestamp: "2026-06-13T13:00:00+09:00",
          status: "FALLBACK",
        },
      ],
    });

    render(<Home />);

    await screen.findByTestId("home-map");

    expect(useRoutesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        origin: { lat: 37.4979, lng: 127.0276 },
        shelters: [shelter],
      }),
    );
    expect(clientMapMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        routes: [actualRoute],
      }),
    );
    expect(useAiAdviceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: "SITUATION_GUIDANCE",
        recommendedRouteId: "actual-walk-route",
        distanceMeters: 880,
        dataTimestamp: "2026-06-15T04:00:00.000Z",
        disasterTypes: expect.arrayContaining(["침수"]),
        facts: expect.arrayContaining([
          expect.objectContaining({
            id: "risk-current",
            kind: "RISK",
            source: "재난·기상·지도 API 종합",
          }),
          expect.objectContaining({
            id: "route-actual-walk-route",
            kind: "ROUTE",
            source: "TMAP 보행 경로",
          }),
          expect.objectContaining({
            id: "assessment-0",
            text: "재난문자 위험지역",
          }),
          expect.objectContaining({
            id: "assessment-1",
            text: "지하차도 통과 가능성",
          }),
        ]),
        routeReasons: [
          "추천 도보 경로 TMAP 실시간 보행 경로",
          "안전점수 91점",
          "실제 교통통제 구간 회피",
          "실시간 보행 경로 안전점수 반영",
        ],
      }),
    );
    expect(screen.getByText(/데이터 기준 2026-06-14 13:00/)).toBeInTheDocument();
  });

  test("같은 온라인 추천 결과를 재렌더링마다 반복 저장하지 않는다", async () => {
    useScenario.setState({ locationStatus: "GRANTED" });
    riskAssessmentMock.mockReturnValue({
      ...riskAssessmentMock(),
      isCurrentDataConfirmed: true,
    });
    useSheltersMock.mockImplementation(() => ({
      shelters: [shelter],
      isLoading: false,
      error: null,
    }));

    let recommendationUpdates = 0;
    const unsubscribe = useScenario.subscribe((state, previousState) => {
      if (state.lastRecommendation !== previousState.lastRecommendation) {
        recommendationUpdates += 1;
      }
    });

    try {
      render(<Home />);

      await screen.findByTestId("home-map");
      await waitFor(() =>
        expect(useScenario.getState().lastRecommendation?.shelter.id).toBe(shelter.id),
      );
      expect(recommendationUpdates).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  test("ignores tiny map bounds changes", async () => {
    useScenario.setState({ locationStatus: "GRANTED" });

    render(<Home />);

    await screen.findByTestId("home-map");
    const firstMapProps = clientMapMock.mock.lastCall?.[0] as {
      onBoundsChanged: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
    };
    firstMapProps.onBoundsChanged({
      minX: 127.02,
      maxX: 127.05,
      minY: 37.49,
      maxY: 37.51,
    });

    await screen.findByTestId("home-map");
    const callsAfterFirstBounds = useSheltersMock.mock.calls.length;

    const secondMapProps = clientMapMock.mock.lastCall?.[0] as {
      onBoundsChanged: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
    };
    secondMapProps.onBoundsChanged({
      minX: 127.0201,
      maxX: 127.0501,
      minY: 37.4901,
      maxY: 37.5101,
    });

    expect(useSheltersMock).toHaveBeenCalledTimes(callsAfterFirstBounds);
  });

  test("reloads shelters with current map bounds when map moves", async () => {
    useScenario.setState({ locationStatus: "GRANTED" });

    render(<Home />);

    await screen.findByTestId("home-map");
    // 내 위치 기준 대피소는 bounds 없이 호출됨
    expect(useSheltersMock).toHaveBeenCalledWith({ lat: 37.4979, lng: 127.0276 }, 5000, true);

    const mapProps = clientMapMock.mock.lastCall?.[0] as {
      onBoundsChanged: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
    };
    const newBounds = { minX: 127.08, maxX: 127.12, minY: 37.52, maxY: 37.56 };
    mapProps.onBoundsChanged(newBounds);

    await screen.findByTestId("home-map");
    // 지도 마커용 대피소는 새 bounds로 호출됨
    expect(useSheltersMock).toHaveBeenLastCalledWith(
      { lat: 37.4979, lng: 127.0276 },
      5000,
      true,
      newBounds,
    );
  });

  test("maintains home route and AI advice target when map moves without explicit shelter selection", async () => {
    useScenario.setState({ locationStatus: "GRANTED" });

    render(<Home />);

    await screen.findByTestId("home-map");

    // 최초 렌더링 시 AI 입력의 대피소 확인 (shelter: '역삼초등학교 체육관')
    expect(useAiAdviceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recommendedShelterId: shelter.id,
      }),
    );
    const aiCallsBeforeMove = useAiAdviceMock.mock.calls.length;

    // 지도 영역을 다른 지역으로 이동
    const mapProps = clientMapMock.mock.lastCall?.[0] as {
      onBoundsChanged: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
    };
    mapProps.onBoundsChanged({ minX: 127.08, maxX: 127.12, minY: 37.52, maxY: 37.56 });

    await screen.findByTestId("home-map");

    // 명시적인 대피소 선택이 없으므로 AI 조언 대상은 여전히 내 위치 기준 대피소 유지
    expect(useAiAdviceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recommendedShelterId: shelter.id,
      }),
    );
  });

  test("switches AI advice target when a shelter marker is explicitly clicked", async () => {
    useScenario.setState({ locationStatus: "GRANTED" });

    render(<Home />);

    await screen.findByTestId("home-map");

    const mapProps = clientMapMock.mock.lastCall?.[0] as {
      onShelterClick: (shelter: Shelter) => void;
    };

    const targetShelter: Shelter = {
      id: "s-explicit-clicked",
      name: "선택 대피소",
      address: "서울 강남구 테헤란로",
      position: { lat: 37.51, lng: 127.05 },
      capacity: 300,
      status: "OPERATING",
      underground: false,
      type: "이재민 임시주거시설",
    };

    // 지도 상의 대피소 마커를 명시적으로 클릭
    mapProps.onShelterClick(targetShelter);

    await screen.findByTestId("home-map");

    // 명시적으로 클릭했으므로 AI 분석 대상이 선택된 대피소로 전환됨
    expect(useAiAdviceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recommendedShelterId: targetShelter.id,
      }),
    );
  });
});

describe("Home recommendation persistence", () => {
  test("does not resave identical pending guidance on each render, but saves changed advice", async () => {
    const assessment = riskAssessmentMock();
    const originalSave = useScenario.getState().setLastRecommendation;
    const save = vi.fn();
    let unmount = () => {};
    riskAssessmentMock.mockReturnValue({ ...assessment, isCurrentDataConfirmed: true });
    useScenario.setState({ locationStatus: "GRANTED", setLastRecommendation: save });
    const answer: AiAnswer = {
      judgement: "WAIT",
      judgementLabel: "현재 위치에서 대기",
      reasons: ["공식 안내를 확인하세요."],
      basis: [],
      timestamp: "2026-06-15T04:00:00.000Z",
      verified: false,
    };
    // The hook returns a fresh fallback object while the network request is pending.
    useAiAdviceMock.mockImplementation(() => ({ data: { ...answer }, isLoading: true }));
    try {
      const view = render(<Home />);
      unmount = view.unmount;
      await screen.findByTestId("home-map");
      view.rerender(<Home />);
      expect(save).toHaveBeenCalledTimes(1);

      useAiAdviceMock.mockImplementation(() => ({
        data: {
          ...answer,
          verified: true,
          judgementLabel: "공식 안내 확인",
          reasons: ["현재 경로의 통제 여부를 확인하세요."],
        },
        isLoading: false,
      }));
      view.rerender(<Home />);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actionTitle: "공식 안내 확인",
          actionBody: "현재 경로의 통제 여부를 확인하세요.",
        }),
      );
    } finally {
      unmount();
      useScenario.setState({ setLastRecommendation: originalSave });
      riskAssessmentMock.mockReturnValue(assessment);
      useAiAdviceMock.mockImplementation(() => ({ data: null, isLoading: false }));
    }
  });
});

describe("ShelterPicker", () => {
  test("selects a shelter and can return to automatic recommendation", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const { rerender } = render(
      <ShelterPicker
        shelters={[{ s: shelter, d: 290 }]}
        selectedShelterId={null}
        onSelect={onSelect}
      />,
    );

    const selector = screen.getByRole("combobox", { name: "홈 대피시설 선택" });
    await user.selectOptions(selector, shelter.id);
    expect(onSelect).toHaveBeenLastCalledWith(shelter.id);

    rerender(
      <ShelterPicker
        shelters={[{ s: shelter, d: 290 }]}
        selectedShelterId={shelter.id}
        onSelect={onSelect}
      />,
    );

    await user.selectOptions(selector, "");
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
