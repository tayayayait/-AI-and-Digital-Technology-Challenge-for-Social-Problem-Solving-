import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, requireEnv } from "../_shared/upstream.ts";

interface WmsBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface LatLng {
  lat: number;
  lng: number;
}

const ALLOWED_LAYERS = new Map([
  [
    "A2SM_FLUDMARKS",
    {
      endpoint: "https://www.safemap.go.kr/openapi2/IF_0092_WMS",
      layer: "A2SM_FLUDMARKS",
    },
  ],
  [
    "A2SM_FLOODFOVRRISK1",
    {
      endpoint: "https://www.safemap.go.kr/openapi2/IF_0089_WMS",
      layer: "A2SM_FLOODFOVRRISK1",
    },
  ],
] as const);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseNumber = (value: unknown, name: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  return value;
};

const parseBounds = (value: unknown): WmsBounds => {
  if (!isRecord(value)) throw new Error("Invalid bounds");
  const bounds = {
    west: parseNumber(value.west, "bounds.west"),
    south: parseNumber(value.south, "bounds.south"),
    east: parseNumber(value.east, "bounds.east"),
    north: parseNumber(value.north, "bounds.north"),
  };
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new Error("Invalid bounds range");
  }
  return bounds;
};

const parsePoint = (value: unknown): LatLng => {
  if (!isRecord(value)) throw new Error("Invalid point");
  const point = {
    lat: parseNumber(value.lat, "point.lat"),
    lng: parseNumber(value.lng, "point.lng"),
  };
  if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
    throw new Error("Invalid point range");
  }
  return point;
};

const parseRequest = (value: unknown) => {
  if (!isRecord(value)) throw new Error("Invalid request body");
  const layer = typeof value.layer === "string" ? ALLOWED_LAYERS.get(value.layer) : undefined;
  if (!layer) throw new Error("Invalid WMS layer");
  if (typeof value.endpoint === "string" && value.endpoint !== layer.endpoint) {
    throw new Error("Invalid WMS endpoint");
  }
  return {
    layer,
    bounds: parseBounds(value.bounds),
    point: parsePoint(value.point),
  };
};

const formatBbox = (bounds: WmsBounds) =>
  [bounds.west, bounds.south, bounds.east, bounds.north].map((value) => value.toFixed(6)).join(",");

const toPixel = (point: LatLng, bounds: WmsBounds, width: number, height: number) => {
  const x = Math.round(((point.lng - bounds.west) / (bounds.east - bounds.west)) * width);
  const y = Math.round(((bounds.north - point.lat) / (bounds.north - bounds.south)) * height);
  return {
    x: Math.max(0, Math.min(width - 1, x)),
    y: Math.max(0, Math.min(height - 1, y)),
  };
};

const parseFeatures = (text: string) => {
  if (!text || text.includes("<ServiceException")) return [];
  try {
    const json = JSON.parse(text) as unknown;
    if (isRecord(json) && Array.isArray(json.features)) return json.features;
  } catch {
    // Ignore JSON parse error, proceed to XML fallback
  }

  // Fallback for XML/GML response
  // SafeMap WMS may ignore info_format=application/json and return GML/XML instead.
  if (
    text.includes("gml:featureMember") ||
    text.includes("<FIELDS ") ||
    text.includes("A2SM_FLUDMARKS") ||
    text.includes("A2SM_FLOODFOVRRISK1")
  ) {
    // Return a dummy feature to indicate overlap > 0
    return [{ type: "Feature", properties: { _xml_fallback: true } }];
  }

  return [];
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const { layer, bounds, point } = parseRequest(await parseJsonBody(request));
      const serviceKey = requireEnv("SAFEMAP_SERVICE_KEY");
      const width = 256;
      const height = 256;
      const { x, y } = toPixel(point, bounds, width, height);

      const url = new URL(layer.endpoint);
      url.searchParams.set("serviceKey", serviceKey);
      url.searchParams.set("service", "WMS");
      url.searchParams.set("request", "GetFeatureInfo");
      url.searchParams.set("version", "1.1.1");
      url.searchParams.set("layers", layer.layer);
      url.searchParams.set("query_layers", layer.layer);
      url.searchParams.set("styles", "");
      url.searchParams.set("srs", "EPSG:4326");
      url.searchParams.set("bbox", formatBbox(bounds));
      url.searchParams.set("format", "image/png");
      url.searchParams.set("width", String(width));
      url.searchParams.set("height", String(height));
      url.searchParams.set("info_format", "application/json");
      url.searchParams.set("feature_count", "10");
      url.searchParams.set("x", String(x));
      url.searchParams.set("y", String(y));

      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok) {
        return jsonOk({ overlap: 0, features: [], error: `SafeMap ${response.status}` });
      }

      const features = parseFeatures(text);
      return jsonOk({ overlap: features.length > 0 ? 1 : 0, features });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
