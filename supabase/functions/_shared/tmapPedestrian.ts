export type TmapPedestrianSearchOption = "0" | "30";
export type StairAvoidanceStatus = "NOT_REQUESTED" | "APPLIED" | "UNAVAILABLE";

interface LatLng {
  lat: number;
  lng: number;
}

interface TmapPedestrianRouteRequest {
  origin: LatLng;
  destination: LatLng;
}

export const buildTmapPedestrianBody = (
  { origin, destination }: TmapPedestrianRouteRequest,
  searchOption: TmapPedestrianSearchOption,
) => ({
  startX: origin.lng,
  startY: origin.lat,
  endX: destination.lng,
  endY: destination.lat,
  reqCoordType: "WGS84GEO",
  resCoordType: "WGS84GEO",
  startName: "origin",
  endName: "shelter",
  searchOption,
});

export const requestTmapPedestrianWithFallback = async <T>(
  avoidStairs: boolean,
  fetcher: (searchOption: TmapPedestrianSearchOption) => Promise<T>,
): Promise<{ data: T; stairAvoidance: StairAvoidanceStatus }> => {
  if (!avoidStairs) {
    return { data: await fetcher("0"), stairAvoidance: "NOT_REQUESTED" };
  }

  try {
    return { data: await fetcher("30"), stairAvoidance: "APPLIED" };
  } catch {
    return { data: await fetcher("0"), stairAvoidance: "UNAVAILABLE" };
  }
};
