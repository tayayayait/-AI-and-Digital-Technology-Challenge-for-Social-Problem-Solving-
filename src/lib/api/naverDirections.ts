import { routesResponseSchema } from "./routeSchemas";
import type { RouteResult } from "@/lib/types";
import type { LatLng } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

export interface LatLngRouteRequest {
  origin: LatLng;
  destination: LatLng;
  avoidStairs?: boolean;
}

export type RouteEdgeFetcher = (request: LatLngRouteRequest) => Promise<unknown>;

const invokeNaverDirectionsEdge: RouteEdgeFetcher = async (request) => {
  const { data, error } = await supabase.functions.invoke("naver-directions", {
    body: request,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const parseNaverDirectionsRoutes = (data: unknown): RouteResult[] =>
  routesResponseSchema.parse(data).routes;

export const fetchNaverDirectionsRoutes = async (
  request: LatLngRouteRequest,
  fetcher: RouteEdgeFetcher = invokeNaverDirectionsEdge,
): Promise<RouteResult[]> => parseNaverDirectionsRoutes(await fetcher(request));
