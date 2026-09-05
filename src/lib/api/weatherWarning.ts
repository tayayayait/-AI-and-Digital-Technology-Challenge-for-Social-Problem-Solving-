import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

export const WEATHER_WARNING_SOURCE = "kma-weather-warning";

const warningLevelSchema = z.enum(["WATCH", "WARNING", "CRITICAL"]);

const parsedWarningSchema = z.object({
  phenomenon: z.string(),
  grade: z.string(),
  level: warningLevelSchema,
  wide: z.string(),
  zones: z.array(z.string()),
  floodRelevant: z.boolean(),
});

const warningAlertSchema = z.object({
  id: z.string().min(1),
  level: warningLevelSchema,
  title: z.string().min(1),
  issuedAt: z.string(),
  zone: z.string().optional(),
  floodRelevant: z.boolean().optional(),
});

export const weatherWarningResponseSchema = z.object({
  warnings: z.array(parsedWarningSchema).default([]),
  alerts: z.array(warningAlertSchema).default([]),
  floodLevel: warningLevelSchema.nullable().default(null),
  announcedAt: z.string().nullable().default(null),
  nationwideCount: z.number().default(0),
  status: z.enum(["OK", "PENDING_ACCESS"]).default("OK"),
  message: z.string().optional(),
});

export type WeatherWarningResponse = z.infer<typeof weatherWarningResponseSchema>;
export type WeatherWarningAlert = z.infer<typeof warningAlertSchema>;

export const EMPTY_WARNING_RESPONSE: WeatherWarningResponse = {
  warnings: [],
  alerts: [],
  floodLevel: null,
  announcedAt: null,
  nationwideCount: 0,
  status: "OK",
};

export type WeatherWarningFetcher = (region: string) => Promise<unknown>;

const invokeWeatherWarning: WeatherWarningFetcher = async (region) => {
  const { data, error } = await supabase.functions.invoke("weather-warning", {
    body: { region },
  });
  if (error) throw error;
  return data;
};

export const fetchWeatherWarnings = async (
  region: string,
  client: WeatherWarningFetcher = invokeWeatherWarning,
): Promise<WeatherWarningResponse> => weatherWarningResponseSchema.parse(await client(region));
