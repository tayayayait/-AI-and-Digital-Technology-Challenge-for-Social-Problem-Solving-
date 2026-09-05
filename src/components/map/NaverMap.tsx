"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LocateFixed, X } from "lucide-react";

import type { LatLng, RiskLevel, RiskZone, RouteResult, Shelter, TrafficEvent } from "@/lib/types";
import { getNaverMapsClientId, loadNaverMapsSDK } from "@/lib/map/naverMaps";
import {
  createCurrentLocationMarkerIcon,
  createRiskZoneMarkerIcon,
  createShelterMarkerIcon,
  createTrafficEventMarkerIcon,
  getShelterMarkerStatusLabel,
} from "@/lib/map/markers";
import { buildSafeMapWmsImageUrl, type WmsBounds, type WmsLayerConfig } from "@/lib/map/wms";
import { formatDistance, formatTimestamp, haversineMeters } from "@/lib/utils";
import { classifyTrafficEvent } from "@/lib/risk/trafficEventRisk";

interface NaverMapProps {
  center: LatLng;
  zoom?: number;
  shelters?: Shelter[];
  riskZones?: RiskZone[];
  routes?: RouteResult[];
  wmsLayers?: WmsLayerConfig[];
  height?: number | string;
  onShelterClick?: (s: Shelter) => void;
  selectedShelterId?: string | null;
  showCurrentLocationButton?: boolean;
  onCurrentLocationClick?: () => void;
  isCurrentLocationLoading?: boolean;
  clientId?: string;
  trafficEvents?: TrafficEvent[];
  selectedTrafficEventId?: string | null;
  onTrafficEventClick?: (event: TrafficEvent) => void;
  onBoundsChanged?: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
}

const MAP_BOUNDS_DEBOUNCE_MS = 700;

const ROUTE_STYLE: Record<
  RouteResult["status"],
  { strokeColor: string; strokeWeight: number; strokeStyle?: string; strokeOpacity: number }
> = {
  RECOMMENDED: { strokeColor: "#2563eb", strokeWeight: 6, strokeOpacity: 1 },
  ALTERNATIVE: { strokeColor: "#64748b", strokeWeight: 4, strokeOpacity: 0.9 },
  REJECTED: {
    strokeColor: "#dc2626",
    strokeWeight: 4,
    strokeStyle: "shortdash",
    strokeOpacity: 0.9,
  },
  LOADING: { strokeColor: "#94a3b8", strokeWeight: 3, strokeOpacity: 0.4 },
  FAILED: { strokeColor: "#94a3b8", strokeWeight: 3, strokeOpacity: 0.4 },
};

const RISK_OVERLAY_COLOR: Record<Exclude<RiskLevel, "UNKNOWN">, string> = {
  SAFE: "rgba(22, 163, 74, 0.16)",
  WATCH: "rgba(234, 179, 8, 0.22)",
  WARNING: "rgba(249, 115, 22, 0.28)",
  CRITICAL: "rgba(220, 38, 38, 0.36)",
};

const RISK_STROKE_COLOR: Record<Exclude<RiskLevel, "UNKNOWN">, string> = {
  SAFE: "#166534",
  WATCH: "#854d0e",
  WARNING: "#9a3412",
  CRITICAL: "#991b1b",
};

const toLatLng = (maps: NaverMapsNamespace["maps"], point: LatLng) =>
  new maps.LatLng(point.lat, point.lng);

const toRoutePath = (maps: NaverMapsNamespace["maps"], route: RouteResult) =>
  route.geometry.map((point) => toLatLng(maps, point));

const toPolygonPath = (maps: NaverMapsNamespace["maps"], zone: RiskZone) =>
  zone.polygon.map(([lng, lat]) => new maps.LatLng(lat, lng));

