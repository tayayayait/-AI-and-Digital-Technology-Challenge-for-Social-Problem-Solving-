import { useQuery } from "@tanstack/react-query";
import { fetchSensorFeeds } from "@/lib/sensors/sensorAccess";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import type { ApiResult } from "@/lib/api/types";
import type { SensorFeed } from "@/lib/sensors/sensorAccess";
import type { LatLng } from "@/lib/types";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

const pendingSensorResult: ApiResult<SensorFeed[]> = {
  data: [],
  status: "STALE",
  timestamp: new Date(0).toISOString(),
  source: "HRFCO sensors",
};

export function useSensorFeeds(origin?: LatLng) {
  const query = useQuery({
    queryKey: [
      "sensor-feeds",
      origin ? origin.lat.toFixed(4) : "none",
      origin ? origin.lng.toFixed(4) : "none",
    ],
    queryFn: () =>
      measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.sensorFeeds,
        source: "HRFCO sensors",
        run: async (): Promise<ApiResult<SensorFeed[]>> => {
          const feeds = await fetchSensorFeeds(origin);
          const hasActiveFeed = feeds.some((feed) => feed.status === "ACTIVE");
          const allFailed = feeds.length > 0 && feeds.every((feed) => feed.status === "FAILED");
          return {
            data: feeds,
            status: hasActiveFeed ? "OK" : allFailed ? "FAILED" : "FALLBACK",
            timestamp: new Date().toISOString(),
            source: "HRFCO sensors",
            error: hasActiveFeed
              ? undefined
              : (feeds.find((feed) => feed.message)?.message ?? "실시간 센서 접근 대기"),
          };
        },
      }),
    enabled: origin != null,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  return {
    feeds: query.data?.data ?? [],
    isLoading: query.isLoading,
    result: query.data ?? pendingSensorResult,
  };
}
