import { useQuery } from "@tanstack/react-query";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import type { ApiResult } from "@/lib/api/types";
import type { Shelter, LatLng } from "@/lib/types";
import { fetchSheltersResult, isWithinBounds, type ShelterBounds } from "@/lib/shelters/shelterApi";
import { haversineMeters } from "@/lib/utils";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

export type { ShelterBounds };

export interface UseSheltersOptions {
  radiusMeters?: number;
  enabled?: boolean;
  bounds?: ShelterBounds | null;
}

const pendingShelterResult: ApiResult<Shelter[]> = {
  data: [],
  status: "STALE",
  timestamp: new Date(0).toISOString(),
  source: "shelter_operations",
};

export function useShelters(
  origin: LatLng,
  radiusMetersOrOptions: number | UseSheltersOptions = 5000,
  enabledParam = true,
  boundsParam?: ShelterBounds | null,
) {
  let radiusMeters = 5000;
  let enabled = enabledParam;
  let bounds: ShelterBounds | null = boundsParam ?? null;

  if (typeof radiusMetersOrOptions === "object" && radiusMetersOrOptions !== null) {
    radiusMeters = radiusMetersOrOptions.radiusMeters ?? 5000;
    enabled = radiusMetersOrOptions.enabled ?? true;
    bounds = radiusMetersOrOptions.bounds ?? null;
  } else if (typeof radiusMetersOrOptions === "number") {
    radiusMeters = radiusMetersOrOptions;
  }

  const isBrowser = typeof window !== "undefined";

  const queryKey = bounds
    ? [
        "shelters",
        "bounds",
        bounds.minX.toFixed(3),
        bounds.maxX.toFixed(3),
        bounds.minY.toFixed(3),
        bounds.maxY.toFixed(3),
      ]
    : ["shelters", origin.lat.toFixed(3), origin.lng.toFixed(3)];

  const query = useQuery({
    // Persisted cache keys keep only neighborhood-level (~110 m) location precision.
    queryKey,
    enabled: isBrowser && enabled,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () =>
      measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.shelters,
        source: "shelter_operations",
        run: () => fetchSheltersResult(origin, bounds),
      }),
  });

  const result = query.data ?? pendingShelterResult;
  const allShelters = result.data ?? [];

  const finalShelters = bounds
    ? allShelters.filter((s) => isWithinBounds(s.position, bounds))
    : (() => {
        const nearbyShelters = allShelters.filter(
          (s) => haversineMeters(origin, s.position) <= radiusMeters,
        );
        return nearbyShelters.length > 0 ? nearbyShelters : allShelters;
      })();

  return {
    shelters: finalShelters,
    result,
    isLoading: query.isLoading,
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : "Failed to load shelters"
      : null,
  };
}
