import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsPreflight, jsonOk } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson } from "../_shared/upstream.ts";

const SOURCE = "ITS cctvInfo";
const API_URL = "https://openapi.its.go.kr:9443/cctvInfo";
const CCTV_UPSTREAM_TIMEOUT_MS = 15000;

interface LatLng {
  lat: number;
  lng: number;
}

interface CctvFeed {
  id: string;
  roadSectionId?: string;
  fileCreatedAt?: string;
  cctvType: string;
  streamUrl: string;
  resolution?: string;
  position: LatLng;
  format: string;
  name: string;
  source: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const text = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/;+$/g, "").trim();
};

const numberValue = (value: unknown) => {
  const parsed = Number(text(value) || value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRequest = (value: unknown) => {
  if (!isRecord(value)) throw new Error("Invalid request body");

  let center = null;
  let radiusMeters = 5000;
  let bounds = null;

  if (isRecord(value.bounds)) {
    const minX = numberValue(value.bounds.west ?? value.bounds.minX);
    const maxX = numberValue(value.bounds.east ?? value.bounds.maxX);
    const minY = numberValue(value.bounds.south ?? value.bounds.minY);
    const maxY = numberValue(value.bounds.north ?? value.bounds.maxY);
    if (minX != null && maxX != null && minY != null && maxY != null) {
      bounds = { minX, maxX, minY, maxY };
      center = { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 };
    }
  }

  if (!bounds && isRecord(value.center)) {
    const lat = numberValue(value.center.lat);
    const lng = numberValue(value.center.lng);
    if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      center = { lat, lng };
      radiusMeters = Math.min(Math.max(numberValue(value.radiusMeters) ?? 5000, 500), 20000);
      bounds = toBoundingBox({ center, radiusMeters });
    }
  }

  if (!bounds || !center) {
    throw new Error("Invalid center or bounds");
  }

  const roadType = text(value.roadType) || "all";
  const cctvType = text(value.cctvType) || "4";
  const limit = numberValue(value.limit);

  if (!["all", "ex", "its"].includes(roadType)) throw new Error("Invalid roadType");
  if (!["1", "2", "3", "4", "5"].includes(cctvType)) throw new Error("Invalid cctvType");

  return { center, radiusMeters, bounds, roadType, cctvType, limit };
};

const toBoundingBox = ({ center, radiusMeters }: { center: LatLng; radiusMeters: number }) => {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minX: center.lng - lngDelta,
    maxX: center.lng + lngDelta,
    minY: center.lat - latDelta,
    maxY: center.lat + latDelta,
  };
};

const toArray = (value: unknown): Record<string, unknown>[] => {
  if (!value) return [];
  const rows = Array.isArray(value) ? value : [value];
  return rows.filter(isRecord);
};

const readItems = (upstream: Record<string, unknown>) => {
  const response = upstream.response;
  if (isRecord(response) && Array.isArray(response.data)) return toArray(response.data);
  if (isRecord(response) && response.data) return toArray(response.data);
  if (Array.isArray(upstream.data)) return toArray(upstream.data);
  if (upstream.data) return toArray(upstream.data);
  const body = upstream.body;
  if (isRecord(body)) {
    const items = (body as any).items;
    return toArray(isRecord(items) ? (items.item ?? items) : items);
  }
  return [];
};

const normalizeCctv = (item: Record<string, unknown>, index: number): CctvFeed | null => {
  const lng = numberValue(item.coordx ?? item.coordX);
  const lat = numberValue(item.coordy ?? item.coordY);
  const streamUrl = text(item.cctvurl);
  const name = text(item.cctvname);
  if (lat == null || lng == null || !streamUrl || !name) return null;

  const roadSectionId = text(item.roadsectionid);
  const fileCreatedAt = text(item.filecreatetime);
  const cctvType = text(item.cctvtype) || "unknown";
  const format = text(item.cctvformat) || "unknown";

  return {
    id: [roadSectionId, name, lng, lat, index].filter(Boolean).join(":"),
    roadSectionId: roadSectionId || undefined,
    fileCreatedAt: fileCreatedAt || undefined,
    cctvType,
    streamUrl,
    resolution: text(item.cctvresolution) || undefined,
    position: { lat, lng },
    format,
    name,
    source: SOURCE,
  };
};

const readApiKey = () =>
  Deno.env.get("ITS_CCTV_API_KEY")?.trim() ||
  Deno.env.get("ITS_API_KEY")?.trim() ||
  "0e2cff1c020f453eabf61712ee429569";

