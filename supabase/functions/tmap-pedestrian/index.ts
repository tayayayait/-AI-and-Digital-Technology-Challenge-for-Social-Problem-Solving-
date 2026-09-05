import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import {
  assertAllowedMethod,
  parseJsonBody,
  validateLatLngRequest,
} from "../_shared/validation.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";
import {
  buildTmapPedestrianBody,
  requestTmapPedestrianWithFallback,
} from "../_shared/tmapPedestrian.ts";

const collectCoordinates = (coordinates: unknown): Array<{ lat: number; lng: number }> => {
  if (!Array.isArray(coordinates)) return [];
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [{ lng: coordinates[0], lat: coordinates[1] }];
  }
  return coordinates.flatMap(collectCoordinates);
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const payload = await parseJsonBody(request);
      const { origin, destination } = validateLatLngRequest(payload);
      const avoidStairs =
        typeof payload === "object" &&
        payload !== null &&
        (payload as Record<string, unknown>).avoidStairs === true;
      const appKey = requireEnv("TMAP_APP_KEY");

      const url = new URL("https://apis.openapi.sk.com/tmap/routes/pedestrian");
      url.searchParams.set("version", "1");
      url.searchParams.set("format", "json");

      type TmapResponse = {
        features?: Array<{
          type?: string;
          geometry?: { coordinates?: unknown };
          properties?: { totalDistance?: number; totalTime?: number };
        }>;
      };
      const result = await requestTmapPedestrianWithFallback<TmapResponse>(
        avoidStairs,
        async (searchOption) =>
          (await fetchJson(url, {
            method: "POST",
            headers: {
              appKey,
              "content-type": "application/json",
            },
            body: JSON.stringify(buildTmapPedestrianBody({ origin, destination }, searchOption)),
          })) as TmapResponse,
      );
      const upstream = result.data;

      const features = upstream.features ?? [];
      const summary = features.find((feature) => feature.properties?.totalDistance)?.properties;
      const geometry = features.flatMap((feature) =>
        collectCoordinates(feature.geometry?.coordinates),
      );
      if (geometry.length === 0) throw new Error("TMAP pedestrian returned no route");

      return jsonOk({
        routes: [
          {
            id: "tmap-walk-recommended",
            mode: "WALK",
            status: "RECOMMENDED",
            name:
              result.stairAvoidance === "APPLIED" ? "TMAP 계단 회피 보행 경로" : "TMAP 보행 경로",
            distanceMeters: summary?.totalDistance ?? 0,
            durationSeconds: summary?.totalTime ?? 0,
            safetyScore: 100,
            riskReasons:
              result.stairAvoidance === "UNAVAILABLE"
                ? ["계단 정보 없음 · 기본 보행 경로를 표시합니다."]
                : result.stairAvoidance === "APPLIED"
                  ? ["이동약자 모드 · 계단 회피 경로"]
                  : [],
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
