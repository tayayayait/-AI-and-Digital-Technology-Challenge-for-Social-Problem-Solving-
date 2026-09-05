import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ActionCard } from "./ActionCard";
import { RISK_META } from "@/lib/risk";
import type { RiskLevel, Shelter } from "@/lib/types";
import { useScenario } from "@/store/scenario";

const originalSpeechSynthesis = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");
const originalUserActivation = Object.getOwnPropertyDescriptor(navigator, "userActivation");

const installSpeechApi = () => {
  const cancel = vi.fn();
  const speakMock = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { cancel, speak: speakMock },
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    value: class FakeSpeechSynthesisUtterance {
      lang = "";
      rate = 1;

      constructor(public readonly text: string) {}
    },
  });
  return { cancel, speakMock };
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
  }: {
    children: React.ReactNode;
    search?: Record<string, string>;
    to: string;
  }) => {
    const href = search ? `${to}?${new URLSearchParams(search).toString()}` : to;
    return <a href={href}>{children}</a>;
  },
}));

const shelter: Shelter = {
  id: "s-05",
  name: "역삼1동주민센터",
  address: "서울 강남구 봉은사로4길 13",
  position: { lat: 37.5023, lng: 127.0301 },
  capacity: 180,
  status: "OPERATING",
  underground: false,
  type: "지자체 대피시설",
};

const alternateShelter: Shelter = {
  id: "s-06",
  name: "논현초등학교 체육관",
  address: "서울 강남구 강남대로120길 33",
  position: { lat: 37.5082, lng: 127.0268 },
  capacity: 320,
  status: "CHECK_REQUIRED",
  underground: false,
  type: "이재민 임시주거시설",
};

