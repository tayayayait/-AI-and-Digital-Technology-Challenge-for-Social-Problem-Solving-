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
});
