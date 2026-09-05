import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { NaverMap } from "./NaverMap";
import { resetNaverMapsSDKLoaderForTest } from "@/lib/map/naverMaps";
import { createSafeMapFloodTraceWmsLayer } from "@/lib/map/wms";
import type { LatLng, RouteResult, Shelter, TrafficEvent } from "@/lib/types";
import type { CctvFeed } from "@/lib/api/cctvInfo";

const center: LatLng = { lat: 37.4979, lng: 127.0276 };

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

const route: RouteResult = {
  id: "walk-rec",
  mode: "WALK",
  status: "RECOMMENDED",
  name: "추천 도보 경로",
  distanceMeters: 920,
  durationSeconds: 840,
  safetyScore: 86,
  riskReasons: ["침수흔적 중첩 구간 회피"],
  geometry: [center, shelter.position],
  shelterId: shelter.id,
};

const trafficEvent: TrafficEvent = {
  id: "traffic-event-1",
  type: "국도",
  eventType: "교통사고",
  eventDetailType: "추돌사고",
  position: { lat: 37.4998, lng: 127.031 },
  roadName: "테헤란로",
  lanesBlockType: "부분통제",
  lanesBlocked: "1차로",
  message: "테헤란로 추돌사고 처리 중",
  startedAt: "2026-06-15T12:20:00+09:00",
  source: "ITS eventInfo",
};

const nearCctv: CctvFeed = {
  id: "cctv-near",
  roadSectionId: "road-near",
  fileCreatedAt: "2026-06-15T09:00:00+09:00",
  cctvType: "4",
  streamUrl: "https://example.com/near.m3u8",
  resolution: "1280x720",
  position: { lat: 37.498, lng: 127.028 },
  format: "HLS",
  name: "Near CCTV",
  source: "ITS cctvInfo",
};

const farCctv: CctvFeed = {
  id: "cctv-far",
  roadSectionId: "road-far",
  fileCreatedAt: "2026-06-15T09:00:00+09:00",
  cctvType: "4",
  streamUrl: "https://example.com/far.m3u8",
  resolution: "1280x720",
  position: { lat: 37.55, lng: 127.1 },
  format: "HLS",
  name: "Far CCTV",
  source: "ITS cctvInfo",
};

