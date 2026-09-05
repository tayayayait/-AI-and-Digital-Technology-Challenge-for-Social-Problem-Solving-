import { useQuery } from "@tanstack/react-query";

import { API_CACHE_TTL_MS } from "@/lib/api/cache";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import { parseDisasterMessages } from "@/lib/api/disasterMsg";
import type { ApiResult, DisasterMessage } from "@/lib/api/types";
import { supabase } from "@/integrations/supabase/client";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

export const createDisasterMessagesFallbackResult = (
  now: () => number = () => Date.now(),
  options: { error?: string } = {},
): ApiResult<DisasterMessage[]> => ({
  data: [],
  status: "FALLBACK",
  timestamp: new Date(now()).toISOString(),
  source: "MOIS-DSSP-IF-00247",
  error: options.error,
});

export interface DisasterMessagesRequest {
  region?: string;
  startDate?: string;
  pageNo?: number;
  numOfRows?: number;
}

export type DisasterMessagesFetcher = (request: DisasterMessagesRequest) => Promise<unknown>;

const pad = (value: number) => String(value).padStart(2, "0");

export const formatDisasterMessageStartDate = (date = new Date()) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

const invokeDisasterMessagesEdge: DisasterMessagesFetcher = async (request) => {
  const { data, error } = await supabase.functions.invoke("disaster-messages", {
    body: {
      rgnNm: request.region,
      crtDt: request.startDate,
      pageNo: request.pageNo ?? 1,
      numOfRows: request.numOfRows ?? 20,
    },
  });
  if (error) throw new Error(error.message);
  return data;
};

export const fetchDisasterMessages = async (
  request: DisasterMessagesRequest,
  fetcher: DisasterMessagesFetcher = invokeDisasterMessagesEdge,
): Promise<DisasterMessage[]> => parseDisasterMessages(await fetcher(request));

export const useDisasterMessages = ({
  region = "",
  startDate = formatDisasterMessageStartDate(),
  pageNo = 1,
  numOfRows = 20,
  client,
  enabled = true,
}: DisasterMessagesRequest & { client?: DisasterMessagesFetcher; enabled?: boolean } = {}) => {
  const query = useQuery({
    queryKey: ["disaster-messages", region, startDate, pageNo, numOfRows],
    staleTime: API_CACHE_TTL_MS.DISASTER_MESSAGES,
    enabled: enabled && region.length > 0,
    queryFn: (): Promise<ApiResult<DisasterMessage[]>> =>
      measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.disasterMessages,
        source: "MOIS-DSSP-IF-00247",
        run: async () => {
          const data = await fetchDisasterMessages(
            { region, startDate, pageNo, numOfRows },
            client,
          );
          return {
            data,
            status: "OK",
            timestamp: new Date().toISOString(),
            source: "MOIS-DSSP-IF-00247",
          };
        },
      }),
    retry: client ? false : 2,
    retryDelay: 1000,
  });

  return {
    result:
      query.data ??
      createDisasterMessagesFallbackResult(() => 0, {
        error: query.isError
          ? query.error instanceof Error
            ? query.error.message
            : "Disaster messages API failed"
          : "Disaster messages request is loading",
      }),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchedAfterMount: query.isFetchedAfterMount,
  };
};
