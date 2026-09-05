import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ROUTE_FAILURE_MESSAGE, selectDisplayedMode, type RoutesState } from "@/hooks/useRoutes";
import type { LatLng, RouteResult, Shelter } from "@/lib/types";
import { RoutesView, canOpenRoutesPage, routeModeSearch } from "./routes";

const clientMapMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/map/ClientMap", () => ({
  ClientMap: (props: { shelters?: Shelter[] }) => {
    clientMapMock(props);
    return <div data-testid="route-map" />;
  },
}));

const origin: LatLng = { lat: 37.4979, lng: 127.0276 };

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

const unselectedShelter: Shelter = {
  id: "s-02",
  name: "강남구청 지하 1층",
  address: "서울 강남구 학동로 426",
  position: { lat: 37.5174, lng: 127.0476 },
  capacity: 300,
  status: "OPERATING",
  underground: false,
  type: "민방위대피시설",
};

const driveRoute: RouteResult = {
  id: "drive-1",
  mode: "DRIVE",
  status: "RECOMMENDED",
  name: "NAVER 차량 경로",
  distanceMeters: 2400,
  durationSeconds: 540,
  safetyScore: 82,
  riskReasons: ["통제 후보 도로 회피"],
  geometry: [origin, shelter.position],
  shelterId: shelter.id,
};

const rejectedWalkRoute: RouteResult = {
  id: "walk-rejected",
  mode: "WALK",
  status: "REJECTED",
  name: "TMAP 보행 경로",
  distanceMeters: 192800,
  durationSeconds: 186000,
  safetyScore: 0,
  riskReasons: ["침수 이력 구간 포함", "지하차도 통과"],
  geometry: [origin, shelter.position],
  shelterId: shelter.id,
};

const alternativeDriveRoute: RouteResult = {
  ...driveRoute,
  id: "drive-2",
  status: "ALTERNATIVE",
  name: "대안 차량 경로",
  safetyScore: 74,
};

const rejectedDriveRoute: RouteResult = {
  ...driveRoute,
  id: "drive-rejected",
  status: "REJECTED",
  name: "제외 차량 경로",
  safetyScore: 21,
};

const routeState = (overrides: Partial<RoutesState>): RoutesState => ({
  routes: [],
  isLoading: false,
  apiStatus: "OK",
  results: {
    walk: {
      data: [],
      status: "OK",
      timestamp: "2026-06-11T08:00:00.000Z",
      source: "tmap-pedestrian",
    },
    drive: {
      data: [],
      status: "OK",
      timestamp: "2026-06-11T08:00:00.000Z",
      source: "naver-directions",
    },
  },
  fallbackShelters: [],
  underpassCoverage: {
    status: "COVERED",
    label: "전국 등록 지하차도",
    recordCount: 969,
    dataDate: "2025-12-31",
  },
  ...overrides,
});

