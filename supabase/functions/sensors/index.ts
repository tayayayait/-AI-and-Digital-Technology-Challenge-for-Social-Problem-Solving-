import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson } from "../_shared/upstream.ts";
import {
  buildFloodForecastSensorFeeds,
  buildRainfallSensorFeed,
  buildWaterlevelSensorFeed,
  hrfcoDistanceMeters,
  hrfcoStationPosition,
  selectNearestHrfcoStation,
  type HrfcoFloodForecast,
  type HrfcoRainfallReading,
  type HrfcoSensorFeed,
  type HrfcoStation,
  type HrfcoWaterlevelReading,
  type LatLng,
} from "../_shared/hrfco.ts";

const API_BASE = "https://api.hrfco.go.kr";
const SOURCE = "HRFCO standard hydrology DB";
const STATION_CACHE_MS = 6 * 60 * 60 * 1000;
const FORECAST_RADIUS_METERS = 50_000;

interface Cache<T> {
  expiresAt: number;
  value: T;
}

let waterlevelStationCache: Cache<HrfcoStation[]> | null = null;
let rainfallStationCache: Cache<HrfcoStation[]> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getServiceKey = () => {
  const key = Deno.env.get("HRFCO_SERVICE_KEY")?.trim() || Deno.env.get("SENSOR_API_KEY")?.trim();
  if (!key) throw new Error("Missing environment variable: HRFCO_SERVICE_KEY");
  return key;
};

const parseOriginFromBody = (value: unknown): LatLng | null => {
  if (!isRecord(value)) return null;
  const candidate = isRecord(value.origin)
    ? value.origin
    : isRecord(value.center)
      ? value.center
      : value;
  const lat = numberValue(candidate.lat);
  const lng = numberValue(candidate.lng);
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
};

const parseOrigin = async (request: Request): Promise<LatLng | null> => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const lat = numberValue(url.searchParams.get("lat"));
    const lng = numberValue(url.searchParams.get("lng"));
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  return parseOriginFromBody(await parseJsonBody(request));
};

const toArray = <T extends Record<string, unknown>>(value: unknown): T[] => {
  if (!value) return [];
  const rows = Array.isArray(value) ? value : [value];
  return rows.filter(isRecord) as T[];
};

const extractContent = <T extends Record<string, unknown>>(upstream: unknown): T[] => {
  if (!isRecord(upstream)) return [];
  if (upstream.code === "990") return [];
  if (upstream.code && upstream.code !== "000") {
    throw new Error(`HRFCO API error: ${String(upstream.code)} ${String(upstream.message ?? "")}`);
  }
  return toArray<T>(upstream.content);
};

const hrfcoUrl = (serviceKey: string, path: string) =>
  `${API_BASE}/${encodeURIComponent(serviceKey)}${path}`;

const fetchHrfcoContent = async <T extends Record<string, unknown>>(
  serviceKey: string,
  path: string,
): Promise<T[]> => extractContent<T>(await fetchJson(hrfcoUrl(serviceKey, path)));

const getCachedStations = async (
  cache: Cache<HrfcoStation[]> | null,
  setCache: (cache: Cache<HrfcoStation[]>) => void,
  serviceKey: string,
  path: string,
) => {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  const value = await fetchHrfcoContent<HrfcoStation>(serviceKey, path);
  setCache({ value, expiresAt: now + STATION_CACHE_MS });
  return value;
};

const getWaterlevelStations = (serviceKey: string) =>
  getCachedStations(
    waterlevelStationCache,
    (cache) => {
      waterlevelStationCache = cache;
    },
    serviceKey,
    "/waterlevel/info.json",
  );

const getRainfallStations = (serviceKey: string) =>
  getCachedStations(
    rainfallStationCache,
    (cache) => {
      rainfallStationCache = cache;
    },
    serviceKey,
    "/rainfall/info.json",
  );

const firstContent = <T extends Record<string, unknown>>(rows: T[]) => rows[0] ?? null;

const readWaterlevelFeed = async (
  serviceKey: string,
  origin: LatLng,
  stations: HrfcoStation[],
): Promise<HrfcoSensorFeed | null> => {
  const station = selectNearestHrfcoStation(origin, stations);
  if (!station?.wlobscd) return null;

  const rows = await fetchHrfcoContent<HrfcoWaterlevelReading>(
    serviceKey,
    `/waterlevel/list/10M/${station.wlobscd}.json`,
  );
  const reading = firstContent(rows);
  return reading ? buildWaterlevelSensorFeed(station, reading) : null;
};

const readRainfallFeed = async (
  serviceKey: string,
  origin: LatLng,
  stations: HrfcoStation[],
): Promise<HrfcoSensorFeed | null> => {
  const station = selectNearestHrfcoStation(origin, stations);
  if (!station?.rfobscd) return null;

  const hourlyRows = await fetchHrfcoContent<HrfcoRainfallReading>(
    serviceKey,
    `/rainfall/list/1H/${station.rfobscd}.json`,
  );
  const hourly = firstContent(hourlyRows);
  if (hourly) return buildRainfallSensorFeed(station, hourly, "1H");

  const tenMinuteRows = await fetchHrfcoContent<HrfcoRainfallReading>(
    serviceKey,
    `/rainfall/list/10M/${station.rfobscd}.json`,
  );
  const tenMinute = firstContent(tenMinuteRows);
  return tenMinute ? buildRainfallSensorFeed(station, tenMinute, "10M") : null;
};

const readNearbyFloodForecastFeeds = async (
  serviceKey: string,
  origin: LatLng,
  waterlevelStations: HrfcoStation[],
) => {
  const forecasts = await fetchHrfcoContent<HrfcoFloodForecast>(serviceKey, "/fldfct/list.json");
  if (forecasts.length === 0) return [];

  const stationByCode = new Map(
    waterlevelStations
      .filter((station) => station.wlobscd)
      .map((station) => [station.wlobscd as string, station]),
  );

  const nearbyForecasts = forecasts.filter((forecast) => {
    const station = forecast.sttnm ? stationByCode.get(forecast.sttnm) : undefined;
    if (!station) return false;
    const position = hrfcoStationPosition(station);
    if (!position) return false;
    return hrfcoDistanceMeters(origin, position) <= FORECAST_RADIUS_METERS;
  });

  return buildFloodForecastSensorFeeds(nearbyForecasts);
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["GET", "POST"]);
      const origin = await parseOrigin(request);
      if (!origin) return jsonOk([] satisfies HrfcoSensorFeed[]);

      const serviceKey = getServiceKey();
      const [waterlevelStations, rainfallStations] = await Promise.all([
        getWaterlevelStations(serviceKey),
        getRainfallStations(serviceKey),
      ]);

      const results = await Promise.allSettled([
        readWaterlevelFeed(serviceKey, origin, waterlevelStations),
        readRainfallFeed(serviceKey, origin, rainfallStations),
        readNearbyFloodForecastFeeds(serviceKey, origin, waterlevelStations),
      ]);

      const feeds: HrfcoSensorFeed[] = [];
      const errors: string[] = [];

      for (const result of results) {
        if (result.status === "rejected") {
          errors.push(
            result.reason instanceof Error ? result.reason.message : String(result.reason),
          );
          continue;
        }
        if (Array.isArray(result.value)) {
          feeds.push(...result.value);
        } else if (result.value) {
          feeds.push(result.value);
        }
      }

      if (feeds.length === 0 && errors.length > 0) {
        throw new Error(errors.join("; "));
      }

      return jsonOk(feeds);
    } catch (error) {
      console.error(`${SOURCE} failed`, error);
      return edgeError(error);
    }
  }),
);