const toRiskZoneCenter = (zone: RiskZone): LatLng => {
  const total = zone.polygon.reduce(
    (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: total.lat / zone.polygon.length,
    lng: total.lng / zone.polygon.length,
  };
};

const escapeInfoWindowHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const readCoordinate = (point: unknown, key: "lat" | "lng"): number | null => {
  if (!point || typeof point !== "object") return null;
  const record = point as Record<string, unknown>;
  const coordinate = record[key];

  // 네이버 지도는 lat(), lng() 메서드를 제공하거나 y, x 속성을 가짐
  if (typeof coordinate === "function") {
    const value = coordinate.call(point);
    return typeof value === "number" ? value : null;
  }
  if (typeof coordinate === "number") return coordinate;
  if (key === "lat" && typeof record.y === "number") return record.y;
  if (key === "lng" && typeof record.x === "number") return record.x;
  if (key === "lat" && typeof record._lat === "number") return record._lat;
  if (key === "lng" && typeof record._lng === "number") return record._lng;
  return null;
};

const toWmsBounds = (bounds: NaverMapsBoundsInstance | null | undefined): WmsBounds | null => {
  if (!bounds) return null;
  const sw = bounds.getSW();
  const ne = bounds.getNE();
  const south = readCoordinate(sw, "lat");
  const west = readCoordinate(sw, "lng");
  const north = readCoordinate(ne, "lat");
  const east = readCoordinate(ne, "lng");

  if (south === null || west === null || north === null || east === null) return null;
  return { west, south, east, north };
};

const removeEventListener = (
  maps: NaverMapsNamespace["maps"],
  listener: NaverMapsEventListener,
) => {
  try {
    if (typeof listener.remove === "function") {
      listener.remove();
      return;
    }
    maps.Event.removeListener(listener);
  } catch (error) {
    console.warn("Naver Maps listener cleanup failed.", error);
  }
};

const mapErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("VITE_NAVER_MAPS_CLIENT_ID")) return message;
  return "네이버 지도를 불러오지 못했습니다. 잠시 후 다시 시도하세요.";
};

const detachMapObject = (
  object:
    | NaverMapsMarkerInstance
    | NaverMapsPolylineInstance
    | NaverMapsPolygonInstance
    | NaverMapsGroundOverlayInstance,
) => {
  try {
    object.setMap(null);
  } catch (error) {
    console.warn("Naver Maps object cleanup failed.", error);
  }
};

