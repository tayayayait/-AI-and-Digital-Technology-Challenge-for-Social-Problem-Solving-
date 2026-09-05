import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RiskZone, Shelter, TrafficEvent } from "@/lib/types";
import { useScenario } from "@/store/scenario";
import { useDynamicRiskZones } from "./useDynamicRiskZones";

const mocks = vi.hoisted(() => ({
  buildRiskZones: vi.fn(),
  disasterMessages: vi.fn(),
  reverseGeocode: vi.fn(() => "부산 해운대구"),
  sensorFeeds: vi.fn(),
  shelters: vi.fn(),
  trafficEvents: vi.fn(),
  weather: vi.fn(),
  weatherWarnings: vi.fn(),
}));

vi.mock("@/lib/ops/riskZoneBuilder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops/riskZoneBuilder")>();
  return { ...actual, buildRiskZones: (options: unknown) => mocks.buildRiskZones(options) };
});

vi.mock("./useReverseGeocode", () => ({
  useReverseGeocode: () => mocks.reverseGeocode(),
}));

vi.mock("./useShelters", () => ({
  useShelters: (origin: unknown, radius?: number, enabled?: boolean) =>
    mocks.shelters(origin, radius, enabled),
}));

vi.mock("./useTrafficEvents", () => ({
  useTrafficEvents: (origin: unknown, enabled?: boolean) => mocks.trafficEvents(origin, enabled),
}));

vi.mock("./useSensorFeeds", () => ({
  useSensorFeeds: (origin: unknown) => mocks.sensorFeeds(origin),
}));

vi.mock("./useWeather", () => ({
  useWeather: (options: unknown) => mocks.weather(options),
}));

vi.mock("./useWeatherWarnings", () => ({
  useWeatherWarnings: (options: unknown) => mocks.weatherWarnings(options),
}));

vi.mock("./useDisasterMessages", () => ({
  useDisasterMessages: (options: unknown) => mocks.disasterMessages(options),
}));

const origin = { lat: 35.1631, lng: 129.1635 };

const shelter: Shelter = {
  id: "busan-shelter",
  name: "해운대구 문화복합센터",
  address: "부산 해운대구 센텀중앙로 170",
  position: { lat: 35.169, lng: 129.18 },
  capacity: 1200,
  status: "OPERATING",
  underground: false,
  type: "지자체 대피시설",
};

const trafficEvent: TrafficEvent = {
  id: "busan-event",
  type: "통제",
  eventType: "침수",
  position: { lat: 35.165, lng: 129.17 },
  roadName: "센텀중앙로",
  message: "침수 통제",
  source: "ITS",
};

const dynamicZone: RiskZone = {
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

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  useScenario.setState({ origin, locationStatus: "GRANTED" });
  mocks.shelters.mockReturnValue({ shelters: [shelter], isLoading: false, error: null });
  mocks.trafficEvents.mockReturnValue({
    events: [trafficEvent],
    result: { status: "OK", timestamp: "2026-08-31T08:04:00.000Z" },
    isLoading: false,
  });
  mocks.sensorFeeds.mockReturnValue({
    feeds: [
      {
        id: "sensor-1",
        name: "수영강 수위",
        provider: "홍수통제소",
        region: "부산",
        status: "ACTIVE",
        source: "HRFCO",
        lastObservedAt: "2026-08-31T08:03:00.000Z",
        type: "WATER_LEVEL",
        position: { lat: 35.165, lng: 129.166 },
        currentLevel: 3.2,
      },
    ],
    isLoading: false,
  });
  mocks.weather.mockReturnValue({
    result: {
      data: { observedAt: "2026-08-31T08:00:00.000Z", rainfallMmPerHour: 12, alerts: [] },
      status: "OK",
      timestamp: "2026-08-31T08:00:00.000Z",
    },
    isLoading: false,
  });
  mocks.weatherWarnings.mockReturnValue({
    result: { status: "OK", timestamp: "2026-08-31T08:01:00.000Z" },
    warnings: {
      warnings: [
        {
          phenomenon: "호우",
          grade: "주의보",
          level: "WARNING",
          wide: "부산",
          zones: ["해운대구"],
          floodRelevant: true,
        },
      ],
      alerts: [],
      floodLevel: "WARNING",
      announcedAt: "2026-08-31T08:01:00.000Z",
      nationwideCount: 1,
      status: "OK",
    },
    isLoading: false,
  });
  mocks.disasterMessages.mockReturnValue({
    result: {
      data: [
        {
          id: "message-1",
          region: "부산 해운대구",
          body: "수영강 수위 상승",
          issuedAt: "2026-08-31T08:02:00.000Z",
          source: "MOIS",
        },
      ],
      status: "OK",
      timestamp: "2026-08-31T08:02:00.000Z",
    },
    isLoading: false,
  });
  mocks.buildRiskZones.mockResolvedValue({
    zones: [dynamicZone],
    status: "READY",
    sampledCells: 36,
    failedCells: 0,
  });
});

describe("useDynamicRiskZones", () => {
  test("실측 데이터 묶음을 현재 관심지역 격자 빌더에 전달한다", async () => {
    const { result } = renderHook(() => useDynamicRiskZones(), { wrapper: createWrapper() });

    await waitFor(() => expect(mocks.buildRiskZones).toHaveBeenCalledOnce());
    expect(mocks.shelters).toHaveBeenCalledWith(origin, 5_000, true);
    expect(mocks.trafficEvents).toHaveBeenCalledWith(origin, true);
    expect(mocks.sensorFeeds).toHaveBeenCalledWith(origin);
    expect(mocks.weather).toHaveBeenCalledWith({ origin, enabled: true });
    expect(mocks.weatherWarnings).toHaveBeenCalledWith({
      region: "부산 해운대구",
      enabled: true,
    });
    expect(mocks.disasterMessages).toHaveBeenCalledWith({
      region: "부산 해운대구",
      enabled: true,
    });
    expect(mocks.buildRiskZones).toHaveBeenCalledWith(
      expect.objectContaining({
        regionName: "부산 해운대구",
        signals: expect.objectContaining({
          weather: expect.objectContaining({ rainfallMmPerHour: 12 }),
          disasterMessages: [expect.objectContaining({ id: "message-1" })],
          sensors: [expect.objectContaining({ id: "sensor-1" })],
          trafficEvents: [trafficEvent],
          floodWarningLevel: "WARNING",
          floodWarningTitle: "호우주의보",
        }),
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("READY"));
    expect(result.current.riskZones).toEqual([dynamicZone]);
    expect(result.current.shelters).toEqual([shelter]);
  });

  test("위치가 설정되지 않으면 기본 강남 좌표로 위험구역을 만들지 않는다", () => {
    useScenario.setState({ locationStatus: "PROMPT" });

    const { result } = renderHook(() => useDynamicRiskZones(), { wrapper: createWrapper() });

    expect(result.current.status).toBe("IDLE");
    expect(mocks.buildRiskZones).not.toHaveBeenCalled();
    expect(mocks.shelters).toHaveBeenCalledWith(origin, 5_000, false);
    expect(mocks.trafficEvents).toHaveBeenCalledWith(origin, false);
    expect(mocks.sensorFeeds).toHaveBeenCalledWith(undefined);
    expect(mocks.weather).toHaveBeenCalledWith({ origin, enabled: false });
    expect(mocks.weatherWarnings).toHaveBeenCalledWith({
      region: "부산 해운대구",
      enabled: false,
    });
    expect(mocks.disasterMessages).toHaveBeenCalledWith({
      region: "부산 해운대구",
      enabled: false,
    });
  });
});
