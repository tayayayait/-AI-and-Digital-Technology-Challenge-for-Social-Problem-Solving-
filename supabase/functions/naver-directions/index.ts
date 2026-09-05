import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import {
  assertAllowedMethod,
  parseJsonBody,
  validateLatLngRequest,
} from "../_shared/validation.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";

const toNaverCoord = ({ lat, lng }: { lat: number; lng: number }) => `${lng},${lat}`;

const toLatLngPath = (path: unknown): Array<{ lat: number; lng: number }> => {
  if (!Array.isArray(path)) return [];
  return path
    .filter((point): point is [number, number] => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => ({ lat, lng }));
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const { origin, destination } = validateLatLngRequest(await parseJsonBody(request));
      const clientId = requireEnv("NAVER_DIRECTIONS_CLIENT_ID");
      const clientSecret = requireEnv("NAVER_DIRECTIONS_CLIENT_SECRET");

      const url = new URL("https://maps.apigw.ntruss.com/map-direction/v1/driving");
      url.searchParams.set("start", toNaverCoord(origin));
      url.searchParams.set("goal", toNaverCoord(destination));
      url.searchParams.set("option", "trafast");

      const upstream = (await fetchJson(url, {
        headers: {
          "x-ncp-apigw-api-key-id": clientId,
          "x-ncp-apigw-api-key": clientSecret,
        },
      })) as {
        route?: {
          trafast?: Array<{
            summary?: { distance?: number; duration?: number };
            path?: unknown;
          }>;
        };
      };

      const first = upstream.route?.trafast?.[0];
      const geometry = toLatLngPath(first?.path);
      if (!first || geometry.length === 0) throw new Error("NAVER Directions returned no route");

      return jsonOk({
        routes: [
          {
            id: "naver-drive-trafast",
            mode: "DRIVE",
            status: "RECOMMENDED",
            name: "NAVER 차량 빠른 경로",
            distanceMeters: first.summary?.distance ?? 0,
            durationSeconds: Math.round((first.summary?.duration ?? 0) / 1000),
            safetyScore: 100,
            riskReasons: [],
            geometry,
            shelterId: "external",
          },
        ],
      });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