type MockMapInstance = {
  setCenter: ReturnType<typeof vi.fn>;
  setZoom: ReturnType<typeof vi.fn>;
  getCenter: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const createNaverMapsMock = (boundsOverride?: NaverMapsBoundsInstance) => {
  const listeners: Array<{ eventName: string; listener: (...args: unknown[]) => void }> = [];
  const mapInstances: MockMapInstance[] = [];
  let mapContainer: HTMLElement | null = null;
  const bounds =
    boundsOverride ??
    ({
      getSW: () => ({ lat: () => 37.49, lng: () => 127.02 }),
      getNE: () => ({ lat: () => 37.51, lng: () => 127.05 }),
    } satisfies NaverMapsBoundsInstance);
  const maps = {
    Map: vi.fn(function Map(this: MockMapInstance, container: HTMLElement) {
      mapContainer = container;
      this.setCenter = vi.fn();
      this.setZoom = vi.fn();
      this.getCenter = vi.fn(() => ({ lat: () => 37.501, lng: () => 127.031 }));
      this.getBounds = vi.fn(() => bounds);
      this.destroy = vi.fn();
      mapInstances.push(this);
    }),
    LatLng: vi.fn(function LatLng(this: Record<string, unknown>, lat: number, lng: number) {
      this.lat = lat;
      this.lng = lng;
    }),
    Marker: vi.fn(function Marker(this: Record<string, unknown>, options: Record<string, unknown>) {
      this.options = options;
      this.setMap = vi.fn();
      this.setZIndex = vi.fn();
      const icon = options.icon as { content?: string } | undefined;
      if (mapContainer && icon?.content) {
        const template = document.createElement("template");
        template.innerHTML = icon.content;
        mapContainer.append(...Array.from(template.content.childNodes));
      }
    }),
    Polyline: vi.fn(function Polyline(this: Record<string, unknown>) {
      this.setMap = vi.fn();
    }),
    Polygon: vi.fn(function Polygon(this: Record<string, unknown>) {
      this.setMap = vi.fn();
    }),
    InfoWindow: vi.fn(function InfoWindow(this: Record<string, unknown>) {
      this.open = vi.fn();
      this.close = vi.fn();
    }),
    GroundOverlay: vi.fn(function GroundOverlay(
      this: Record<string, unknown>,
      url: string,
      overlayBounds: unknown,
      options: Record<string, unknown>,
    ) {
      this.url = url;
      this.bounds = overlayBounds;
      this.options = options;
      this.setMap = vi.fn();
    }),
    Size: vi.fn(function Size(this: Record<string, unknown>, width: number, height: number) {
      this.width = width;
      this.height = height;
    }),
    Point: vi.fn(function Point(this: Record<string, unknown>, x: number, y: number) {
      this.x = x;
      this.y = y;
    }),
    Event: {
      addListener: vi.fn((_target: unknown, eventName: string, listener: () => void) => {
        listeners.push({ eventName, listener });
        return { remove: vi.fn() };
      }),
      removeListener: vi.fn(),
    },
  };

  return { maps, listeners, mapInstances } as unknown as {
    maps: NaverMapsNamespace["maps"];
    listeners: Array<{ eventName: string; listener: (...args: unknown[]) => void }>;
    mapInstances: MockMapInstance[];
  };
};

describe("NaverMap", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetNaverMapsSDKLoaderForTest();
    window.naver = undefined;
  });

  test("shows a configuration error when the client id is missing", () => {
    render(<NaverMap center={center} clientId="" />);

    expect(screen.getByRole("alert")).toHaveTextContent("VITE_NAVER_MAPS_CLIENT_ID");
  });

  test("shows a localized fallback message when the SDK request fails", async () => {
    render(<NaverMap center={center} clientId="client-id" />);

    const script = await waitFor(() => {
      const element = document.querySelector<HTMLScriptElement>("script[data-naver-maps-sdk]");
      expect(element).not.toBeNull();
      return element!;
    });
    act(() => script.dispatchEvent(new Event("error")));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "네이버 지도를 불러오지 못했습니다. 대체 지도로 위치를 선택하세요.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Naver Maps SDK load failed");
  });

  test("keeps a selectable fallback map when the SDK is unavailable", async () => {
    const user = userEvent.setup();
    const onLocationSelect = vi.fn();

    render(
      <NaverMap
        center={center}
        clientId=""
        selectedLocation={center}
        selectedLocationLabel="홈 설정 위치"
        onLocationSelect={onLocationSelect}
      />,
    );

    const fallbackMap = screen.getByRole("button", {
      name: "대체 지도에서 CCTV 조회 위치 선택",
    });
    await user.click(fallbackMap);

    expect(onLocationSelect).toHaveBeenCalledWith(center, "MAP");
    expect(screen.getByRole("alert")).toHaveTextContent("VITE_NAVER_MAPS_CLIENT_ID");
  });

  test("renders an accessible data fallback while the SDK owns the visual map", () => {
    render(<NaverMap center={center} clientId="" shelters={[shelter]} routes={[route]} />);

    expect(screen.getByLabelText("지도 데이터 목록")).toHaveTextContent("역삼초등학교 체육관");
    expect(screen.getByLabelText("지도 데이터 목록")).toHaveTextContent("운영중");
    expect(screen.getByText("추천 도보 경로")).toBeInTheDocument();
  });

  test("opens shelter detail and calls the click handler from a map marker", async () => {
    const { maps, listeners } = createNaverMapsMock();
    window.naver = { maps };
    const onShelterClick = vi.fn();

    render(
      <NaverMap
        center={center}
        clientId="client-id"
        shelters={[shelter]}
        onShelterClick={onShelterClick}
      />,
    );

    await waitFor(() =>
      expect(listeners.some(({ eventName }) => eventName === "click")).toBe(true),
    );

    await act(async () => {
      listeners.find(({ eventName }) => eventName === "click")?.listener();
    });

    expect(onShelterClick).toHaveBeenCalledWith(shelter);
    expect(screen.getByRole("dialog", { name: /대피소 상세/ })).toHaveTextContent(
      "역삼초등학교 체육관",
    );
  });

  test("opens shelter detail when the HTML marker button is clicked directly", async () => {
    const user = userEvent.setup();
    const { maps } = createNaverMapsMock();
    window.naver = { maps };
    const onShelterClick = vi.fn();

    render(
      <NaverMap
        center={center}
        clientId="client-id"
        shelters={[shelter]}
        onShelterClick={onShelterClick}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /대피소: 역삼초등학교 체육관/ }));

    expect(onShelterClick).toHaveBeenCalledWith(shelter);
    expect(screen.getByRole("dialog", { name: /대피소 상세/ })).toHaveTextContent(
      "역삼초등학교 체육관",
    );
  });

  test("opens shelter detail from a controlled selected shelter id", async () => {
    const { maps } = createNaverMapsMock();
    window.naver = { maps };

    render(
      <NaverMap
        center={center}
        clientId="client-id"
        shelters={[shelter]}
        selectedShelterId={shelter.id}
      />,
    );

    expect(await screen.findByRole("dialog", { name: /대피소 상세/ })).toHaveTextContent(
      "역삼초등학교 체육관",
    );
  });

  test("keeps a controlled shelter detail closed when shelter data refreshes with the same selection", async () => {
    const user = userEvent.setup();
    const { maps } = createNaverMapsMock();
    window.naver = { maps };

    const { rerender } = render(
      <NaverMap
        center={center}
        clientId="client-id"
        shelters={[shelter]}
        selectedShelterId={shelter.id}
      />,
    );

    expect(await screen.findByRole("dialog", { name: /대피소 상세/ })).toHaveTextContent(
      "역삼초등학교 체육관",
    );

    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: /대피소 상세/ })).not.toBeInTheDocument();

    rerender(
      <NaverMap
        center={center}
        clientId="client-id"
        shelters={[{ ...shelter }]}
        selectedShelterId={shelter.id}
      />,
    );

    expect(screen.queryByRole("dialog", { name: /대피소 상세/ })).not.toBeInTheDocument();
  });

  test("removes markers that exit the bounds and adds markers that enter the bounds", async () => {
    const { maps } = createNaverMapsMock();
    window.naver = { maps };
    const markerConstructorSpy = vi.spyOn(maps, "Marker");

    const shelter2: Shelter = {
      id: "s-02",
      name: "도곡중학교",
      address: "서울 강남구 남부순환로",
      position: { lat: 37.4889, lng: 127.0431 },
      capacity: 350,
      status: "OPERATING",
      underground: false,
      type: "이재민 임시주거시설",
    };

    const { rerender } = render(
      <NaverMap center={center} clientId="client-id" shelters={[shelter]} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /대피소: 역삼초등학교 체육관/ }),
      ).toBeInTheDocument(),
    );

    const initialCallCount = markerConstructorSpy.mock.calls.length;

    // shelter가 빠지고 shelter2가 들어옴
    rerender(<NaverMap center={center} clientId="client-id" shelters={[shelter2]} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /대피소: 도곡중학교/ })).toBeInTheDocument(),
    );
    expect(markerConstructorSpy.mock.calls.length).toBeGreaterThan(initialCallCount);

    const initialMarkerInstance = markerConstructorSpy.mock.results.find(
      (result) =>
        (result.value as { options?: { title?: string } }).options?.title === shelter.name,
    )?.value as { setMap: ReturnType<typeof vi.fn> } | undefined;
    expect(initialMarkerInstance?.setMap).toHaveBeenCalledWith(null);
  });

  test("opens traffic event detail when the incident marker is clicked directly", async () => {
    const user = userEvent.setup();
    const { maps } = createNaverMapsMock();
    window.naver = { maps };
    const onTrafficEventClick = vi.fn();

    render(
      <NaverMap
        center={center}
        clientId="client-id"
        trafficEvents={[trafficEvent]}
        onTrafficEventClick={onTrafficEventClick}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /돌발상황: 테헤란로 추돌사고 처리 중/ }),
    );

    expect(onTrafficEventClick).toHaveBeenCalledWith(trafficEvent);
    const dialog = screen.getByRole("dialog", { name: /돌발상황 상세/ });
    expect(dialog).toHaveTextContent("테헤란로 추돌사고 처리 중");
    expect(dialog).toHaveTextContent("상황");
    expect(dialog).toHaveTextContent("차단 유형");
    expect(dialog).toHaveTextContent("부분통제");
    expect(dialog).toHaveTextContent("차단 차로");
    expect(dialog).toHaveTextContent("1차로");
    expect(dialog).toHaveTextContent("출처: ITS eventInfo");
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
    expect(screen.getByLabelText("지도 데이터 목록")).toHaveTextContent("돌발상황");
  });

  test("moves the map back to the current location from the map control", async () => {
    const user = userEvent.setup();
    const { maps, mapInstances } = createNaverMapsMock();
    window.naver = { maps };

    render(<NaverMap center={center} zoom={14} clientId="client-id" showCurrentLocationButton />);

    const control = await screen.findByRole("button", { name: "지도를 현재 위치로 이동" });
    await waitFor(() => expect(control).not.toBeDisabled());

    mapInstances[0]!.setCenter.mockClear();
    mapInstances[0]!.setZoom.mockClear();

    await user.click(control);

    expect(mapInstances[0]!.setCenter).toHaveBeenCalledTimes(1);
    expect(mapInstances[0]!.setZoom).toHaveBeenCalledWith(14);
  });

  test("requests fresh device location from the map control when a handler is provided", async () => {
    const user = userEvent.setup();
    const { maps } = createNaverMapsMock();
    window.naver = { maps };
    const onCurrentLocationClick = vi.fn();

    render(
      <NaverMap
        center={center}
        clientId="client-id"
        showCurrentLocationButton
        onCurrentLocationClick={onCurrentLocationClick}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "지도를 현재 위치로 이동" }));

    expect(onCurrentLocationClick).toHaveBeenCalledTimes(1);
  });

  test("calls the location selection handler with a clicked map coordinate", async () => {
    const { maps, listeners } = createNaverMapsMock();
    window.naver = { maps };
    const onLocationSelect = vi.fn();

    render(<NaverMap center={center} clientId="client-id" onLocationSelect={onLocationSelect} />);

    await waitFor(() =>
      expect(listeners.some(({ eventName }) => eventName === "click")).toBe(true),
    );

    await act(async () => {
      listeners
        .find(({ eventName }) => eventName === "click")
        ?.listener({ coord: { lat: () => 37.503, lng: () => 127.032 } });
    });

    expect(onLocationSelect).toHaveBeenCalledWith({ lat: 37.503, lng: 127.032 }, "MAP");
  });

  test("calls the location selection handler with the map center after dragging", async () => {
    const { maps, listeners } = createNaverMapsMock();
    window.naver = { maps };
    const onCenterChanged = vi.fn();

    render(<NaverMap center={center} clientId="client-id" onCenterChanged={onCenterChanged} />);

    await waitFor(() =>
      expect(listeners.some(({ eventName }) => eventName === "dragend")).toBe(true),
    );

    await act(async () => {
      listeners.find(({ eventName }) => eventName === "dragend")?.listener();
    });

    expect(onCenterChanged).toHaveBeenCalledWith({ lat: 37.501, lng: 127.031 });
  });

  test("debounces map bounds changes from idle events", async () => {
    const { maps, listeners } = createNaverMapsMock();
    window.naver = { maps };
    const onBoundsChanged = vi.fn();

    render(<NaverMap center={center} clientId="client-id" onBoundsChanged={onBoundsChanged} />);

    await waitFor(() => expect(listeners.some(({ eventName }) => eventName === "idle")).toBe(true));

    vi.useFakeTimers();
    const idleListeners = listeners.filter(({ eventName }) => eventName === "idle");

    await act(async () => {
      idleListeners.forEach(({ listener }) => listener());
      idleListeners.forEach(({ listener }) => listener());
    });

    expect(onBoundsChanged).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(699);
    });
    expect(onBoundsChanged).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(onBoundsChanged).toHaveBeenCalledTimes(1);
    expect(onBoundsChanged).toHaveBeenCalledWith({
      minX: 127.02,
      maxX: 127.05,
      minY: 37.49,
      maxY: 37.51,
    });
  });

  test("opens CCTV detail only after the camera marker is clicked", async () => {
    const user = userEvent.setup();
    const { maps } = createNaverMapsMock();
    window.naver = { maps };

    render(<NaverMap center={center} clientId="client-id" cctvs={[farCctv, nearCctv]} />);

    await waitFor(() => expect(maps.Marker).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: /CCTV 상세/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "CCTV: Near CCTV" }));

    const dialog = screen.getByRole("dialog", { name: /Near CCTV/ });

    expect(dialog).toHaveTextContent("Near CCTV");
    expect(dialog).not.toHaveTextContent("Far CCTV");
  });

  test("does not recreate every CCTV marker when one marker is selected", async () => {
    const user = userEvent.setup();
    const { maps } = createNaverMapsMock();
    window.naver = { maps };
    const markerConstructorSpy = vi.spyOn(maps, "Marker");

    render(<NaverMap center={center} clientId="client-id" cctvs={[farCctv, nearCctv]} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "CCTV: Near CCTV" })).toBeInTheDocument(),
    );
    const initialMarkerCount = markerConstructorSpy.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "CCTV: Near CCTV" }));
    expect(screen.getByRole("dialog", { name: /Near CCTV/ })).toBeInTheDocument();

    expect(markerConstructorSpy.mock.calls).toHaveLength(initialMarkerCount);
    const selectedMarker = markerConstructorSpy.mock.results.find(
      (result) =>
        (result.value as { options?: { title?: string } }).options?.title === nearCctv.name,
    )?.value as { setZIndex: ReturnType<typeof vi.fn> } | undefined;
    expect(selectedMarker?.setZIndex).toHaveBeenCalledWith(100);
  });

  test("creates a SafeMap WMS ground overlay when a layer is configured", async () => {
    const { maps } = createNaverMapsMock();
    window.naver = { maps };

    const layer = createSafeMapFloodTraceWmsLayer("demo-key");

    render(<NaverMap center={center} clientId="client-id" wmsLayers={[layer]} />);

    const GroundOverlay = maps.GroundOverlay;
    expect(GroundOverlay).toBeDefined();
    await waitFor(() => expect(GroundOverlay).toHaveBeenCalled());

    const overlayCalls = vi.mocked(GroundOverlay!).mock.calls;
    expect(overlayCalls.length).toBeGreaterThan(0);
    const [url, , options] = overlayCalls[0]!;
    expect(url).toContain("IF_0092_WMS");
    expect(url).toContain("serviceKey=demo-key");
    expect(url).toContain("layers=A2SM_FLUDMARKS");
    expect(url).toContain("bbox=127.020000%2C37.490000%2C127.050000%2C37.510000");
    expect(options).toEqual(expect.objectContaining({ opacity: layer.opacity, clickable: false }));
  });

  test("skips SafeMap WMS overlays when map bounds do not expose numeric coordinates", async () => {
    const invalidBounds = {
      getSW: () => ({ lat: () => undefined, lng: () => 127.02 }),
      getNE: () => ({ lat: () => 37.51, lng: () => 127.05 }),
    } as unknown as NaverMapsBoundsInstance;
    const { maps } = createNaverMapsMock(invalidBounds);
    window.naver = { maps };

    render(
      <NaverMap
        center={center}
        clientId="client-id"
        wmsLayers={[createSafeMapFloodTraceWmsLayer("demo-key")]}
      />,
    );

    await waitFor(() => expect(maps.Map).toHaveBeenCalled());

    expect(maps.GroundOverlay).not.toHaveBeenCalled();
  });
});