export function NaverMap({
  center,
  zoom = 15,
  shelters = [],
  riskZones = [],
  routes = [],
  wmsLayers = [],
  height = "100%",
  onShelterClick,
  selectedShelterId,
  showCurrentLocationButton = false,
  onCurrentLocationClick,
  isCurrentLocationLoading = false,
  clientId = getNaverMapsClientId(),
  trafficEvents = [],
  selectedTrafficEventId,
  onTrafficEventClick,
  onBoundsChanged,
}: NaverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMapsMapInstance | null>(null);
  const mapsRef = useRef<NaverMapsNamespace["maps"] | null>(null);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const boundsChangedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedShelterIdRef = useRef<string | null>(null);
  const shelterMarkersRef = useRef<
    Map<
      string,
      {
        marker: NaverMapsMarkerInstance;
        listener: NaverMapsEventListener;
        shelter: Shelter;
      }
    >
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [selectedShelter, setSelectedShelter] = useState<Shelter | null>(null);
  const [selectedTrafficEvent, setSelectedTrafficEvent] = useState<TrafficEvent | null>(null);

  const mapStyle: CSSProperties = useMemo(
    () => ({
      height,
      width: "100%",
      minHeight: typeof height === "number" ? undefined : 220,
    }),
    [height],
  );

  const shelterById = useMemo(
    () => new Map(shelters.map((shelter) => [shelter.id, shelter])),
    [shelters],
  );

  const trafficEventById = useMemo(
    () => new Map(trafficEvents.map((event) => [event.id, event])),
    [trafficEvents],
  );

  const selectShelter = useCallback(
    (shelter: Shelter) => {
      dismissedShelterIdRef.current = null;
      setSelectedShelter(shelter);
      setSelectedTrafficEvent(null);
      onShelterClick?.(shelter);
    },
    [onShelterClick],
  );

  const selectTrafficEvent = useCallback(
    (trafficEvent: TrafficEvent) => {
      setSelectedTrafficEvent(trafficEvent);
      setSelectedShelter(null);
      onTrafficEventClick?.(trafficEvent);
    },
    [onTrafficEventClick],
  );

  useEffect(() => {
    centerRef.current = center;
    zoomRef.current = zoom;
  }, [center, zoom]);

  const moveToCurrentLocation = useCallback(() => {
    onCurrentLocationClick?.();

    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    try {
      map.setCenter(toLatLng(maps, center));
      map.setZoom(zoom);
    } catch (error) {
      setError(mapErrorMessage(error));
    }
  }, [center, onCurrentLocationClick, zoom]);

  const closeShelterSheet = useCallback(() => {
    dismissedShelterIdRef.current = selectedShelter?.id ?? selectedShelterId ?? null;
    setSelectedShelter(null);
  }, [selectedShelter?.id, selectedShelterId]);

  useEffect(() => {
    if (selectedShelterId === undefined) return;
    if (!selectedShelterId) {
      dismissedShelterIdRef.current = null;
      setSelectedShelter(null);
      return;
    }
    if (dismissedShelterIdRef.current === selectedShelterId) return;

    setSelectedShelter(shelterById.get(selectedShelterId) ?? null);
  }, [selectedShelterId, shelterById]);

  useEffect(() => {
    if (selectedTrafficEventId === undefined) return;
    if (!selectedTrafficEventId) {
      setSelectedTrafficEvent(null);
      return;
    }

    setSelectedTrafficEvent(trafficEventById.get(selectedTrafficEventId) ?? null);
  }, [selectedTrafficEventId, trafficEventById]);

  useEffect(() => {
    let cancelled = false;
    const trimmedClientId = clientId.trim();

    if (!trimmedClientId) {
      setError("네이버 지도 설정이 없습니다. VITE_NAVER_MAPS_CLIENT_ID를 확인하세요.");
      return;
    }

    setError(null);
    loadNaverMapsSDK(trimmedClientId)
      .then((sdk) => {
        if (cancelled || !containerRef.current) return;

        try {
          mapsRef.current = sdk.maps;
          const position = toLatLng(sdk.maps, centerRef.current);
          mapRef.current = new sdk.maps.Map(containerRef.current, {
            center: position,
            zoom: zoomRef.current,
            zoomControl: false,
            disableDoubleTapZoom: true,
          });
          setMapReadyVersion((version) => version + 1);
        } catch (error) {
          mapRef.current = null;
          mapsRef.current = null;
          setError(mapErrorMessage(error));
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(mapErrorMessage(e));
      });

    return () => {
      cancelled = true;
      if (!import.meta.env.DEV) {
        try {
          mapRef.current?.destroy?.();
        } catch (error) {
          console.warn("Naver Maps cleanup failed.", error);
        }
      }
      mapRef.current = null;
      mapsRef.current = null;
    };
  }, [clientId]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    try {
      map.setCenter(toLatLng(maps, center));
      map.setZoom(zoom);
    } catch (error) {
      setError(mapErrorMessage(error));
    }
  }, [center, mapReadyVersion, zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMarkerClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const shelterButton = target.closest<HTMLButtonElement>("[data-shelter-id]");
      if (shelterButton && container.contains(shelterButton)) {
        const shelterId = shelterButton.dataset.shelterId;
        if (shelterId) {
          const shelter = shelterById.get(shelterId);
          if (shelter) selectShelter(shelter);
        }
        return;
      }

      const trafficEventButton = target.closest<HTMLButtonElement>("[data-traffic-event-id]");
      if (trafficEventButton && container.contains(trafficEventButton)) {
        const trafficEventId = trafficEventButton.dataset.trafficEventId;
        if (trafficEventId) {
          const trafficEvent = trafficEventById.get(trafficEventId);
          if (trafficEvent) selectTrafficEvent(trafficEvent);
        }
      }
    };

    container.addEventListener("click", handleMarkerClick);
    return () => container.removeEventListener("click", handleMarkerClick);
  }, [selectShelter, shelterById, selectTrafficEvent, trafficEventById]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    const listeners: NaverMapsEventListener[] = [];

    listeners.push(
      maps.Event.addListener(map, "idle", () => {
        if (onBoundsChanged && map.getBounds) {
          const bounds = toWmsBounds(map.getBounds());
          if (bounds) {
            if (boundsChangedTimeoutRef.current) {
              clearTimeout(boundsChangedTimeoutRef.current);
            }
            boundsChangedTimeoutRef.current = setTimeout(() => {
              onBoundsChanged({
                minX: bounds.west,
                maxX: bounds.east,
                minY: bounds.south,
                maxY: bounds.north,
              });
            }, MAP_BOUNDS_DEBOUNCE_MS);
          }
        }
      }),
    );

    return () => {
      if (boundsChangedTimeoutRef.current) {
        clearTimeout(boundsChangedTimeoutRef.current);
        boundsChangedTimeoutRef.current = null;
      }
      for (const listener of listeners) removeEventListener(maps, listener);
    };
  }, [mapReadyVersion, onBoundsChanged]);

  // 1. Current location marker
  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    const markers: NaverMapsMarkerInstance[] = [];
    try {
      markers.push(
        new maps.Marker({
          map,
          position: toLatLng(maps, center),
          icon: createCurrentLocationMarkerIcon(maps),
          title: "현재 위치",
        }),
      );
    } catch (error) {
      setError(mapErrorMessage(error));
    }

    return () => {
      for (const marker of markers) detachMapObject(marker);
    };
  }, [center, mapReadyVersion]);

  // 2. Risk Zones & Routes
  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    const markers: NaverMapsMarkerInstance[] = [];
    const polylines: NaverMapsPolylineInstance[] = [];
    const polygons: NaverMapsPolygonInstance[] = [];

    try {
      for (const zone of riskZones) {
        polygons.push(
          new maps.Polygon({
            map,
            paths: toPolygonPath(maps, zone),
            fillColor: RISK_OVERLAY_COLOR[zone.level],
            fillOpacity: 1,
            strokeColor: RISK_STROKE_COLOR[zone.level],
            strokeOpacity: 0.9,
            strokeWeight: 1,
          }),
        );
        markers.push(
          new maps.Marker({
            map,
            position: toLatLng(maps, toRiskZoneCenter(zone)),
            icon: createRiskZoneMarkerIcon(maps, zone.level, zone.name),
            title: zone.name,
          }),
        );
      }

      for (const route of routes) {
        const style = ROUTE_STYLE[route.status];
        polylines.push(
          new maps.Polyline({
            map,
            path: toRoutePath(maps, route),
            strokeColor: style.strokeColor,
            strokeWeight: style.strokeWeight,
            strokeOpacity: style.strokeOpacity,
            strokeStyle: style.strokeStyle,
          }),
        );
      }
    } catch (error) {
      setError(mapErrorMessage(error));
    }

    return () => {
      for (const marker of markers) detachMapObject(marker);
      for (const polyline of polylines) detachMapObject(polyline);
      for (const polygon of polygons) detachMapObject(polygon);
    };
  }, [mapReadyVersion, riskZones, routes]);

  // 3. Shelters: mapReadyVersion 변경 시 기존 마커 전체 정리
  useEffect(() => {
    const maps = mapsRef.current;
    const shelterMarkers = shelterMarkersRef.current;
    return () => {
      if (maps) {
        for (const entry of shelterMarkers.values()) {
          removeEventListener(maps, entry.listener);
          detachMapObject(entry.marker);
        }
      }
      shelterMarkers.clear();
    };
  }, [mapReadyVersion]);

  // 3. Shelters: 차분(Diff) 갱신 (벗어난 마커 제거, 새 마커 추가, 기존 마커 유지)
  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    try {
      const nextShelterIds = new Set(shelters.map((s) => s.id));

      // 1) 기존 영역을 벗어난 대피소 마커 제거
      for (const [id, entry] of shelterMarkersRef.current.entries()) {
        if (!nextShelterIds.has(id)) {
          removeEventListener(maps, entry.listener);
          detachMapObject(entry.marker);
          shelterMarkersRef.current.delete(id);
        }
      }

      // 2) 새로 들어온 영역의 대피소 마커 추가
      for (const shelter of shelters) {
        if (!shelterMarkersRef.current.has(shelter.id)) {
          const marker = new maps.Marker({
            map,
            position: toLatLng(maps, shelter.position),
            icon: createShelterMarkerIcon(maps, shelter),
            title: shelter.name,
          });

          const listener = maps.Event.addListener(marker, "click", () => {
            const distance = formatDistance(haversineMeters(centerRef.current, shelter.position));
            const statusLabel = getShelterMarkerStatusLabel(shelter.status);
            const infoWindow = new maps.InfoWindow({
              content: `<div style="padding:8px 10px;font-size:13px;line-height:1.45">
                <strong style="display:block;font-size:14px">${escapeInfoWindowHtml(shelter.name)}</strong>
                <span>${escapeInfoWindowHtml(statusLabel)} · 현재 위치 기준 ${distance}</span>
              </div>`,
            });
            infoWindow.open(map, marker);
            selectShelter(shelter);
          });

          shelterMarkersRef.current.set(shelter.id, { marker, listener, shelter });
        }
      }
    } catch (error) {
      setError(mapErrorMessage(error));
    }
  }, [mapReadyVersion, shelters, selectShelter]);

  // 4. Traffic Events
  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps) return;

    const markers: NaverMapsMarkerInstance[] = [];
    const listeners: NaverMapsEventListener[] = [];

    try {
      for (const trafficEvent of trafficEvents) {
        const marker = new maps.Marker({
          map,
          position: toLatLng(maps, trafficEvent.position),
          icon: createTrafficEventMarkerIcon(maps, trafficEvent),
          title: trafficEvent.message,
          zIndex: selectedTrafficEvent?.id === trafficEvent.id ? 200 : 150,
        });

        const listener = maps.Event.addListener(marker, "click", () => {
          selectTrafficEvent(trafficEvent);
        });

        markers.push(marker);
        listeners.push(listener);
      }
    } catch (error) {
      setError(mapErrorMessage(error));
    }

    return () => {
      for (const listener of listeners) removeEventListener(maps, listener);
      for (const marker of markers) detachMapObject(marker);
    };
  }, [mapReadyVersion, trafficEvents, selectTrafficEvent, selectedTrafficEvent]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    const GroundOverlay = maps?.GroundOverlay;
    if (!map || !maps || !GroundOverlay || !map.getBounds || wmsLayers.length === 0) return;

    const overlays: NaverMapsGroundOverlayInstance[] = [];

    const clearOverlays = () => {
      while (overlays.length > 0) {
        const overlay = overlays.pop();
        if (overlay) detachMapObject(overlay);
      }
    };

    const renderWmsOverlays = () => {
      try {
        const bounds = map.getBounds?.();
        const container = containerRef.current;
        if (!bounds || !container) return;

        const wmsBounds = toWmsBounds(bounds);
        if (!wmsBounds) return;

        clearOverlays();
        const size = {
          width: Math.max(1, container.clientWidth || 512),
          height: Math.max(1, container.clientHeight || 512),
        };

        for (const layer of wmsLayers) {
          if (!layer.enabled) continue;
          const url = buildSafeMapWmsImageUrl({ layer, bounds: wmsBounds, size });

          const overlay = new GroundOverlay(url.toString(), bounds, {
            opacity: layer.opacity,
            clickable: false,
          });
          overlay.setMap(map);
          overlays.push(overlay);
        }
      } catch (error) {
        setError(mapErrorMessage(error));
        clearOverlays();
      }
    };

    renderWmsOverlays();
    const listener = maps.Event.addListener(map, "idle", renderWmsOverlays);

    return () => {
      removeEventListener(maps, listener);
      clearOverlays();
    };
  }, [mapReadyVersion, wmsLayers]);

  return (
    <div className="relative overflow-hidden bg-[#e8f0f7]" style={mapStyle}>
      {error ? (
        <div
          className="grid size-full place-items-center bg-[#dce9f4] px-6 text-center text-[12px] font-bold text-[var(--text-muted)]"
          aria-label="지도 대체 화면"
        >
          지도를 표시할 수 없습니다.
        </div>
      ) : (
        <div ref={containerRef} className="size-full" aria-label="네이버 지도" />
      )}

      {showCurrentLocationButton && !error ? (
        <button
          type="button"
          onClick={moveToCurrentLocation}
          disabled={isCurrentLocationLoading}
          aria-label="지도를 현재 위치로 이동"
          title="현재 위치로 이동"
          className="absolute right-3 top-3 z-[1000] inline-flex size-10 items-center justify-center rounded-[10px] border border-[var(--border-soft)] bg-white/95 text-[var(--primary)] shadow-sm disabled:opacity-60"
        >
          <LocateFixed size={18} aria-hidden />
        </button>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="absolute inset-x-3 top-3 rounded bg-white/95 px-3 py-2 text-[12px] font-bold text-[var(--risk-critical-text)] shadow-sm"
        >
          {error}
        </div>
      ) : null}

      {selectedShelter ? (
        <MapShelterSheet center={center} shelter={selectedShelter} onClose={closeShelterSheet} />
      ) : null}

      {selectedTrafficEvent ? (
        <MapTrafficEventSheet
          center={center}
          trafficEvent={selectedTrafficEvent}
          onClose={() => setSelectedTrafficEvent(null)}
        />
      ) : null}

      <ul className="sr-only" aria-label="지도 데이터 목록">
        <li>
          현재 위치: {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
        </li>
        {shelters.map((shelter) => (
          <li key={shelter.id}>
            대피소: {shelter.name}, {getShelterMarkerStatusLabel(shelter.status)}, 현재 위치 기준{" "}
            {formatDistance(haversineMeters(center, shelter.position))}
          </li>
        ))}
        {trafficEvents.map((trafficEvent) => (
          <li key={trafficEvent.id}>
            돌발상황: {trafficEvent.eventDetailType || trafficEvent.eventType},{" "}
            {trafficEvent.roadName ?? "도로명 없음"}, 현재 위치 기준{" "}
            {formatDistance(haversineMeters(center, trafficEvent.position))}
          </li>
        ))}
        {riskZones.map((zone) => (
          <li key={zone.id}>
            위험지점: {zone.name}, {zone.level}
          </li>
        ))}
        {routes.map((route) => (
          <li key={route.id}>{route.name}</li>
        ))}
      </ul>
    </div>
  );
}

