import { supabase } from "@/integrations/supabase/client";
import type { ApiResult } from "@/lib/api/types";
import type { Shelter, LatLng } from "@/lib/types";
import { DEMO_CENTER, SHELTERS as MOCK_SHELTERS } from "@/mocks/data";
import { deriveFloodShelterStatus } from "@/lib/shelters/operationStatus";
import { haversineMeters } from "@/lib/utils";

const TEMPORARY_HOUSING_TYPE = "이재민 임시주거시설";
const STATIC_SHELTER_RADIUS_METERS = 5000;
const STATIC_SHELTER_LIMIT = 100;
const DEMO_FALLBACK_RADIUS_METERS = 10000;

const isFloodEvacuationCandidate = (shelter: Shelter) =>
  !shelter.type.includes("민방위") && shelter.status !== "EXCLUDED" && !shelter.underground;

const withFloodStatus = (shelter: Shelter): Shelter => ({
  ...shelter,
  status: deriveFloodShelterStatus(shelter),
});

const fallbackShelters = () =>
  MOCK_SHELTERS.map((shelter) =>
    withFloodStatus({
      ...shelter,
      type: TEMPORARY_HOUSING_TYPE,
    }),
  ).filter(isFloodEvacuationCandidate);

const isValidShelter = (value: unknown): value is Shelter => {
  if (!value || typeof value !== "object") return false;
  const shelter = value as Partial<Shelter>;
  return (
    typeof shelter.id === "string" &&
    typeof shelter.name === "string" &&
    typeof shelter.address === "string" &&
    typeof shelter.capacity === "number" &&
    typeof shelter.underground === "boolean" &&
    typeof shelter.type === "string" &&
    (shelter.status === "OPERATING" ||
      shelter.status === "CHECK_REQUIRED" ||
      shelter.status === "EXCLUDED") &&
    typeof shelter.position?.lat === "number" &&
    Number.isFinite(shelter.position.lat) &&
    typeof shelter.position.lng === "number" &&
    Number.isFinite(shelter.position.lng)
  );
};

export interface ShelterBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const isWithinBounds = (pos: LatLng, bounds: ShelterBounds): boolean =>
  pos.lat >= bounds.minY &&
  pos.lat <= bounds.maxY &&
  pos.lng >= bounds.minX &&
  pos.lng <= bounds.maxX;

