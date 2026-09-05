export interface KmaItem {
  category?: string;
  obsrValue?: string;
  fcstValue?: string;
}

export interface NormalizeKmaWeatherInput {
  baseDate: string;
  baseTime: string;
  nowcastItems: KmaItem[];
  forecastItems: KmaItem[];
}

const FORECAST_BASE_TIMES = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];

const valueByCategory = (items: KmaItem[], category: string) =>
  items.find((item) => item.category === category)?.obsrValue ??
  items.find((item) => item.category === category)?.fcstValue;

const asNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const precipitationType = (value: unknown) => {
  switch (String(value ?? "0")) {
    case "1":
      return "rain";
    case "2":
      return "rain-snow";
    case "3":
      return "snow";
    case "4":
      return "shower";
    case "5":
      return "drizzle";
    case "6":
      return "sleet";
    case "7":
      return "flurry";
    default:
      return "none";
  }
};

const previousDate = (baseDate: string) => {
  const year = Number(baseDate.slice(0, 4));
  const month = Number(baseDate.slice(4, 6));
  const day = Number(baseDate.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
};

export const toKmaForecastBase = (baseDate: string, baseTime: string) => {
  const latest = [...FORECAST_BASE_TIMES].reverse().find((time) => time < baseTime);
  if (latest) return { baseDate, baseTime: latest };
  return { baseDate: previousDate(baseDate), baseTime: "2300" };
};

export const normalizeKmaWeather = ({
  baseDate,
  baseTime,
  nowcastItems,
  forecastItems,
}: NormalizeKmaWeatherInput) => {
  const rainfallMmPerHour = asNumber(valueByCategory(nowcastItems, "RN1")) ?? 0;
  const humidityPercent =
    asNumber(valueByCategory(nowcastItems, "REH")) ??
    asNumber(valueByCategory(forecastItems, "REH"));
  const precipitationProbabilityPercent = asNumber(valueByCategory(forecastItems, "POP"));
  const precipitationAmount = valueByCategory(forecastItems, "PCP");
  const precipitation = precipitationType(valueByCategory(nowcastItems, "PTY"));

  return {
    observedAt: `${baseDate}T${baseTime}`,
    temperatureCelsius:
      asNumber(valueByCategory(nowcastItems, "T1H")) ??
      asNumber(valueByCategory(forecastItems, "T1H")),
    rainfallMmPerHour,
    humidityPercent,
    precipitationProbabilityPercent,
    precipitationAmount,
    precipitationType: precipitation,
    waterLevelMeters: undefined,
    // 특보는 기상청이 발령하는 것이지 강수량에서 유도할 수 있는 값이 아니다.
    // 예전에는 여기서 강수 유무로 "강수 관측" 경보를 만들어 냈는데, 기상청이 낸 적
    // 없는 특보를 사용자에게 보여주는 문제가 있었고 위험도 계산에서도 강우 점수와
    // 순환 참조가 됐다. 실제 특보는 weather-warning Edge Function이 따로 가져온다.
    alerts: [],
  };
};
