import { describe, expect, test } from "vitest";

import type { WeatherForecastPoint } from "@/lib/api/types";
import type { RiskCalculationInput } from "@/lib/types";
import { buildRiskOutlook } from "./forecastRisk";

const baseInput: RiskCalculationInput = {
  weather: { rainfallMmPerHour: 0 },
  floodTrace: false,
  riverFlood: false,
  disasterMessages: [],
  hasUnderpass: false,
  trafficControl: false,
  failedDataCount: 0,
};

const point = (hour: number, rainfallMmPerHour: number): WeatherForecastPoint => ({
  forecastAt: `2026-06-11T${String(hour).padStart(2, "0")}:00:00+09:00`,
  rainfallMmPerHour,
  precipitationProbabilityPercent: rainfallMmPerHour > 0 ? 80 : 10,
  precipitationType: rainfallMmPerHour > 0 ? "rain" : "none",
});

describe("buildRiskOutlook", () => {
  test("calculates each forecast hour without changing the current assessment", () => {
    const outlook = buildRiskOutlook({
      forecast: [point(15, 0), point(16, 30)],
      baseInput,
    });

    expect(outlook).toEqual([
      expect.objectContaining({
        forecastAt: "2026-06-11T15:00:00+09:00",
        riskScore: 0,
        riskLevel: "SAFE",
      }),
      expect.objectContaining({
        forecastAt: "2026-06-11T16:00:00+09:00",
        riskScore: 30,
        riskLevel: "WATCH",
      }),
    ]);
  });

  test("combines forecast rain with the current non-weather hazards and limits output to six hours", () => {
    const outlook = buildRiskOutlook({
      forecast: Array.from({ length: 7 }, (_, index) => point(15 + index, 30)),
      baseInput: {
        ...baseInput,
        disasterMessages: [{ region: "서울", body: "침수 위험지역 대피 안내" }],
        hasUnderpass: true,
      },
    });

    expect(outlook).toHaveLength(6);
    expect(outlook[0]).toMatchObject({
      riskScore: 50,
      riskLevel: "WARNING",
      reasons: expect.arrayContaining(["재난문자 위험지역", "현재 위치 주변 지하차도"]),
    });
  });
});
