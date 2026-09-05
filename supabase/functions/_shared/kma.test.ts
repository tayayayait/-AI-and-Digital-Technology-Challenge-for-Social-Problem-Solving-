import { describe, expect, test } from "vitest";

import { normalizeKmaWeather, toKmaForecastBase } from "./kma";

describe("KMA Edge weather normalization", () => {
  test("normalizes nowcast and forecast categories into the internal weather model", () => {
    expect(
      normalizeKmaWeather({
        baseDate: "20260611",
        baseTime: "1400",
        nowcastItems: [
          { category: "RN1", obsrValue: "18.5" },
          { category: "PTY", obsrValue: "1" },
          { category: "REH", obsrValue: "91" },
        ],
        forecastItems: [
          { category: "POP", fcstValue: "70" },
          { category: "PCP", fcstValue: "5mm" },
        ],
      }),
    ).toMatchObject({
      observedAt: "20260611T1400",
      rainfallMmPerHour: 18.5,
      humidityPercent: 91,
      precipitationProbabilityPercent: 70,
      precipitationAmount: "5mm",
      precipitationType: "rain",
    });
  });

  test("강수량으로 특보를 만들어내지 않는다", () => {
    // 특보는 기상청이 발령하는 값이다. 예전에는 강수가 있으면 "강수 관측" 경보를
    // 합성해 화면에 특보처럼 노출했는데, 기상청이 낸 적 없는 경보였다.
    // 실제 특보는 weather-warning Edge Function이 getPwnStatus에서 가져온다.
    expect(
      normalizeKmaWeather({
        baseDate: "20260611",
        baseTime: "1400",
        nowcastItems: [
          { category: "RN1", obsrValue: "45" },
          { category: "PTY", obsrValue: "1" },
        ],
        forecastItems: [],
      }).alerts,
    ).toEqual([]);
  });

  test("uses the latest available KMA village forecast base time", () => {
    expect(toKmaForecastBase("20260611", "1400")).toEqual({
      baseDate: "20260611",
      baseTime: "1100",
    });
    expect(toKmaForecastBase("20260611", "0100")).toEqual({
      baseDate: "20260610",
      baseTime: "2300",
    });
  });

  test("groups ultra-short forecast categories into a sorted six-hour timeline", () => {
    const forecastItems = Array.from({ length: 7 }, (_, index) => {
      const fcstTime = `${String(index + 15).padStart(2, "0")}00`;
      return [
        {
          category: "RN1",
          fcstDate: "20260611",
          fcstTime,
          fcstValue: index === 0 ? "강수없음" : String(index * 3),
        },
        {
          category: "POP",
          fcstDate: "20260611",
          fcstTime,
          fcstValue: String(index * 10),
        },
        {
          category: "PTY",
          fcstDate: "20260611",
          fcstTime,
          fcstValue: index === 0 ? "0" : "1",
        },
      ];
    }).flat();

    const weather = normalizeKmaWeather({
      baseDate: "20260611",
      baseTime: "1400",
      nowcastItems: [{ category: "RN1", obsrValue: "0" }],
      forecastItems,
    });

    expect(weather.hourlyForecast).toHaveLength(6);
    expect(weather.hourlyForecast[0]).toEqual({
      forecastAt: "2026-06-11T15:00:00+09:00",
      rainfallMmPerHour: 0,
      precipitationProbabilityPercent: 0,
      precipitationAmount: "강수없음",
      precipitationType: "none",
    });
    expect(weather.hourlyForecast[5]).toMatchObject({
      forecastAt: "2026-06-11T20:00:00+09:00",
      rainfallMmPerHour: 15,
      precipitationProbabilityPercent: 50,
      precipitationType: "rain",
    });
  });
});
