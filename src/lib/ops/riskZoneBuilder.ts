import type { DisasterMessage } from "@/lib/api/types";
import { fetchWmsGetFeatureInfo } from "@/lib/api/wmsFeatureInfo";
import type { WmsBounds } from "@/lib/map/wms";
import { SAFE_MAP_FLOOD_TRACE_WMS_LAYER, SAFE_MAP_RIVER_FLOOD_WMS_LAYER } from "@/lib/map/wms";
import { calculateRiskScore } from "@/lib/risk/calculateRiskScore";
import { classifyTrafficEvent, trafficEventReason } from "@/lib/risk/trafficEventRisk";
import type { SensorFeed } from "@/lib/sensors/sensorAccess";
import type { LatLng, RiskCalculationInput, RiskZone, TrafficEvent, WeatherNow } from "@/lib/types";
import { haversineMeters } from "@/lib/utils";

export const RISK_GRID_SIZE_METERS = 500;
export const RISK_ZONE_LIMIT = 5;
export const RISK_ZONE_WMS_CACHE_MS = 10 * 60 * 1000;
export const RISK_ZONE_SIGNAL_RADIUS_METERS = 1_000;
export const RISK_ZONE_ATTEMPT_TIMEOUT_MS = 8_000;

export interface RiskGridCell {
  id: string;
  row: number;
  column: number;
  center: LatLng;
  bounds: WmsBounds;
  polygon: Array<[number, number]>;
}

export interface RiskZoneSignals {
  weather: WeatherNow | null;
  disasterMessages: DisasterMessage[];
  sensors: SensorFeed[];
  trafficEvents: TrafficEvent[];
  floodWarningLevel?: RiskCalculationInput["floodWarningLevel"];
  floodWarningTitle?: string;
  failedDataCount?: number;
}

interface FeatureInfoResult {
  overlap: number;
  features: unknown[];
  failed?: boolean;
}

export type RiskZoneFeatureInfoFetcher = (params: {
  endpoint: string;
  layer: string;
  bounds: WmsBounds;
  point: LatLng;
}) => Promise<FeatureInfoResult>;

interface CachedOverlap {
  expiresAt: number;
  result: FeatureInfoResult;
}

export type RiskZoneOverlapCache = Map<string, CachedOverlap>;

export interface ScoredRiskZone {
  zone: RiskZone;
  score: number;
}

export interface RiskZoneBuildResult {
  zones: RiskZone[];
  status: "READY" | "EMPTY" | "FAILED";
  sampledCells: number;
  failedCells: number;
}

interface BuildRiskZonesOptions {
  bounds: WmsBounds;
  regionName: string;
  signals: RiskZoneSignals;
  fetchFeatureInfo?: RiskZoneFeatureInfoFetcher;
  cache?: RiskZoneOverlapCache;
  now?: () => number;
  gridSizeMeters?: number;
  limit?: number;
  concurrency?: number;
  attemptTimeoutMs?: number;
  retryCellLimit?: number;
}

const clampOverlap = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export const splitBoundsIntoGrid = (
  bounds: WmsBounds,
  gridSizeMeters = RISK_GRID_SIZE_METERS,
): RiskGridCell[] => {
  if (
    gridSizeMeters <= 0 ||
    bounds.north <= bounds.south ||
    bounds.east <= bounds.west ||
    !Object.values(bounds).every(Number.isFinite)
  ) {
    return [];
  }

  const centerLatitude = (bounds.south + bounds.north) / 2;
  const latitudeStep = gridSizeMeters / 111_320;
  const longitudeStep = gridSizeMeters / (111_320 * Math.cos((centerLatitude * Math.PI) / 180));
  const rows = Math.max(1, Math.ceil((bounds.north - bounds.south) / latitudeStep - 1e-9));
  const columns = Math.max(1, Math.ceil((bounds.east - bounds.west) / longitudeStep - 1e-9));
  const cells: RiskGridCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    const south = bounds.south + row * latitudeStep;
    const north = Math.min(bounds.north, south + latitudeStep);
    for (let column = 0; column < columns; column += 1) {
      const west = bounds.west + column * longitudeStep;
      const east = Math.min(bounds.east, west + longitudeStep);
      const center = { lat: (south + north) / 2, lng: (west + east) / 2 };
      cells.push({
        id: `grid-${center.lat.toFixed(5)}-${center.lng.toFixed(5)}`,
        row,
        column,
        center,
        bounds: { west, south, east, north },
        polygon: [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
        ],
      });
    }
  }

  return cells;
};

