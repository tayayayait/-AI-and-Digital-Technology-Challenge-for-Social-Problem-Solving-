import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import {
  createOfflineQueryPersister,
  OFFLINE_CACHE_MAX_AGE_MS,
} from "@/lib/offline/queryPersistence";
import {
  classifyQueryNetworkResult,
  queryNetworkSignal,
  type QueryNetworkOutcome,
} from "@/lib/offline/networkSignal";

const reportQueryNetworkOutcome = (outcome: QueryNetworkOutcome) => {
  if (typeof window === "undefined" || outcome === "IGNORE") return;
  if (outcome === "FAILURE") queryNetworkSignal.reportFailure();
  else queryNetworkSignal.reportSuccess();
};

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        reportQueryNetworkOutcome(classifyQueryNetworkResult(query.queryKey, error, true));
      },
      onSuccess: (data, query) => {
        reportQueryNetworkOutcome(classifyQueryNetworkResult(query.queryKey, data));
      },
    }),
    defaultOptions: {
      queries: {
        gcTime: OFFLINE_CACHE_MAX_AGE_MS,
        networkMode: "offlineFirst",
      },
    },
  });
  const queryPersister = createOfflineQueryPersister();

  const router = createRouter({
    routeTree,
    context: { queryClient, queryPersister },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
