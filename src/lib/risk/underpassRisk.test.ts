import { describe, expect, test } from "vitest";

import {
  UNDERPASS_MATCH_RADIUS_M,
  assessUnderpassRouteRisk,
  getUnderpassCoverage,
  hasUnderpassNearby,
  routePassesUnderpass,
} from "./underpassRisk";
import type { RouteResult, Underpass } from "@/lib/types";

const route = (mode: RouteResult["mode"] = "DRIVE"): RouteResult => ({
  id: `route-${mode}`,
  mode,
  status: "RECOMMENDED",
  name: "테스트 경로",
  distanceMeters: 1_200,
  durationSeconds: 600,
  safetyScore: 90,
  riskReasons: [],
  shelterId: "s-1",
  geometry: [
    { lat: 37.5, lng: 127.03 },
    { lat: 37.5, lng: 127.04 },
  ],
});

const underpass = (lat: number): Underpass => ({
  id: `u-${lat}`,
  name: "테스트지하차도",
  position: { lat, lng: 127.035 },
  startPosition: { lat, lng: 127.034 },
  endPosition: { lat, lng: 127.036 },
  region: "서울특별시 강남구",
  source: "국토교통부 전국도로터널정보표준데이터",
  sourceUpdatedAt: "2025-12-31",
});

describe("underpass route matching", () => {
  test("matches within 50m and excludes a point outside the radius", () => {
    expect(routePassesUnderpass(route(), [underpass(37.5004)])).toBe(true);
    expect(routePassesUnderpass(route(), [underpass(37.5006)])).toBe(false);
    expect(UNDERPASS_MATCH_RADIUS_M).toBe(50);
  });

  test("detects an underpass within 500m of the current location", () => {
    expect(hasUnderpassNearby({ lat: 37.5, lng: 127.03 }, [underpass(37.5004)])).toBe(true);
    expect(hasUnderpassNearby({ lat: 37.49, lng: 127.03 }, [underpass(37.5004)])).toBe(false);
  });

  test("marks locations outside the nationwide source boundary as uncovered", () => {
    expect(getUnderpassCoverage({ lat: 35.1, lng: 129.1 }).status).toBe("COVERED");
    expect(getUnderpassCoverage({ lat: 0, lng: 0 }).status).toBe("OUTSIDE_COVERAGE");
  });
});

describe("underpass rainfall policy", () => {
  test.each([
    [14.9, null, 10, false],
    [15, null, 30, false],
    [29.9, "WARNING", 30, false],
    [30, null, 30, true],
    [0, "CRITICAL", 30, true],
  ] as const)(
    "rain=%s warning=%s => penalty=%s rejected=%s",
    (rainfallMmPerHour, floodWarningLevel, penalty, rejected) => {
      const result = assessUnderpassRouteRisk(route(), [underpass(37.5)], {
        rainfallMmPerHour,
        floodWarningLevel,
      });

      expect(result.penalty).toBe(penalty);
      expect(result.rejected).toBe(rejected);
    },
  );

  test("does not apply the vehicle underpass rule to walking routes", () => {
    expect(
      assessUnderpassRouteRisk(route("WALK"), [underpass(37.5)], {
        rainfallMmPerHour: 50,
        floodWarningLevel: "CRITICAL",
      }),
    ).toEqual({ penalty: 0, rejected: false, reasons: [], matchedUnderpasses: [] });
  });
});