export const selectTopRiskZones = (candidates: ScoredRiskZone[], limit = RISK_ZONE_LIMIT) =>
  candidates
    .filter(({ zone, score }) => zone.level !== "SAFE" && score > 0)
    .sort((a, b) => b.score - a.score || a.zone.id.localeCompare(b.zone.id))
    .slice(0, Math.max(0, limit))
    .map(({ zone }) => zone);

const cacheKey = (layer: string, cell: RiskGridCell) =>
  [
    layer,
    cell.bounds.west.toFixed(6),
    cell.bounds.south.toFixed(6),
    cell.bounds.east.toFixed(6),
    cell.bounds.north.toFixed(6),
  ].join(":");

const loadOverlap = async ({
  cell,
  endpoint,
  layer,
  fetchFeatureInfo,
  cache,
  now,
}: {
  cell: RiskGridCell;
  endpoint: string;
  layer: string;
  fetchFeatureInfo: RiskZoneFeatureInfoFetcher;
  cache?: RiskZoneOverlapCache;
  now: () => number;
}): Promise<FeatureInfoResult> => {
  const key = cacheKey(layer, cell);
  const cached = cache?.get(key);
  if (cached && cached.expiresAt > now()) {
    return cached.result;
  }

  try {
    const response = await fetchFeatureInfo({
      endpoint,
      layer,
      bounds: cell.bounds,
      point: cell.center,
    });
    const result = {
      overlap: clampOverlap(response.overlap),
      features: Array.isArray(response.features) ? response.features : [],
      failed: response.failed,
    };
    if (!result.failed) {
      cache?.set(key, { expiresAt: now() + RISK_ZONE_WMS_CACHE_MS, result });
    }
    return result;
  } catch {
    return { overlap: 0, features: [], failed: true };
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()),
  );
  return results;
};

const nearbySensors = (sensors: SensorFeed[], center: LatLng) =>
  sensors.filter(
    (sensor) =>
      sensor.status === "ACTIVE" &&
      sensor.position != null &&
      haversineMeters(center, sensor.position) <= RISK_ZONE_SIGNAL_RADIUS_METERS,
  );

const nearbyBlockingEvents = (events: TrafficEvent[], center: LatLng) =>
  events.filter(
    (event) =>
      classifyTrafficEvent(event) === "BLOCKING" &&
      haversineMeters(center, event.position) <= RISK_ZONE_SIGNAL_RADIUS_METERS,
  );

class RiskZoneAttemptTimeoutError extends Error {
  constructor() {
    super("risk zone WMS attempt timed out");
    this.name = "RiskZoneAttemptTimeoutError";
  }
}

const withAttemptTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new RiskZoneAttemptTimeoutError());
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
};

const reduceCellsForRetry = (cells: RiskGridCell[], requestedLimit: number) => {
  if (cells.length <= 1) return cells;
  const targetCount = Math.max(
    1,
    Math.min(Math.floor(requestedLimit), Math.ceil(cells.length / 2)),
  );

  return Array.from({ length: targetCount }, (_, index) => {
    const sourceIndex = Math.min(
      cells.length - 1,
      Math.floor(((index + 0.5) * cells.length) / targetCount),
    );
    return cells[sourceIndex]!;
  });
};

