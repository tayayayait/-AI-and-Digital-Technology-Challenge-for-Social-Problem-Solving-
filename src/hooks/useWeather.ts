import { useQuery } from "@tanstack/react-query";

import {
  buildKmaWeatherRequest,
  fetchWeatherSnapshot,
  type WeatherEdgeFetcher,
} from "@/lib/api/weather";
import { API_CACHE_TTL_MS } from "@/lib/api/cache";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import type { ApiResult, WeatherSnapshot } from "@/lib/api/types";
import type { LatLng } from "@/lib/types";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

interface UseWeatherOptions {
  origin: LatLng;
  now?: Date;
  client?: WeatherEdgeFetcher;
  enabled?: boolean;
}

const failedWeatherResult = (error: unknown): ApiResult<WeatherSnapshot> => ({
  data: null,
  status: "FAILED",
  timestamp: new Date().toISOString(),
  source: "kma-weather",
  error: error instanceof Error ? error.message : "Weather API failed",
});

export const useWeather = ({ origin, now, client, enabled = true }: UseWeatherOptions) => {
  const request = buildKmaWeatherRequest({ origin, now });
  const query = useQuery({
    queryKey: ["weather", request.nx, request.ny, request.baseDate, request.baseTime],
    staleTime: API_CACHE_TTL_MS.WEATHER_CURRENT,
    enabled,
    queryFn: (): Promise<ApiResult<WeatherSnapshot>> =>
      measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.weather,
        source: "kma-weather",
        run: async () => {
          const data = await fetchWeatherSnapshot(request, client);
          return {
            data,
            status: "OK",
            timestamp: new Date().toISOString(),
            source: "kma-weather",
          };
        },
      }),
    retry: 2,
    retryDelay: 1000,
  });

  return {
    result: query.data ?? {
      data: null,
      status: "FAILED",
      timestamp: new Date(0).toISOString(),
      source: "kma-weather",
      error: query.isError
        ? query.error instanceof Error
          ? query.error.message
          : "Weather API failed"
        : "Weather request is loading",
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchedAfterMount: query.isFetchedAfterMount,
  };
};
