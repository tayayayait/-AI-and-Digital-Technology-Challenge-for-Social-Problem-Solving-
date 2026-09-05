import { describe, expect, test } from "vitest";

import {
  buildKmaWeatherRequest,
  getKmaUltraForecastBase,
  parseWeatherSnapshot,
  toKmaGrid,
} from "./weather";

describe("KMA weather request mapping", () => {
  test("converts Seoul coordinates to the official KMA grid cell", () => {
    expect(toKmaGrid({ lat: 37.5665, lng: 126.978 })).toEqual({ nx: 60, ny: 127 });
  });

  test("uses the previous hourly nowcast base time before minute 40", () => {
    expect(
      buildKmaWeatherRequest({
        origin: { lat: 37.5665, lng: 126.978 },
        now: new Date("2026-06-11T00:20:00+09:00"),
      }),
    ).toEqual({
      nx: 60,
      ny: 127,
      baseDate: "20260610",
      baseTime: "2300",
      forecastBaseDate: "20260610",
      forecastBaseTime: "2330",
    });
  });

  test("uses the latest published ultra-short forecast base and handles midnight", () => {
    expect(getKmaUltraForecastBase(new Date("2026-06-11T00:44:00+09:00"))).toEqual({
      forecastBaseDate: "20260610",
      forecastBaseTime: "2330",
    });
    expect(getKmaUltraForecastBase(new Date("2026-06-11T00:45:00+09:00"))).toEqual({
      forecastBaseDate: "20260611",
      forecastBaseTime: "0030",
    });
  });

  test("accepts a six-hour forecast timeline in the weather response", () => {
    const hourlyForecast = Array.from({ length: 6 }, (_, index) => ({
      forecastAt: `2026-06-11T${String(index + 15).padStart(2, "0")}:00:00+09:00`,
      rainfallMmPerHour: index * 2,
      precipitationProbabilityPercent: index * 10,
      precipitationType: index === 0 ? "none" : "rain",
    }));

    expect(
      parseWeatherSnapshot({
        observedAt: "20260611T1400",
        rainfallMmPerHour: 0,
        alerts: [],
        hourlyForecast,
      }).hourlyForecast,
    ).toEqual(hourlyForecast);
  });
});