const scoreRiskCells = async ({
  cells,
  regionName,
  signals,
  fetchFeatureInfo,
  cache,
  now,
  limit,
  concurrency,
}: {
  cells: RiskGridCell[];
  regionName: string;
  signals: RiskZoneSignals;
  fetchFeatureInfo: RiskZoneFeatureInfoFetcher;
  cache?: RiskZoneOverlapCache;
  now: () => number;
  limit: number;
  concurrency: number;
}): Promise<RiskZoneBuildResult> => {
  let failedCells = 0;
  let unknownCells = 0;
  const candidates = await mapWithConcurrency(cells, concurrency, async (cell) => {
    const [floodTrace, riverFlood] = await Promise.all([
      loadOverlap({
        cell,
        endpoint: SAFE_MAP_FLOOD_TRACE_WMS_LAYER.endpoint,
        layer: SAFE_MAP_FLOOD_TRACE_WMS_LAYER.layerName,
        fetchFeatureInfo,
        cache,
        now,
      }),
      loadOverlap({
        cell,
        endpoint: SAFE_MAP_RIVER_FLOOD_WMS_LAYER.endpoint,
        layer: SAFE_MAP_RIVER_FLOOD_WMS_LAYER.layerName,
        fetchFeatureInfo,
        cache,
        now,
      }),
    ]);

    if (floodTrace.failed && riverFlood.failed) {
      failedCells += 1;
    }

    const trafficEvents = nearbyBlockingEvents(signals.trafficEvents, cell.center);
    const calculation = calculateRiskScore({
      weather: signals.weather,
      floodTrace: floodTrace.overlap > 0,
      floodTraceOverlap: floodTrace.overlap,
      riverFlood: riverFlood.overlap > 0,
      riverFloodOverlap: riverFlood.overlap,
      disasterMessages: signals.disasterMessages,
      hasUnderpass: false,
      trafficControl: trafficEvents.length > 0,
      trafficControlTitle: trafficEvents[0] ? trafficEventReason(trafficEvents[0]) : undefined,
      floodWarningLevel: signals.floodWarningLevel,
      floodWarningTitle: signals.floodWarningTitle,
      failedDataCount: signals.failedDataCount,
      sensors: nearbySensors(signals.sensors, cell.center),
    });

    if (calculation.level === "UNKNOWN") {
      unknownCells += 1;
      return null;
    }

    return {
      score: calculation.total,
      zone: {
        id: cell.id,
        name: `${regionName || "선택 영역"} 격자 ${cell.row + 1}-${cell.column + 1}`,
        level: calculation.level,
        polygon: cell.polygon,
        reasons: calculation.reasons,
      },
    } satisfies ScoredRiskZone;
  });

  if (failedCells === cells.length || unknownCells === cells.length) {
    return { zones: [], status: "FAILED", sampledCells: cells.length, failedCells };
  }

  const zones = selectTopRiskZones(
    candidates.filter((candidate): candidate is ScoredRiskZone => candidate != null),
    limit,
  );

  return {
    zones,
    status: zones.length > 0 ? "READY" : "EMPTY",
    sampledCells: cells.length,
    failedCells,
  };
};

export const buildRiskZones = async ({
  bounds,
  regionName,
  signals,
  fetchFeatureInfo = fetchWmsGetFeatureInfo,
  cache,
  now = Date.now,
  gridSizeMeters = RISK_GRID_SIZE_METERS,
  limit = RISK_ZONE_LIMIT,
  concurrency = 6,
  attemptTimeoutMs = RISK_ZONE_ATTEMPT_TIMEOUT_MS,
  retryCellLimit = Math.max(RISK_ZONE_LIMIT * 2, limit),
}: BuildRiskZonesOptions): Promise<RiskZoneBuildResult> => {
  const cells = splitBoundsIntoGrid(bounds, gridSizeMeters);
  if (cells.length === 0) {
    return { zones: [], status: "FAILED", sampledCells: 0, failedCells: 0 };
  }

  const runAttempt = (attemptCells: RiskGridCell[]) =>
    scoreRiskCells({
      cells: attemptCells,
      regionName,
      signals,
      fetchFeatureInfo,
      cache,
      now,
      limit,
      concurrency,
    });

  try {
    return await withAttemptTimeout(runAttempt(cells), attemptTimeoutMs);
  } catch (error) {
    if (!(error instanceof RiskZoneAttemptTimeoutError)) throw error;

    const retryCells = reduceCellsForRetry(cells, retryCellLimit);
    if (retryCells.length >= cells.length) {
      return {
        zones: [],
        status: "FAILED",
        sampledCells: cells.length,
        failedCells: cells.length,
      };
    }

    try {
      return await withAttemptTimeout(runAttempt(retryCells), attemptTimeoutMs);
    } catch (retryError) {
      if (!(retryError instanceof RiskZoneAttemptTimeoutError)) throw retryError;
      return {
        zones: [],
        status: "FAILED",
        sampledCells: retryCells.length,
        failedCells: retryCells.length,
      };
    }
  }
};
