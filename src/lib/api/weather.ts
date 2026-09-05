import { z } from "zod";

import type { WeatherSnapshot } from "./types";
import { supabase } from "@/integrations/supabase/client";
import type { LatLng } from "@/lib/types";

const weatherAlertSchema = z.object({
  id: z.string().min(1),
  level: z.enum(["WATCH", "WARNING", "CRITICAL"]),
  title: z.string().min(1),
  issuedAt: z.string().min(1),
});

const weatherForecastPointSchema = z.object({
  forecastAt: z.string().min(1),
  rainfallMmPerHour: z.number().nonnegative(),
  temperatureCelsius: z.number().optional(),
  humidityPercent: z.number().min(0).max(100).optional(),
  precipitationProbabilityPercent: z.number().min(0).max(100).optional(),
  precipitationAmount: z.string().optional(),
  precipitationType: z.string().optional(),
});

export const weatherSnapshotSchema = z.object({
  observedAt: z.string().min(1),
  rainfallMmPerHour: z.number().nonnegative(),
  temperatureCelsius: z.number().optional(),
  humidityPercent: z.number().min(0).max(100).optional(),
  precipitationProbabilityPercent: z.number().min(0).max(100).optional(),
  precipitationAmount: z.string().optional(),
  precipitationType: z.string().optional(),
  waterLevelMeters: z.number().nonnegative().optional(),
  alerts: z.array(weatherAlertSchema),
  hourlyForecast: z.array(weatherForecastPointSchema).max(6).default([]),
});

export const parseWeatherSnapshot = (data: unknown): WeatherSnapshot =>
  weatherSnapshotSchema.parse(data);

export interface KmaGrid {
  nx: number;
  ny: number;
}

export interface KmaWeatherRequest extends KmaGrid {
  baseDate: string;
  baseTime: string;
  forecastBaseDate: string;
  forecastBaseTime: string;
}

export type WeatherEdgeFetcher = (request: KmaWeatherRequest) => Promise<unknown>;

const KMA_GRID = {
  re: 6371.00877,
  grid: 5,
  slat1: 30,
  slat2: 60,
  olon: 126,
  olat: 38,
  xo: 43,
  yo: 136,
};

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

export const toKmaGrid = ({ lat, lng }: LatLng): KmaGrid => {
  const re = KMA_GRID.re / KMA_GRID.grid;
  const slat1 = toRad(KMA_GRID.slat1);
  const slat2 = toRad(KMA_GRID.slat2);
  const olon = toRad(KMA_GRID.olon);
  const olat = toRad(KMA_GRID.olat);

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (sf ** sn * Math.cos(slat1)) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / ro ** sn;

  let ra = Math.tan(Math.PI * 0.25 + toRad(lat) * 0.5);
  ra = (re * sf) / ra ** sn;

  let theta = lng === KMA_GRID.olon ? 0 : toRad(lng) - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + KMA_GRID.xo + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + KMA_GRID.yo + 0.5),
  };
};

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

const toKstClock = (date: Date) => new Date(date.getTime() + KST_OFFSET_MS);

const formatKmaBaseDate = (kstClock: Date) =>
  `${kstClock.getUTCFullYear()}${pad(kstClock.getUTCMonth() + 1)}${pad(kstClock.getUTCDate())}`;

export const getKmaNowcastBase = (now: Date = new Date()) => {
  const base = toKstClock(now);
  if (base.getUTCMinutes() < 40) base.setUTCHours(base.getUTCHours() - 1);
  base.setUTCMinutes(0, 0, 0);
  return {
    baseDate: formatKmaBaseDate(base),
    baseTime: `${pad(base.getUTCHours())}00`,
  };
};

export const getKmaUltraForecastBase = (now: Date = new Date()) => {
  const base = toKstClock(now);
  if (base.getUTCMinutes() < 45) base.setUTCHours(base.getUTCHours() - 1);
  base.setUTCMinutes(30, 0, 0);
  return {
    forecastBaseDate: formatKmaBaseDate(base),
    forecastBaseTime: `${pad(base.getUTCHours())}30`,
  };
};

export const buildKmaWeatherRequest = ({
  origin,
  now = new Date(),
}: {
  origin: LatLng;
  now?: Date;
}): KmaWeatherRequest => ({
  ...toKmaGrid(origin),
  ...getKmaNowcastBase(now),
  ...getKmaUltraForecastBase(now),
});

const invokeWeatherEdge: WeatherEdgeFetcher = async (request) => {
  const { data, error } = await supabase.functions.invoke("weather", {
    body: request,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const fetchWeatherSnapshot = async (
  request: KmaWeatherRequest,
  fetcher: WeatherEdgeFetcher = invokeWeatherEdge,
): Promise<WeatherSnapshot> => parseWeatherSnapshot(await fetcher(request));
