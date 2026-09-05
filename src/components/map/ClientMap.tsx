import { useEffect, useState } from "react";
import { NaverMap } from "./NaverMap";
import type { WmsLayerConfig } from "@/lib/map/wms";
import type { LatLng, RiskZone, Shelter, RouteResult, TrafficEvent } from "@/lib/types";

/**
 * 네이버 지도 SDK는 브라우저 전역 window/document에 의존하므로 SSR 시 렌더하면 안 됨.
 * 클라이언트 마운트 후에만 NaverMap을 그린다.
 */
export function ClientMap(props: {
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
  trafficEvents?: TrafficEvent[];
  selectedTrafficEventId?: string | null;
  onTrafficEventClick?: (event: TrafficEvent) => void;
  onBoundsChanged?: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div
        className="w-full bg-[var(--surface-alt)] flex items-center justify-center text-[var(--text-subtle)]"
        style={{ height: props.height ?? "100%" }}
        aria-label="지도 로딩 중"
      >
        지도 불러오는 중…
      </div>
    );
  }
  return <NaverMap {...props} />;
}