const fetchStaticShelters = async (
  origin: LatLng,
  bounds?: ShelterBounds | null,
): Promise<Shelter[]> => {
  if (typeof window === "undefined" || typeof fetch !== "function") return [];

  const response = await fetch("/data/shelters.json");
  if (!response.ok) throw new Error(`Static shelter data failed: ${response.status}`);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) return [];

  const validShelters = payload
    .filter(isValidShelter)
    .map((shelter) => withFloodStatus(shelter))
    .filter(isFloodEvacuationCandidate);

  if (bounds) {
    const inBounds = validShelters.filter((s) => isWithinBounds(s.position, bounds));
    return inBounds
      .map((shelter) => ({
        shelter,
        distanceMeters: haversineMeters(origin, shelter.position),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, STATIC_SHELTER_LIMIT)
      .map(({ shelter }) => shelter);
  }

  const ranked = validShelters
    .map((shelter) => ({
      shelter,
      distanceMeters: haversineMeters(origin, shelter.position),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearby = ranked.filter(
    ({ distanceMeters }) => distanceMeters <= STATIC_SHELTER_RADIUS_METERS,
  );
  return (nearby.length > 0 ? nearby : ranked)
    .slice(0, STATIC_SHELTER_LIMIT)
    .map(({ shelter }) => shelter);
};

interface ShelterFallbackResult {
  shelters: Shelter[];
  source: "static-shelters" | "demo-shelters" | "no-current-location-fallback";
  error?: string;
}

const fallbackSheltersForOrigin = async (
  origin: LatLng,
  bounds?: ShelterBounds | null,
): Promise<ShelterFallbackResult> => {
  let fallbackError: string | undefined;
  try {
    const staticShelters = await fetchStaticShelters(origin, bounds);
    if (staticShelters.length > 0) {
      return { shelters: staticShelters, source: "static-shelters" };
    }
  } catch (error) {
    fallbackError = error instanceof Error ? error.message : "Static shelter data unavailable";
    console.warn("Static shelter data unavailable. Falling back to demo data.", error);
  }

  if (bounds) {
    const demoInBounds = fallbackShelters().filter((s) => isWithinBounds(s.position, bounds));
    if (demoInBounds.length > 0) {
      return {
        shelters: demoInBounds,
        source: "demo-shelters",
        error: fallbackError,
      };
    }
  } else if (haversineMeters(origin, DEMO_CENTER) <= DEMO_FALLBACK_RADIUS_METERS) {
    return {
      shelters: fallbackShelters(),
      source: "demo-shelters",
      error: fallbackError,
    };
  }

  console.warn("No current-location shelter fallback is available outside the demo region.");
  return {
    shelters: [],
    source: "no-current-location-fallback",
    error: fallbackError ?? "No current-location shelter fallback is available",
  };
};

export const fetchSheltersResult = async (
  origin: LatLng,
  bounds?: ShelterBounds | null,
): Promise<ApiResult<Shelter[]>> => {
  const timestamp = () => new Date().toISOString();
  try {
    let query = supabase.from("shelter_operations").select("*");

    if (bounds) {
      query = query
        .gte("lat", bounds.minY)
        .lte("lat", bounds.maxY)
        .gte("lng", bounds.minX)
        .lte("lng", bounds.maxX);
    } else {
      // 반경 5km 대략적 bounding box 필터링 (1도 위도 = 약 111km)
      const latDelta = 5000 / 111320;
      const lngDelta = 5000 / (111320 * Math.cos(origin.lat * (Math.PI / 180)));
      query = query
        .gte("lat", origin.lat - latDelta)
        .lte("lat", origin.lat + latDelta)
        .gte("lng", origin.lng - lngDelta)
        .lte("lng", origin.lng + lngDelta);
    }

    const { data, error } = await query.limit(STATIC_SHELTER_LIMIT);

    if (error) throw error;

    if (data && data.length > 0) {
      const shelters = data
        .map((row) => {
          const shelter: Shelter = {
            id: row.id,
            name: row.name,
            address: row.address,
            position: { lat: row.lat, lng: row.lng },
            capacity: row.capacity,
            status: row.status as Shelter["status"],
            underground: row.underground ?? false,
            type: row.facility_type ?? TEMPORARY_HOUSING_TYPE,
          };

          return withFloodStatus(shelter);
        })
        .filter(isFloodEvacuationCandidate);

      if (shelters.length > 0) {
        return {
          data: shelters,
          status: "OK",
          timestamp: timestamp(),
          source: "shelter_operations",
        };
      }
      console.warn(
        "Shelter DB returned no flood-safe temporary housing candidates. Falling back to static shelter data.",
      );
    }

    const fallback = await fallbackSheltersForOrigin(origin, bounds);
    return {
      data: fallback.shelters,
      status: "FALLBACK",
      timestamp: timestamp(),
      source: fallback.source,
      error: fallback.error,
    };
  } catch (err) {
    console.warn(
      "Exception querying shelter_operations table. Falling back to static shelter data.",
      err,
    );
    const fallback = await fallbackSheltersForOrigin(origin, bounds);
    return {
      data: fallback.shelters,
      status: fallback.shelters.length > 0 ? "FALLBACK" : "FAILED",
      timestamp: timestamp(),
      source: fallback.source,
      error:
        err instanceof Error
          ? err.message
          : (fallback.error ?? "Shelter operation data unavailable"),
    };
  }
};

export const fetchShelters = async (
  origin: LatLng,
  bounds?: ShelterBounds | null,
): Promise<Shelter[]> => (await fetchSheltersResult(origin, bounds)).data ?? [];
