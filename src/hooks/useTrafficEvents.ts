import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { API_CACHE_TTL_MS } from "@/lib/api/cache";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import { fetchTrafficEvents } from "@/lib/api/trafficEvents";
import type { ApiResult } from "@/lib/api/types";
import type { LatLng, TrafficEvent } from "@/lib/types";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

const pendingResult = (origin: LatLng): ApiResult<TrafficEvent[]> => ({
  data: [],
  status: "FALLBACK",
  timestamp: new Date(0).toISOString(),
  source: "ITS traffic-events",
  error: `Traffic event request pending for ${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`,
});

export function useTrafficEvents(origin: LatLng, enabled = true) {
  const lastSuccessfulEventsRef = useRef<TrafficEvent[]>([]);
  const query = useQuery({
    queryKey: ["traffic-events", origin.lat.toFixed(4), origin.lng.toFixed(4)],
    staleTime: API_CACHE_TTL_MS.TRAFFIC_EVENTS,
    enabled,
    placeholderData: keepPreviousData,
    queryFn: (): Promise<ApiResult<TrafficEvent[]>> =>
      measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.trafficEvents,
        source: "ITS traffic-events",
        run: async () => {
          try {
            const response = await Promise.race([
              fetchTrafficEvents({ center: origin, radiusMeters: 5000 }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("API Timeout")), 15000),
              ),
            ]);

            if (response.status !== "OK") {
              return {
                data: [],
                status: "FALLBACK",
                timestamp: new Date().toISOString(),
                source: response.source ?? "ITS traffic-events",
                error: response.message ?? "Traffic event API pending",
              };
            }

            return {
              data: response.events,
              status: "OK",
              timestamp: new Date().toISOString(),
              source: response.source ?? "ITS traffic-events",
            };
          } catch (error) {
            console.warn("Traffic events fetch failed:", error);
            return {
              ...pendingResult(origin),
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : "Traffic event API failed",
            };
          }
        },
      }),
  });

  const result = query.data ?? pendingResult(origin);
  useEffect(() => {
    if (result.status === "OK") {
      lastSuccessfulEventsRef.current = result.data ?? [];
    }
  }, [result]);

  const events = result.status === "OK" ? (result.data ?? []) : lastSuccessfulEventsRef.current;

  return {
    events,
    result,
    isLoading: query.isLoading,
  };
}
