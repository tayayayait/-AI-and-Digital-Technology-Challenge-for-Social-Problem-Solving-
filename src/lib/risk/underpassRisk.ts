import { UNDERPASS_DATASET } from "@/data/underpasses.generated";
import type { LatLng, RiskCalculationInput, RouteResult, Underpass } from "@/lib/types";
import { haversineMeters } from "@/lib/utils";
import { distanceToRouteMeters } from "./routeDistance";

export const UNDERPASS_MATCH_RADIUS_M = 50;
export const UNDERPASS_NEARBY_RADIUS_M = 500;

export const UNDERPASSES: readonly Underpass[] = UNDERPASS_DATASET.underpasses;

export interface UnderpassCoverage {
  status: "COVERED" | "OUTSIDE_COVERAGE";
  label: string;
  recordCount: number;
  dataDate: string | null;
}

export interface UnderpassRiskContext {
  underpasses?: readonly Underpass[];
  rainfallMmPerHour?: number;
  floodWarningLevel?: RiskCalculationInput["floodWarningLevel"];
}

export interface UnderpassRouteRisk {
  penalty: number;
  rejected: boolean;
  reasons: string[];
  matchedUnderpasses: Underpass[];
}

const isWithinKoreaCoverage = ({ lat, lng }: LatLng) =>
  lat >= 32 && lat <= 39.5 && lng >= 124 && lng <= 132;

export const getUnderpassCoverage = (position: LatLng): UnderpassCoverage => ({
  status: isWithinKoreaCoverage(position) ? "COVERED" : "OUTSIDE_COVERAGE",
  label: UNDERPASS_DATASET.coverage.label,
  recordCount: UNDERPASS_DATASET.count,
  dataDate: UNDERPASS_DATASET.dataDate,
});

export const findUnderpassesOnRoute = (
  route: RouteResult,
  underpasses: readonly Underpass[],
  radiusMeters = UNDERPASS_MATCH_RADIUS_M,
) => {
  if (route.geometry.length === 0) return [];
  const latitudes = route.geometry.map((point) => point.lat);
  const longitudes = route.geometry.map((point) => point.lng);
  const meanLatitude = latitudes.reduce((sum, latitude) => sum + latitude, 0) / latitudes.length;
  const latPadding = radiusMeters / 111_320;
  const lngPadding =
    radiusMeters / (111_320 * Math.max(0.01, Math.cos((meanLatitude * Math.PI) / 180)));
  const minLat = Math.min(...latitudes) - latPadding;
  const maxLat = Math.max(...latitudes) + latPadding;
  const minLng = Math.min(...longitudes) - lngPadding;
  const maxLng = Math.max(...longitudes) + lngPadding;

  return underpasses
    .filter(
      (underpass) =>
        underpass.position.lat >= minLat &&
        underpass.position.lat <= maxLat &&
        underpass.position.lng >= minLng &&
        underpass.position.lng <= maxLng,
    )
    .filter(
      (underpass) => distanceToRouteMeters({ position: underpass.position }, route) <= radiusMeters,
    );
};

export const routePassesUnderpass = (
  route: RouteResult,
  underpasses: readonly Underpass[],
  radiusMeters = UNDERPASS_MATCH_RADIUS_M,
) => findUnderpassesOnRoute(route, underpasses, radiusMeters).length > 0;

export const hasUnderpassNearby = (
  position: LatLng,
  underpasses: readonly Underpass[] = UNDERPASSES,
  radiusMeters = UNDERPASS_NEARBY_RADIUS_M,
) => underpasses.some((underpass) => haversineMeters(position, underpass.position) <= radiusMeters);

const uniqueNames = (underpasses: readonly Underpass[]) =>
  underpasses
    .map((underpass) => underpass.name)
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 2)
    .join("·");

export const assessUnderpassRouteRisk = (
  route: RouteResult,
  underpasses: readonly Underpass[],
  {
    rainfallMmPerHour = 0,
    floodWarningLevel = null,
  }: Omit<UnderpassRiskContext, "underpasses"> = {},
): UnderpassRouteRisk => {
  if (route.mode !== "DRIVE") {
    return { penalty: 0, rejected: false, reasons: [], matchedUnderpasses: [] };
  }

  const matchedUnderpasses = findUnderpassesOnRoute(route, underpasses);
  if (matchedUnderpasses.length === 0) {
    return { penalty: 0, rejected: false, reasons: [], matchedUnderpasses: [] };
  }

  const names = uniqueNames(matchedUnderpasses);
  const rejected = rainfallMmPerHour >= 30 || floodWarningLevel === "CRITICAL";
  const caution = rainfallMmPerHour >= 15 || floodWarningLevel === "WARNING";
  const penalty = rejected || caution ? 30 : 10;
  const condition = rejected
    ? floodWarningLevel === "CRITICAL"
      ? "호우경보 · 진입 제외"
      : `시간당 강우 ${rainfallMmPerHour}mm · 진입 제외`
    : caution
      ? floodWarningLevel === "WARNING"
        ? "호우주의보 · 우회 권고"
        : `시간당 강우 ${rainfallMmPerHour}mm · 우회 권고`
      : "침수 취약구간 주의";

  return {
    penalty,
    rejected,
    reasons: [`${names} 통과 · ${condition}`],
    matchedUnderpasses: [...matchedUnderpasses],
  };
};
