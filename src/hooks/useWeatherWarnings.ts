import { useQuery } from "@tanstack/react-query";

import {
  EMPTY_WARNING_RESPONSE,
  fetchWeatherWarnings,
  WEATHER_WARNING_SOURCE,
  type WeatherWarningFetcher,
  type WeatherWarningResponse,
} from "@/lib/api/weatherWarning";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import type { ApiResult } from "@/lib/api/types";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

interface UseWeatherWarningsOptions {
  region: string;
  client?: WeatherWarningFetcher;
  enabled?: boolean;
}

// 특보는 발표 시각 단위로 갱신되므로 3분이면 충분하다. Edge Function도 같은 주기로
// 캐시하기 때문에 실제 상류 호출은 그보다 드물게 발생한다.
const WARNING_STALE_TIME_MS = 3 * 60 * 1000;

export const useWeatherWarnings = ({
  region,
  client,
  enabled = true,
}: UseWeatherWarningsOptions) => {
  const query = useQuery({
    queryKey: ["weather-warning", region],
    staleTime: WARNING_STALE_TIME_MS,
    enabled: enabled && region.length > 0,
    retry: 1,
    queryFn: (): Promise<ApiResult<WeatherWarningResponse>> =>
      measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.weatherWarnings,
        source: WEATHER_WARNING_SOURCE,
        run: async () => {
          const data = await fetchWeatherWarnings(region, client);
          return {
            data,
            // 상류 미승인·장애는 Edge Function이 PENDING_ACCESS로 돌려준다.
            // 특보는 보조 근거이므로 실패를 FALLBACK으로 낮춰 표시하고 화면은 계속 동작시킨다.
            status: data.status === "OK" ? "OK" : "FALLBACK",
            timestamp: data.announcedAt ?? new Date().toISOString(),
            source: WEATHER_WARNING_SOURCE,
            error: data.status === "OK" ? undefined : data.message,
          };
        },
      }),
  });

  const result: ApiResult<WeatherWarningResponse> = query.data ?? {
    data: null,
    status: query.isError ? "FAILED" : "STALE",
    timestamp: new Date(0).toISOString(),
    source: WEATHER_WARNING_SOURCE,
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : "Weather warning API failed"
      : undefined,
  };

  return {
    result,
    warnings: result.data ?? EMPTY_WARNING_RESPONSE,
    isLoading: query.isLoading,
  };
};