describe("ActionCard", () => {
  beforeEach(() => {
    useScenario.setState({ speechEnabled: false });
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: false, isActive: false },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useScenario.setState({ speechEnabled: false });
    if (originalSpeechSynthesis) {
      Object.defineProperty(window, "speechSynthesis", originalSpeechSynthesis);
    } else {
      Reflect.deleteProperty(window, "speechSynthesis");
    }
    if (originalUtterance) {
      Object.defineProperty(globalThis, "SpeechSynthesisUtterance", originalUtterance);
    } else {
      Reflect.deleteProperty(globalThis, "SpeechSynthesisUtterance");
    }
    if (originalUserActivation) {
      Object.defineProperty(navigator, "userActivation", originalUserActivation);
    } else {
      Reflect.deleteProperty(navigator, "userActivation");
    }
  });

  test.each<RiskLevel>(["SAFE", "WATCH", "WARNING", "UNKNOWN"])(
    "renders the %s risk action copy",
    (level) => {
      render(<ActionCard level={level} shelter={shelter} timestamp="2026-06-11T14:30:00+09:00" />);

      expect(screen.getByText(RISK_META[level].actionTitle)).toBeInTheDocument();
      expect(screen.getByText(RISK_META[level].ctaLabel)).toBeInTheDocument();
    },
  );

  test("CRITICAL에서는 긴급 행동을 강조하고 경로 행동은 긴급 바 하나에 맡긴다", () => {
    render(<ActionCard level="CRITICAL" shelter={shelter} timestamp="2026-06-11T14:30:00+09:00" />);

    expect(screen.getByRole("region", { name: "긴급 추천 행동" })).toBeInTheDocument();
    expect(screen.getByText(RISK_META.CRITICAL.actionTitle)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /경로/ })).not.toBeInTheDocument();
  });

  test("shows API fallback status and formatted timestamp", () => {
    render(
      <ActionCard
        level="WARNING"
        shelter={shelter}
        distanceMeters={537}
        timestamp="2026-06-11T14:30:00+09:00"
        apiStatus="FALLBACK"
      />,
    );

    expect(screen.getByText(/대체 데이터/)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-11 14:30/)).toBeInTheDocument();
  });

  test("위험도부터 대체 대피소까지 실제 행동 순서로 보여준다", () => {
    render(
      <ActionCard
        level="WARNING"
        riskScore={68}
        disasterTypes={["침수", "호우"]}
        shelter={shelter}
        distanceMeters={537}
        timestamp="2026-06-11T14:30:00+09:00"
        facts={[
          {
            id: "risk-current",
            kind: "RISK",
            text: "현재 위험도 경계, 68점",
            source: "재난·기상 API 종합",
            observedAt: "2026-06-11T14:30:00+09:00",
            status: "LIVE",
          },
          {
            id: "traffic-1",
            kind: "TRAFFIC",
            text: "강남대로 침수 통제",
            source: "ITS 돌발정보",
            observedAt: "2026-06-11T14:29:00+09:00",
            status: "LIVE",
          },
        ]}
        aiAdvice={{
          judgement: "AVOID_ROUTE",
          judgementLabel: "통제 구간을 피해 이동하세요",
          reasons: ["강남대로 침수 통제를 피해 이동하세요."],
          basis: ["traffic-1"],
          timestamp: "2026-06-11T14:30:00+09:00",
          verified: true,
          riskSummary: {
            text: "현재 침수 위험이 높아진 경계 단계입니다.",
            sourceKind: "LIVE_DATA",
            evidenceRefs: ["risk-current"],
          },
          immediateActions: [
            {
              text: "강남대로를 피하고 지상 보행로에서 경로를 다시 확인하세요.",
              sourceKind: "LIVE_DATA",
              evidenceRefs: ["traffic-1"],
            },
          ],
          disasterActions: [
            {
              text: "침수된 길은 수심을 추정해 건너지 마세요.",
              sourceKind: "GENERAL_KNOWLEDGE",
              evidenceRefs: [],
            },
          ],
          recommendedShelterReason: {
            text: "통제 구간을 피하는 현재 추천 경로가 연결됩니다.",
            sourceKind: "LIVE_DATA",
            evidenceRefs: ["traffic-1"],
          },
          movementWarnings: [
            {
              text: "강남대로 침수 통제 구간에 진입하지 마세요.",
              sourceKind: "LIVE_DATA",
              evidenceRefs: ["traffic-1"],
            },
          ],
          alternativeShelterReasons: [
            {
              shelterId: alternateShelter.id,
              reason: {
                text: "주 대피소 이용이 어려울 때 확인할 대체 후보입니다.",
                sourceKind: "GENERAL_KNOWLEDGE",
                evidenceRefs: [],
              },
            },
          ],
        }}
        alternativeShelters={[
          {
            shelter: alternateShelter,
            distanceMeters: 930,
            distanceKind: "STRAIGHT_LINE",
            routeVerified: false,
          },
        ]}
      />,
    );

    const risk = screen.getByRole("region", { name: "현재 위험도" });
    const action = screen.getByRole("region", { name: "지금 해야 할 행동" });
    const recommendation = screen.getByRole("region", { name: "추천 대피소" });
    const warnings = screen.getByRole("region", { name: "이동 시 주의사항" });
    const alternatives = screen.getByRole("region", { name: "대체 대피소" });

    expect(risk.compareDocumentPosition(action)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(action.compareDocumentPosition(recommendation)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(recommendation.compareDocumentPosition(warnings)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(warnings.compareDocumentPosition(alternatives)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getAllByText("실시간 데이터").length).toBeGreaterThan(0);
    expect(screen.getAllByText("일반 안전 지식").length).toBeGreaterThan(0);
    expect(screen.getByText(alternateShelter.name)).toBeInTheDocument();
    expect(within(alternatives).getByText(/직선거리.*경로 미확인/)).toBeInTheDocument();
  });

  test("지연·저장 근거를 실시간 데이터라고 표시하지 않는다", () => {
    render(
      <ActionCard
        level="UNKNOWN"
        timestamp={null}
        apiStatus="FALLBACK"
        facts={[
          {
            id: "risk-current",
            kind: "RISK",
            text: "데이터 확인 불가",
            source: "재난 API",
            observedAt: null,
            status: "FALLBACK",
          },
        ]}
      />,
    );
    expect(screen.queryByText("실시간 데이터")).not.toBeInTheDocument();
    expect(screen.getByText("지연·저장 데이터")).toBeInTheDocument();
  });

  test("Gemini 분석 중에도 규칙 기반 즉시 행동을 숨기지 않는다", () => {
    render(
      <ActionCard
        level="CRITICAL"
        shelter={shelter}
        timestamp="2026-06-11T14:30:00+09:00"
        isAiLoading
      />,
    );

    expect(screen.getByText(RISK_META.CRITICAL.actionTitle)).toBeInTheDocument();
    expect(screen.getByText(RISK_META.CRITICAL.actionBody)).toBeInTheDocument();
    expect(screen.getByText(/Gemini가 세부 근거를 분석 중/)).toBeInTheDocument();
  });

  test("shows absolute and relative age together and marks stale data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T11:00:00.000Z"));

    render(
      <ActionCard
        level="WARNING"
        shelter={shelter}
        timestamp="2026-08-31T09:00:00.000Z"
        apiStatus="OK"
      />,
    );

    expect(screen.getByText(/2시간 전/)).toBeInTheDocument();
    expect(screen.getByText("데이터 지연")).toBeInTheDocument();
  });

  test("does not invent a timestamp when no source succeeded", () => {
    render(<ActionCard level="UNKNOWN" shelter={shelter} timestamp={null} />);

    expect(screen.getByText(/데이터 기준 확실한 정보 없음/)).toBeInTheDocument();
  });

  test("uses a custom shelter label when the shelter was manually selected", () => {
    render(
      <ActionCard
        level="SAFE"
        shelter={shelter}
        timestamp="2026-06-11T14:30:00+09:00"
        shelterLabel="선택 대피소"
      />,
    );

    expect(screen.getByText("선택 대피소")).toBeInTheDocument();
  });

  test("shows the explicitly stale last action while offline data is restored", () => {
    render(
      <ActionCard
        level="WARNING"
        shelter={shelter}
        timestamp="2026-06-11T14:30:00+09:00"
        offlineAction={{
          title: "마지막 확인 행동요령",
          body: "저장된 안전 경로만 이용하세요.",
        }}
      />,
    );

    expect(screen.getByText("마지막 확인 행동요령")).toBeInTheDocument();
    expect(screen.getByText("저장된 안전 경로만 이용하세요.")).toBeInTheDocument();
  });

  test("opens route comparison only through the home route action buttons", () => {
    render(<ActionCard level="SAFE" shelter={shelter} timestamp="2026-06-11T14:30:00+09:00" />);

    expect(screen.getByRole("link", { name: /경로 미리 보기/ })).toHaveAttribute(
      "href",
      "/routes?mode=WALK",
    );
    expect(screen.getByRole("link", { name: /차량 경로/ })).toHaveAttribute(
      "href",
      "/routes?mode=DRIVE",
    );
  });

  test("does not promise a safe path when the route may require risk review", () => {
    expect(RISK_META.WARNING.ctaLabel).toBe("경로 위험 확인");
  });

  test.each<RiskLevel>(["SAFE", "WATCH", "WARNING", "CRITICAL", "UNKNOWN"])(
    "%s 단계에서 수동 음성 듣기 버튼을 제공한다",
    (level) => {
      installSpeechApi();

      render(<ActionCard level={level} shelter={shelter} timestamp={null} />);

      expect(screen.getByRole("button", { name: "추천 행동 음성으로 듣기" })).toBeInTheDocument();
    },
  );

  test("화면에 표시된 제목과 본문을 같은 문장으로 읽는다", () => {
    const { speakMock } = installSpeechApi();
    render(
      <ActionCard
        level="WATCH"
        shelter={shelter}
        timestamp={null}
        offlineAction={{
          title: "침수 도로를 피하세요",
          body: "저장된 안전 경로만 이용하세요.",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "추천 행동 음성으로 듣기" }));

    expect(screen.getByText("침수 도로를 피하세요")).toBeInTheDocument();
    expect(screen.getByText("저장된 안전 경로만 이용하세요.")).toBeInTheDocument();
    expect((speakMock.mock.calls[0]?.[0] as { text: string }).text).toBe(
      "침수 도로를 피하세요. 저장된 안전 경로만 이용하세요.",
    );
  });

  test("음성 API 미지원 환경에서는 재생 버튼을 숨긴다", () => {
    Reflect.deleteProperty(window, "speechSynthesis");

    render(<ActionCard level="WARNING" shelter={shelter} timestamp={null} />);

    expect(
      screen.queryByRole("button", { name: "추천 행동 음성으로 듣기" }),
    ).not.toBeInTheDocument();
  });

  test("사용자가 동의하고 상호작용하면 CRITICAL 안내를 자동으로 한 번 읽는다", async () => {
    const { speakMock } = installSpeechApi();
    useScenario.setState({ speechEnabled: true });
    render(<ActionCard level="CRITICAL" shelter={shelter} timestamp={null} />);

    expect(speakMock).not.toHaveBeenCalled();
    fireEvent.click(document.body);

    await waitFor(() => expect(speakMock).toHaveBeenCalledOnce());
  });
});
