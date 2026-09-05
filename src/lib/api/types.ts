export type ApiStatus = "OK" | "STALE" | "FAILED" | "FALLBACK";

export interface ApiResult<T> {
  data: T | null;
  status: ApiStatus;
  timestamp: string;
  source: string;
  error?: string;
}

export interface DisasterMessage {
  id: string;
  region: string;
  body: string;
  issuedAt: string;
  source: string;
  emergencyLevel?: string;
  disasterType?: string;
  registeredDate?: string;
  modifiedDate?: string;
}

export interface WeatherAlert {
  id: string;
  level: "WATCH" | "WARNING" | "CRITICAL";
  title: string;
  issuedAt: string;
}

export interface WeatherForecastPoint {
  forecastAt: string;
  rainfallMmPerHour: number;
  temperatureCelsius?: number;
  humidityPercent?: number;
  precipitationProbabilityPercent?: number;
  precipitationAmount?: string;
  precipitationType?: string;
}

export interface WeatherSnapshot {
  observedAt: string;
  rainfallMmPerHour: number;
  temperatureCelsius?: number;
  humidityPercent?: number;
  precipitationProbabilityPercent?: number;
  precipitationAmount?: string;
  precipitationType?: string;
  waterLevelMeters?: number;
  alerts: WeatherAlert[];
  hourlyForecast: WeatherForecastPoint[];
}