const distanceMeters = (a: LatLng, b: LatLng): number => {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

const fetchCctvByType = async (
  apiKey: string,
  roadType: string,
  cctvType: string,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): Promise<CctvFeed[]> => {
  const url = new URL(API_URL);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("type", roadType);
  url.searchParams.set("cctvType", cctvType);
  url.searchParams.set("minX", bounds.minX.toFixed(6));
  url.searchParams.set("maxX", bounds.maxX.toFixed(6));
  url.searchParams.set("minY", bounds.minY.toFixed(6));
  url.searchParams.set("maxY", bounds.maxY.toFixed(6));
  url.searchParams.set("getType", "json");

  const upstream = await fetchJson(url, undefined, {
    timeoutMs: CCTV_UPSTREAM_TIMEOUT_MS,
    timeoutMessage: `${SOURCE} ${roadType} request timed out after ${CCTV_UPSTREAM_TIMEOUT_MS}ms`,
  });
  if (!isRecord(upstream)) return [];

  const resultCode = text(upstream.resultCode);
  if (resultCode && resultCode !== "0") return [];

  return readItems(upstream)
    .map((item, index) => normalizeCctv(item, index))
    .filter((camera): camera is CctvFeed => camera != null);
};

const fetchAllRoadCctvs = async (
  apiKey: string,
  cctvType: string,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): Promise<CctvFeed[]> => {
  try {
    const all = await fetchCctvByType(apiKey, "all", cctvType, bounds);
    if (all.length > 0) return all;
  } catch {}

  try {
    const expressway = await fetchCctvByType(apiKey, "ex", cctvType, bounds);
    if (expressway.length > 0) return expressway;
  } catch {}

  try {
    return await fetchCctvByType(apiKey, "its", cctvType, bounds);
  } catch {
    return [];
  }
};

const dedupeKey = (c: CctvFeed) =>
  `${c.name}:${c.position.lat.toFixed(5)}:${c.position.lng.toFixed(5)}`;

const KWATER_SOURCE = "K-water 하천CCTV";
const KWATER_API_URL = "https://apis.data.go.kr/1480523/WaterCCTVService/waterCCTVList";

const readKwaterKey = () => Deno.env.get("KWATER_SERVICE_KEY")?.trim() || "";

const fetchKwaterCctvs = async (
  serviceKey: string,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): Promise<CctvFeed[]> => {
  try {
    const url = new URL(KWATER_API_URL);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("numOfRows", "100");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("dataType", "JSON");

    const upstream = await fetchJson(url, undefined, {
      timeoutMs: CCTV_UPSTREAM_TIMEOUT_MS,
      timeoutMessage: `${KWATER_SOURCE} request timed out`,
    });
    if (!isRecord(upstream)) return [];

    const body = isRecord(upstream.response) ? upstream.response : upstream;
    const bodyInner = isRecord(body) && isRecord(body.body) ? body.body : body;
    const items =
      isRecord(bodyInner) && isRecord(bodyInner.items)
        ? toArray(bodyInner.items.item ?? bodyInner.items)
        : isRecord(bodyInner)
          ? toArray(bodyInner.item ?? bodyInner.data)
          : [];

    return items
      .map((item, index): CctvFeed | null => {
        const lat = numberValue(item.lat ?? item.latitude ?? item.coordy ?? item.coordY);
        const lng = numberValue(
          item.lng ?? item.lon ?? item.longitude ?? item.coordx ?? item.coordX,
        );
        const streamUrl = text(
          item.cctvUrl ?? item.cctvurl ?? item.streamUrl ?? item.videoUrl ?? item.liveUrl,
        );
        const name = text(item.cctvNm ?? item.cctvname ?? item.facilityNm ?? item.name);
        if (lat == null || lng == null || !streamUrl || !name) return null;

        if (lat < bounds.minY || lat > bounds.maxY || lng < bounds.minX || lng > bounds.maxX) {
          return null;
        }

        return {
          id: `kwater:${name}:${lng}:${lat}:${index}`,
          cctvType: "4",
          streamUrl,
          position: { lat, lng },
          format: "HLS",
          name: `🌊 ${name}`,
          source: KWATER_SOURCE,
        };
      })
      .filter((c): c is CctvFeed => c != null);
  } catch {
    return [];
  }
};

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  try {
    assertAllowedMethod(request.method, ["POST"]);
    const input = parseRequest(await parseJsonBody(request));
    const apiKey = readApiKey();

    if (!apiKey) {
      return jsonOk({
        cameras: [],
        source: SOURCE,
        status: "PENDING_ACCESS",
        message: "ITS_CCTV_API_KEY is not configured",
      });
    }

    const bounds = input.bounds;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let supabaseAdmin = null;
    let cachedCameras: CctvFeed[] | null = null;

    if (supabaseUrl && supabaseKey) {
      supabaseAdmin = createClient(supabaseUrl, supabaseKey);

      const { data: cached, error } = await supabaseAdmin
        .from("cctv_cameras")
        .select("*")
        .gte("lng", bounds.minX)
        .lte("lng", bounds.maxX)
        .gte("lat", bounds.minY)
        .lte("lat", bounds.maxY);

      if (cached && cached.length > 0) {
        cachedCameras = cached.map((row) => ({
          id: row.id,
          name: row.name,
          position: { lat: row.lat, lng: row.lng },
          streamUrl: row.stream_url,
          cctvType: row.cctv_type || "4",
          format: row.format || "HLS",
          source: row.source || SOURCE,
          _updatedAt: row.updated_at,
        }));
      }
    }

    let needsRevalidation = false;
    if (cachedCameras && cachedCameras.length > 0) {
      // ITS CCTV HLS URL 토큰은 수 분 내에 만료되므로 캐시 유지 시간을 2분으로 단축합니다.
      const cacheExpirationTime = Date.now() - 2 * 60 * 1000;
      for (const cam of cachedCameras) {
        if (new Date((cam as any)._updatedAt).getTime() < cacheExpirationTime) {
          needsRevalidation = true;
          break;
        }
      }
    }

    if (cachedCameras && cachedCameras.length > 0 && !needsRevalidation) {
      const limit =
        input.limit == null ? 300 : Math.min(Math.max(Math.trunc(input.limit), 1), 5000);
      const cameras = cachedCameras
        .sort(
          (a, b) =>
            distanceMeters(input.center, a.position) - distanceMeters(input.center, b.position),
        )
        .slice(0, limit);

      return jsonOk({ cameras, source: "Supabase DB Cache", status: "OK" });
    }

    const runFetchAndSync = async () => {
      try {
        const fetchTasks: Promise<CctvFeed[]>[] = [];

        if (input.roadType === "all") {
          fetchTasks.push(fetchAllRoadCctvs(apiKey, input.cctvType, bounds));
        } else {
          fetchTasks.push(fetchCctvByType(apiKey, input.roadType, input.cctvType, bounds));
        }

        const kwaterKey = readKwaterKey();
        if (kwaterKey) {
          fetchTasks.push(fetchKwaterCctvs(kwaterKey, bounds));
        }

        const results = await Promise.allSettled(fetchTasks);
        const allFetched = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

        const seen = new Set<string>();
        const allCameras: CctvFeed[] = [];
        for (const cam of allFetched) {
          const key = dedupeKey(cam);
          if (!seen.has(key)) {
            seen.add(key);
            allCameras.push(cam);
          }
        }

        if (supabaseAdmin && allCameras.length > 0) {
          await supabaseAdmin.from("cctv_cameras").upsert(
            allCameras.map((c) => ({
              id: c.id,
              name: c.name,
              lat: c.position.lat,
              lng: c.position.lng,
              stream_url: c.streamUrl,
              cctv_type: c.cctvType,
              format: c.format,
              source: c.source,
              updated_at: new Date().toISOString(),
            })),
          );
        }
        return { allCameras, kwaterKey };
      } catch (err) {
        console.error("Background sync failed", err);
        return null;
      }
    };

    if (cachedCameras && cachedCameras.length > 0 && needsRevalidation) {
      runFetchAndSync();

      const limit =
        input.limit == null ? 300 : Math.min(Math.max(Math.trunc(input.limit), 1), 5000);
      const cameras = cachedCameras
        .sort(
          (a, b) =>
            distanceMeters(input.center, a.position) - distanceMeters(input.center, b.position),
        )
        .slice(0, limit);

      return jsonOk({
        cameras,
        source: "Supabase DB Cache (Stale-While-Revalidate)",
        status: "OK",
      });
    }

    const syncResult = await runFetchAndSync();
    if (!syncResult) throw new Error("Failed to fetch live CCTV data");

    const limit = input.limit == null ? 300 : Math.min(Math.max(Math.trunc(input.limit), 1), 5000);
    const cameras = syncResult.allCameras
      .sort(
        (a, b) =>
          distanceMeters(input.center, a.position) - distanceMeters(input.center, b.position),
      )
      .slice(0, limit);

    const sources = [SOURCE];
    if (syncResult.kwaterKey) sources.push(KWATER_SOURCE);

    return jsonOk({ cameras, source: sources.join(" + ") + " (Live API)", status: "OK" });
  } catch (error) {
    return edgeError(error);
  }
});
