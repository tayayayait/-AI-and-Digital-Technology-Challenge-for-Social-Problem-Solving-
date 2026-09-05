import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, test, vi } from "vitest";

import { ROUTE_FAILURE_MESSAGE, useRoutes } from "./useRoutes";
import type { LatLng, RouteMode, RouteResult, Shelter } from "@/lib/types";

const origin: LatLng = { lat: 37.4979, lng: 127.0276 };

const shelters: Shelter[] = [
  {
    id: "s-01",
    name: "역삼초등학교 체육관",
    address: "서울 강남구 역삼로 153",
    position: { lat: 37.5005, lng: 127.0354 },
    capacity: 420,
    status: "OPERATING",
    underground: false,
    type: "민방위대피시설",
  },
  {
    id: "s-02",
    name: "강남구청 지하 1층",
    address: "서울 강남구 학동로 426",
    position: { lat: 37.5174, lng: 127.0476 },
    capacity: 300,
    status: "EXCLUDED",
    underground: true,
    type: "민방위대피시설",
  },
];

const route = (mode: RouteMode, id: string): RouteResult => ({
  id,
  mode,
  status: "RECOMMENDED",
  name: mode === "WALK" ? "TMAP 보행 경로" : "NAVER 차량 경로",
  distanceMeters: mode === "WALK" ? 920 : 2400,
  durationSeconds: mode === "WALK" ? 840 : 540,
  safetyScore: 78,
  riskReasons: [],
  geometry: [origin, shelters[0].position],
  shelterId: "external",
});

const wrapper = ({ children }: PropsWithChildren) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe("useRoutes", () => {
  test("loads NAVER drive and TMAP walking routes through injected Edge clients", async () => {
    const naverDirections = vi.fn().mockResolvedValue([route("DRIVE", "drive-1")]);
    const tmapPedestrian = vi.fn().mockResolvedValue([route("WALK", "walk-1")]);

    const { result } = renderHook(
      () =>
        useRoutes({
          origin,
          shelters,
          clients: { naverDirections, tmapPedestrian },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(naverDirections).toHaveBeenCalledWith({
      origin,
      destination: shelters[0].position,
    });
    expect(tmapPedestrian).toHaveBeenCalledWith({
      origin,
      destination: shelters[0].position,
    });
    expect(result.current.routes.map((r) => [r.mode, r.shelterId])).toEqual([
      ["WALK", "s-01"],
      ["DRIVE", "s-01"],
    ]);
    expect(result.current.failureMessage).toBeUndefined();
  });

  test("keeps the available travel mode when the other route API fails", async () => {
    const { result } = renderHook(
      () =>
        useRoutes({
          origin,
          shelters,
          clients: {
            naverDirections: vi.fn().mockResolvedValue([route("DRIVE", "drive-1")]),
            tmapPedestrian: vi.fn().mockRejectedValue(new Error("TMAP timeout")),
          },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.routes.map((r) => r.mode)).toEqual(["DRIVE"]);
    expect(result.current.results.walk.status).toBe("FAILED");
    expect(result.current.results.drive.status).toBe("OK");
    expect(result.current.failureMessage).toBeUndefined();
  });

  test("returns straight-line shelter fallback when both route APIs fail", async () => {
    const { result } = renderHook(
      () =>
        useRoutes({
          origin,
          shelters,
          clients: {
            naverDirections: vi.fn().mockRejectedValue(new Error("NAVER timeout")),
            tmapPedestrian: vi.fn().mockRejectedValue(new Error("TMAP timeout")),
          },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.routes).toEqual([]);
    expect(result.current.failureMessage).toBe(ROUTE_FAILURE_MESSAGE);
    expect(result.current.fallbackShelters.map(({ shelter }) => shelter.id)).toEqual(["s-01"]);
  });

  test("keeps an empty 부산 result region-neutral", async () => {
    const { result } = renderHook(
      () =>
        useRoutes({
          origin: { lat: 35.1631, lng: 129.1635 },
          shelters: [],
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.failureMessage).toContain("주변 반경");
    expect(result.current.failureMessage).not.toMatch(/서울|강남|역삼|탄천/);
  });

  test("does not call route APIs while route loading is disabled", async () => {
    const naverDirections = vi.fn().mockResolvedValue([route("DRIVE", "drive-1")]);
    const tmapPedestrian = vi.fn().mockResolvedValue([route("WALK", "walk-1")]);

    const { result } = renderHook(
      () =>
        useRoutes({
          origin,
          shelters,
          clients: { naverDirections, tmapPedestrian },
          enabled: false,
        }),
      { wrapper },
    );

    expect(result.current.routes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(naverDirections).not.toHaveBeenCalled();
    expect(tmapPedestrian).not.toHaveBeenCalled();
  });

  test("requests stair avoidance and lengthens walking ETA in mobility mode", async () => {
    const naverDirections = vi.fn().mockResolvedValue([route("DRIVE", "drive-1")]);
    const tmapPedestrian = vi.fn().mockResolvedValue([route("WALK", "walk-1")]);

    const { result } = renderHook(
      () =>
        useRoutes({
          origin,
          shelters,
          clients: { naverDirections, tmapPedestrian },
          mobilityMode: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(tmapPedestrian).toHaveBeenCalledWith({
      origin,
      destination: shelters[0].position,
      avoidStairs: true,
    });
    expect(
      result.current.routes.find((candidate) => candidate.mode === "WALK")?.durationSeconds,
    ).toBe(1227);
  });
});
