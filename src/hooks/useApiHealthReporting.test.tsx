import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RouteResult, Shelter } from "@/lib/types";
import { useDisasterMessages } from "./useDisasterMessages";
import { useRoutes } from "./useRoutes";
import { useSensorFeeds } from "./useSensorFeeds";
import { useShelters } from "./useShelters";
import { useTrafficEvents } from "./useTrafficEvents";
import { useWeather } from "./useWeather";
import { useWeatherWarnings } from "./useWeatherWarnings";

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  fetchSensorFeeds: vi.fn(),
  fetchShelters: vi.fn(),
  fetchTrafficEvents: vi.fn(),
}));

vi.mock("@/store/apiHealth", () => ({
  API_HEALTH_SOURCE_NAMES: {
    naverDirections: "NAVER Directions 5",
    tmapPedestrian: "TMAP 보행자 경로",
    weather: "기상청 초단기실황/단기예보",
    weatherWarnings: "기상청 기상특보",
    disasterMessages: "행정안전부 긴급재난문자",
    trafficEvents: "ITS 돌발상황",
    sensorFeeds: "한강홍수통제소 수문 센서",
    shelters: "이재민 임시주거시설",
  },
  useApiHealthStore: {
    getState: () => ({ report: mocks.report }),
  },
}));

vi.mock("@/lib/sensors/sensorAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sensors/sensorAccess")>();
  return { ...actual, fetchSensorFeeds: mocks.fetchSensorFeeds };
});

vi.mock("@/lib/shelters/shelterApi", () => ({
  fetchShelters: mocks.fetchShelters,
  fetchSheltersResult: async () => ({
    data: await mocks.fetchShelters(),
    status: "OK",
    timestamp: new Date().toISOString(),
    source: "shelter_operations",
  }),
}));

vi.mock("@/lib/api/trafficEvents", () => ({
  fetchTrafficEvents: mocks.fetchTrafficEvents,
}));

const origin = { lat: 35.1631, lng: 129.1635 };
const shelter: Shelter = {
  id: "shelter-busan",
  name: "해운대구 문화복합센터",
  address: "부산 해운대구 센텀중앙로 170",
  position: { lat: 35.165, lng: 129.165 },
  capacity: 1200,
  status: "OPERATING",
  underground: false,
  type: "이재민 임시주거시설",
};

const route = (mode: "WALK" | "DRIVE"): RouteResult => ({
  id: `route-${mode}`,
  mode,
  status: "RECOMMENDED",
  name: `${mode} route`,
  distanceMeters: 500,
  durationSeconds: 300,
  safetyScore: 90,
  riskReasons: [],
  geometry: [origin, shelter.position],
  shelterId: shelter.id,
});

let queryClient: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("API health hook reporting", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.report.mockReset();
    mocks.fetchSensorFeeds.mockReset().mockResolvedValue([
      {
        id: "water-1",
        name: "수위 관측소",
        provider: "한강홍수통제소",
        region: "부산",
        status: "ACTIVE",
        source: "HRFCO",
        lastObservedAt: "2026-09-03T04:00:00.000Z",
      },
    ]);
    mocks.fetchShelters.mockReset().mockResolvedValue([shelter]);
    mocks.fetchTrafficEvents.mockReset().mockResolvedValue({
      events: [],
      status: "OK",
      source: "ITS eventInfo",
    });
  });

  test("7개 데이터 훅이 실제 결과와 체감 응답시간을 각 소스별로 보고한다", async () => {
    const weatherClient = vi.fn().mockResolvedValue({
      observedAt: "20260903T0400",
      rainfallMmPerHour: 2,
      alerts: [],
    });
    const warningClient = vi.fn().mockResolvedValue({
      warnings: [],
      alerts: [],
      floodLevel: null,
      announcedAt: "2026-09-03T04:00:00.000Z",
      nationwideCount: 0,
      status: "OK",
    });
    const disasterClient = vi.fn().mockResolvedValue({ messages: [] });
    const naverDirections = vi.fn().mockResolvedValue([route("DRIVE")]);
    const tmapPedestrian = vi.fn().mockResolvedValue([route("WALK")]);

    renderHook(
      () => {
        useWeather({ origin, client: weatherClient });
        useWeatherWarnings({ region: "부산 해운대구", client: warningClient });
        useDisasterMessages({
          region: "부산 해운대구",
          startDate: "20260903",
          client: disasterClient,
        });
        useTrafficEvents(origin);
        useSensorFeeds(origin);
        useShelters(origin);
        useRoutes({
          origin,
          shelters: [shelter],
          clients: { naverDirections, tmapPedestrian },
        });
      },
      { wrapper },
    );

    const expectedNames = [
      "기상청 초단기실황/단기예보",
      "기상청 기상특보",
      "행정안전부 긴급재난문자",
      "ITS 돌발상황",
      "한강홍수통제소 수문 센서",
      "이재민 임시주거시설",
      "NAVER Directions 5",
      "TMAP 보행자 경로",
    ];
    await waitFor(() => {
      const reportedNames = mocks.report.mock.calls.map(([name]) => name);
      expect(reportedNames).toEqual(expect.arrayContaining(expectedNames));
    });

    for (const name of expectedNames) {
      const call = mocks.report.mock.calls.find(([reportedName]) => reportedName === name);
      expect(call?.[1]).toMatchObject({ status: "OK" });
      expect(call?.[2]).toEqual(expect.any(Number));
    }
  });
});
