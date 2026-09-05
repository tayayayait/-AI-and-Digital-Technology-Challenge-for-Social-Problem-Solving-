import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { oldestSuccessfulTimestamp } from "@/lib/api/dataTimestamp";
import { queryNetworkSignal } from "@/lib/offline/networkSignal";
import { useCctvAnalysisStore } from "@/store/cctvAnalysis";
import { useRiskAssessment } from "./useRiskAssessment";

const mocks = vi.hoisted(() => ({
  online: true,
  weatherLoading: false,
  weatherFetching: false,
  weatherFetchedAfterMount: true,
  setRiskAssessment: vi.fn(),
}));

vi.mock("@/store/scenario", () => ({
  useScenario: () => ({ setRiskAssessment: mocks.setRiskAssessment }),
}));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: () => mocks.online,
}));

vi.mock("./useReverseGeocode", () => ({
  useReverseGeocode: () => "부산 해운대구",
}));

vi.mock("./useWeather", () => ({
  useWeather: () => ({
    isLoading: mocks.weatherLoading,
    isFetching: mocks.weatherFetching,
    isFetchedAfterMount: mocks.weatherFetchedAfterMount,
    result: {
      data: { rainfallMmPerHour: 0, alerts: [] },
      status: "OK",
      timestamp: "2026-08-31T08:10:00.000Z",
      source: "kma-weather",
    },
  }),
}));

vi.mock("./useDisasterMessages", () => ({
  useDisasterMessages: () => ({
    isLoading: false,
    isFetching: false,
    isFetchedAfterMount: true,
    result: {
      data: [],
      status: "FALLBACK",
      timestamp: "2026-08-31T08:00:00.000Z",
      source: "demo-disaster-messages",
    },
  }),
}));

vi.mock("./useWeatherWarnings", () => ({
  useWeatherWarnings: () => ({
    result: {
      data: null,
      status: "OK",
      timestamp: "2026-08-31T08:05:00.000Z",
      source: "kma-weather-warning",
    },
    warnings: {
      warnings: [],
      alerts: [],
      floodLevel: null,
      announcedAt: null,
      status: "OK",
    },
  }),
}));

vi.mock("./useWmsOverlap", () => ({
  useWmsOverlap: () => ({
    floodTraceOverlap: 0,
    riverFloodOverlap: 0,
    safeMapEvidence: [],
  }),
}));

vi.mock("./useSensorFeeds", () => ({
  useSensorFeeds: () => ({ feeds: [] }),
}));

vi.mock("./useTrafficEvents", () => ({
  useTrafficEvents: () => ({
    events: [
      {
        id: "traffic-1",
        type: "incident",
        eventType: "돌발",
        eventDetailType: "침수",
        position: { lat: 35.1631, lng: 129.1635 },
        roadName: "해운대로",
        message: "통제중",
        source: "ITS",
      },
    ],
    result: {
      data: [],
      status: "OK",
      timestamp: "2026-08-31T08:07:00.000Z",
      source: "ITS traffic-events",
    },
  }),
}));

describe("useRiskAssessment", () => {
  beforeEach(() => {
    mocks.online = true;
    mocks.weatherLoading = false;
    mocks.weatherFetching = false;
    mocks.weatherFetchedAfterMount = true;
    mocks.setRiskAssessment.mockClear();
    queryNetworkSignal.reset();
    useCctvAnalysisStore.getState().reset();
  });

  test("returns the actual timestamps and statuses used by the assessment", () => {
    const { result } = renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(result.current.dataSources).toEqual([
      {
        label: "기상청 단기예보",
        timestamp: "2026-08-31T08:10:00.000Z",
        status: "OK",
      },
      {
        label: "기상청 기상특보",
        timestamp: "2026-08-31T08:05:00.000Z",
        status: "OK",
      },
      {
        label: "긴급재난문자",
        timestamp: "2026-08-31T08:00:00.000Z",
        status: "FALLBACK",
      },
    ]);
    expect(oldestSuccessfulTimestamp(result.current.dataSources)).toBe("2026-08-31T08:05:00.000Z");
    expect(result.current.trafficControl).toBe(5);
    expect(result.current.reasons).toContain("해운대로 침수 통제중");
  });

  test("does not overwrite the last persisted risk assessment while offline", () => {
    mocks.online = false;
    renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(mocks.setRiskAssessment).not.toHaveBeenCalled();
  });

  test("does not overwrite the persisted assessment with loading placeholders", () => {
    mocks.weatherLoading = true;
    renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(mocks.setRiskAssessment).not.toHaveBeenCalled();
  });

  test("does not overwrite persisted risk while cached data is being revalidated", () => {
    mocks.weatherFetching = true;
    renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(mocks.setRiskAssessment).not.toHaveBeenCalled();
  });

  test("rechecks the synchronous failure signal before persisting during a React update race", () => {
    queryNetworkSignal.reportFailure();
    queryNetworkSignal.reportFailure();
    expect(mocks.online).toBe(true);

    renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(mocks.setRiskAssessment).not.toHaveBeenCalled();
  });

  test("does not persist a calculation made only from restored query cache", () => {
    mocks.weatherFetchedAfterMount = false;

    const { result } = renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(mocks.setRiskAssessment).not.toHaveBeenCalled();
    expect(result.current.isCurrentDataConfirmed).toBe(false);
  });

  test("현재 위치 500m 내 공식 등록 지하차도를 위험도 인자로 연결한다", () => {
    const { result } = renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(result.current.underpass).toBe(5);
    expect(result.current.reasons).toContain("현재 위치 주변 지하차도");
    expect(result.current.underpassCoverage.status).toBe("COVERED");
  });

  test("2km 이내의 유효한 CCTV 판독을 독립 근거로 위험 계산에 전달한다", () => {
    useCctvAnalysisStore.getState().record({
      cameraId: "cctv-nearby",
      cameraName: "해운대로 CCTV",
      position: { lat: 35.1632, lng: 129.1636 },
      flooded: true,
      depthGrade: "DEEP",
      passable: false,
      confidence: 0.86,
      observation: "차로에 깊은 침수가 보입니다.",
      frameDataUrl: "data:image/jpeg;base64,YWJj",
      analyzedAt: "2099-08-31T08:00:00.000Z",
      expiresAt: "2099-08-31T08:10:00.000Z",
    });

    const { result } = renderHook(() => useRiskAssessment({ lat: 35.1631, lng: 129.1635 }));

    expect(result.current.cctvFlood).toBe(10);
    expect(result.current.reasons).toContain("CCTV AI 판독 DEEP");
    expect(result.current.total).toBe(20);
  });
});