describe("RoutesView", () => {
  test("allows route comparison only after a home location has been selected", () => {
    expect(canOpenRoutesPage("GRANTED")).toBe(true);
    expect(canOpenRoutesPage("PROMPT")).toBe(false);
    expect(canOpenRoutesPage("DENIED")).toBe(false);
    expect(canOpenRoutesPage("ERROR")).toBe(false);
  });

  test("passes only the shelter targeted by the displayed route to the map", () => {
    clientMapMock.mockClear();

    render(
      <RoutesView
        origin={origin}
        mode="DRIVE"
        onModeChange={vi.fn()}
        routeState={routeState({ routes: [driveRoute] })}
        shelters={[shelter, unselectedShelter]}
      />,
    );

    const props = clientMapMock.mock.calls.at(-1)?.[0];
    expect(props?.shelters).toEqual([shelter]);
  });

  test("자동 긴급 진입에서는 추천 경로만 펼치고 대안·제외 경로를 접는다", () => {
    clientMapMock.mockClear();

    render(
      <RoutesView
        origin={origin}
        mode="DRIVE"
        onModeChange={vi.fn()}
        routeState={routeState({
          routes: [driveRoute, alternativeDriveRoute, rejectedDriveRoute],
        })}
        shelters={[shelter]}
        autoFocusRecommended
      />,
    );

    const collapsed = screen.getByText("대안·제외 경로 2개 보기").closest("details");
    expect(collapsed).not.toHaveAttribute("open");
    expect(clientMapMock.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ routes: [driveRoute] }),
    );
  });

  test("prefers the available route mode when the selected mode failed", () => {
    expect(selectDisplayedMode("WALK", [driveRoute])).toBe("DRIVE");

    render(
      <RoutesView
        origin={origin}
        mode="WALK"
        onModeChange={vi.fn()}
        routeState={routeState({ routes: [driveRoute], apiStatus: "FAILED" })}
        shelters={[shelter]}
      />,
    );

    expect(screen.getByText("NAVER 차량 경로")).toBeInTheDocument();
    expect(screen.queryByText("TMAP 보행 경로")).not.toBeInTheDocument();
  });

  test("keeps the requested route mode selected even when route content falls back", () => {
    render(
      <RoutesView
        origin={origin}
        mode="WALK"
        onModeChange={vi.fn()}
        routeState={routeState({ routes: [driveRoute], apiStatus: "FAILED" })}
        shelters={[shelter]}
      />,
    );

    expect(screen.getByRole("tab", { name: "도보" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "차량" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("NAVER 차량 경로")).toBeInTheDocument();
  });

  test("shows the exact failure message and straight-line shelters when all route APIs fail", () => {
    render(
      <RoutesView
        origin={origin}
        mode="WALK"
        onModeChange={vi.fn()}
        routeState={routeState({
          apiStatus: "FAILED",
          failureMessage: ROUTE_FAILURE_MESSAGE,
          fallbackShelters: [{ shelter, distanceMeters: 744 }],
        })}
        shelters={[shelter]}
      />,
    );

    expect(screen.getByText(ROUTE_FAILURE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("역삼초등학교 체육관")).toBeInTheDocument();
    expect(screen.getByText("직선거리 744m")).toBeInTheDocument();
  });

  test("shows an explicit no-safe-route advisory when every route for the selected mode is rejected", () => {
    render(
      <RoutesView
        origin={origin}
        mode="WALK"
        onModeChange={vi.fn()}
        routeState={routeState({ routes: [rejectedWalkRoute] })}
        shelters={[shelter]}
      />,
    );

    expect(screen.getByText("안전 경로 없음")).toBeInTheDocument();
    expect(
      screen.getByText(/현재 선택한 이동수단의 모든 후보 경로가 제외되었습니다/),
    ).toBeInTheDocument();
    expect(screen.getByText("제외된 후보 경로")).toBeInTheDocument();
  });

  test("builds a route search object for the selected mode", () => {
    expect(routeModeSearch("DRIVE")).toEqual({ mode: "DRIVE" });
    expect(routeModeSearch("WALK")).toEqual({ mode: "WALK" });
    expect(routeModeSearch("safest", true)).toEqual({ mode: "safest", auto: true });
  });

  test("shows the oldest successful route response timestamp", () => {
    render(
      <RoutesView
        origin={origin}
        mode="DRIVE"
        onModeChange={vi.fn()}
        routeState={routeState({
          routes: [driveRoute],
          results: {
            walk: {
              data: [],
              status: "OK",
              timestamp: "2026-06-11T08:00:00.000Z",
              source: "tmap-pedestrian",
            },
            drive: {
              data: [driveRoute],
              status: "OK",
              timestamp: "2026-06-11T09:00:00.000Z",
              source: "naver-directions",
            },
          },
        })}
        shelters={[shelter]}
      />,
    );

    expect(screen.getByText(/데이터 기준 2026-06-11 17:00/)).toBeInTheDocument();
  });

  test("shows the underpass dataset coverage and reference date", () => {
    render(
      <RoutesView
        origin={origin}
        mode="DRIVE"
        onModeChange={vi.fn()}
        routeState={routeState({ routes: [driveRoute] })}
        shelters={[shelter]}
      />,
    );

    expect(screen.getByLabelText("지하차도 데이터 범위")).toHaveTextContent(
      "전국 등록 지하차도 969개 · 2025-12-31 기준",
    );
  });

  test("discloses when the selected location is outside underpass coverage", () => {
    render(
      <RoutesView
        origin={origin}
        mode="DRIVE"
        onModeChange={vi.fn()}
        routeState={routeState({
          routes: [driveRoute],
          underpassCoverage: {
            status: "OUTSIDE_COVERAGE",
            label: "전국 등록 지하차도",
            recordCount: 969,
            dataDate: "2025-12-31",
          },
        })}
        shelters={[shelter]}
      />,
    );

    expect(screen.getByLabelText("지하차도 데이터 범위")).toHaveTextContent(
      "현재 위치는 데이터 범위 밖",
    );
  });

  test("requests a mode change when a travel mode tab is clicked", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <RoutesView
        origin={origin}
        mode="WALK"
        onModeChange={onModeChange}
        routeState={routeState({ routes: [driveRoute] })}
        shelters={[shelter]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "차량" }));

    expect(onModeChange).toHaveBeenCalledWith("DRIVE");
  });
});