function MapShelterSheet({
  center,
  shelter,
  onClose,
}: {
  center: LatLng;
  shelter: Shelter;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`${shelter.name} 대피소 상세`}
      className="absolute inset-x-3 bottom-3 rounded-[14px] border border-[var(--border-soft)] bg-white p-4 shadow-lg"
      style={{ zIndex: 20 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-extrabold">{shelter.name}</h2>
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{shelter.address}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[32px] shrink-0 rounded-md border border-[var(--border)] px-2 text-[12px] font-bold"
        >
          닫기
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="text-[var(--text-subtle)]">거리</dt>
          <dd className="mt-0.5 font-bold">
            {formatDistance(haversineMeters(center, shelter.position))}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-subtle)]">운영상태</dt>
          <dd className="mt-0.5 font-bold">{getShelterMarkerStatusLabel(shelter.status)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-subtle)]">수용</dt>
          <dd className="mt-0.5 font-bold">{shelter.capacity.toLocaleString()}명</dd>
        </div>
      </dl>
    </div>
  );
}

const formatTrafficTimestamp = (value?: string) => {
  if (!value) return "확실한 정보 없음";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "확실한 정보 없음";
  return formatTimestamp(value);
};

const UNKNOWN_TRAFFIC_VALUE = "확실한 정보 없음";

