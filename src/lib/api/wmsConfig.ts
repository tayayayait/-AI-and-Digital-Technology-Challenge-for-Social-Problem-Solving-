import {
  createSafeMapFloodTraceWmsLayer,
  createSafeMapRiverFloodWmsLayer,
  type WmsLayerConfig,
} from "@/lib/map/wms";

export function getClientSafeMapServiceKey() {
  return import.meta.env.VITE_SAFEMAP_SERVICE_KEY?.trim() ?? "";
}

export function getSafeMapWmsLayers(serviceKey = getClientSafeMapServiceKey()): WmsLayerConfig[] {
  const trimmed = serviceKey.trim();
  console.log("[WMS] Service Key:", trimmed ? "Found" : "Missing");
  if (!trimmed) return [];

  // 침수흔적도와 하천범람지도 모두 지도에 표시합니다.
  return [createSafeMapFloodTraceWmsLayer(trimmed), createSafeMapRiverFloodWmsLayer(trimmed)];
}