function FormattedTrafficMessage({ message }: { message: string }) {
  if (!message || message === UNKNOWN_TRAFFIC_VALUE) {
    return (
      <p className="mt-1 break-words text-[13px] font-bold leading-relaxed text-[var(--text)]">
        {message || UNKNOWN_TRAFFIC_VALUE}
      </p>
    );
  }

  const cleanMsg = message.replace(/::$/, "");
  const parts = cleanMsg
    .split("::")
    .map((p) => p.trim())
    .filter(Boolean);

  const tags: string[] = [];
  const normalParts: string[] = [];
  const detailParts: string[] = [];

  parts.forEach((part) => {
    if (part.startsWith("<") && part.endsWith(">")) {
      tags.push(part.slice(1, -1));
    } else if (part.includes("/") || part.length > 20) {
      detailParts.push(part);
    } else {
      normalParts.push(part);
    }
  });

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {(tags.length > 0 || normalParts.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {tags.map((tag, i) => (
            <span
              key={`tag-${i}`}
              className="inline-flex items-center rounded-sm bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400"
            >
              {tag}
            </span>
          ))}
          {normalParts.length > 0 && (
            <span className="text-[13px] font-bold leading-relaxed text-[var(--text)]">
              {normalParts.join(" · ")}
            </span>
          )}
        </div>
      )}
      {detailParts.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[6px] bg-[var(--bg-subtle)] p-2.5">
          {detailParts.map((detail, i) => (
            <p
              key={`detail-${i}`}
              className="break-keep text-[12px] font-medium leading-relaxed text-[var(--text)]"
            >
              {detail}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function MapTrafficEventSheet({
  center,
  trafficEvent,
  onClose,
}: {
  center: LatLng;
  trafficEvent: TrafficEvent;
  onClose: () => void;
}) {
  const severity = classifyTrafficEvent(trafficEvent);
  const severityLabel =
    severity === "BLOCKING" ? "통제 위험" : severity === "CAUTION" ? "주의" : "참고";
  const detail = trafficEvent.eventDetailType || trafficEvent.eventType;
  const roadName = trafficEvent.roadName ?? "도로명 없음";
  const distance = formatDistance(haversineMeters(center, trafficEvent.position));
  const trafficDetails = [
    { label: "차단 유형", value: trafficEvent.lanesBlockType ?? UNKNOWN_TRAFFIC_VALUE },
    { label: "차단 차로", value: trafficEvent.lanesBlocked ?? UNKNOWN_TRAFFIC_VALUE },
    { label: "발생", value: formatTrafficTimestamp(trafficEvent.startedAt) },
    { label: "종료", value: formatTrafficTimestamp(trafficEvent.endedAt) },
  ];

  return (
    <div
      role="dialog"
      aria-label={`${detail} 돌발상황 상세`}
      className="absolute inset-x-2 bottom-2 max-h-[calc(100%_-_24px)] overflow-y-auto rounded-[14px] border border-[var(--border-soft)] bg-white shadow-lg"
      style={{ zIndex: 20 }}
    >
      <div className="border-b border-[var(--border-soft)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded px-2 py-0.5 text-[11px] font-extrabold"
                style={{
                  background: severity === "BLOCKING" ? "#fee2e2" : "#fef3c7",
                  color: severity === "BLOCKING" ? "#991b1b" : "#92400e",
                }}
              >
                {severityLabel}
              </span>
              <h2 className="min-w-0 text-[16px] font-extrabold leading-snug text-[var(--text)]">
                {detail}
              </h2>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold leading-relaxed text-[var(--text-muted)]">
              <span className="min-w-0 break-words">{roadName}</span>
              <span aria-hidden>·</span>
              <span>기준 위치에서 {distance}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)]"
            aria-label="닫기"
            title="닫기"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <section aria-label="원문 메시지">
          <div className="text-[11px] font-extrabold text-[var(--text-subtle)]">상황</div>
          <FormattedTrafficMessage message={trafficEvent.message} />
        </section>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-[12px]">
          {trafficDetails.map((item) => (
            <div key={item.label} className="min-w-0 border-t border-[var(--border-soft)] pt-2">
              <dt className="font-bold text-[var(--text-subtle)]">{item.label}</dt>
              <dd className="tnum mt-1 break-words text-[13px] font-extrabold leading-snug text-[var(--text)]">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-[var(--border-soft)] pt-2 text-[11px] font-bold text-[var(--text-subtle)]">
          출처: {trafficEvent.source}
        </p>
      </div>
    </div>
  );
}
