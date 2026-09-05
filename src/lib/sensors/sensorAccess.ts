import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { LatLng } from "@/lib/types";

export const sensorFeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  region: z.string().min(1),
  status: z.enum(["DISABLED", "PENDING_ACCESS", "ACTIVE", "FAILED"]),
  source: z.string().min(1),
  lastObservedAt: z.string().nullable(),
  type: z.enum(["WATER_LEVEL", "RAINFALL", "FLOOD_FORECAST"]).optional(),
  position: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  currentLevel: z.number().optional(),
  flowRate: z.number().optional(),
  attentionLevel: z.number().optional(),
  warningLevel: z.number().optional(),
  alarmLevel: z.number().optional(),
  seriousLevel: z.number().optional(),
  plannedFloodLevel: z.number().optional(),
  currentRainfallMmPerHour: z.number().nonnegative().optional(),
  riskLevel: z.enum(["SAFE", "WATCH", "WARNING", "CRITICAL", "UNKNOWN"]).optional(),
  forecastKind: z.string().optional(),
  message: z.string().optional(),
});

export type SensorFeed = z.infer<typeof sensorFeedSchema>;

export const SENSOR_ACCESS_NOTICE =
  "한강홍수통제소 표준수문DB의 수위·강수량·홍수예보발령 자료를 사용자 위치 기준으로 조회합니다.";

export const DEFAULT_SENSOR_FEEDS: SensorFeed[] = [
  {
    id: "hrfco-waterlevel-pending",
    name: "한강홍수통제소 수위",
    provider: "기후에너지환경부 한강홍수통제소",
    region: "전국",
    status: "PENDING_ACCESS",
    source: "HRFCO waterlevel",
    lastObservedAt: null,
    type: "WATER_LEVEL",
  },
  {
    id: "hrfco-rainfall-pending",
    name: "한강홍수통제소 강수량",
    provider: "기후에너지환경부 한강홍수통제소",
    region: "전국",
    status: "PENDING_ACCESS",
    source: "HRFCO rainfall",
    lastObservedAt: null,
    type: "RAINFALL",
  },
  {
    id: "hrfco-fldfct-pending",
    name: "한강홍수통제소 홍수예보발령",
    provider: "기후에너지환경부 한강홍수통제소",
    region: "전국",
    status: "PENDING_ACCESS",
    source: "HRFCO fldfct",
    lastObservedAt: null,
    type: "FLOOD_FORECAST",
  },
];

export const parseSensorFeeds = (data: unknown): SensorFeed[] => {
  const payload =
    typeof data === "object" && data !== null && Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : data;
  return sensorFeedSchema.array().parse(payload);
};

export const fetchSensorFeeds = async (origin?: LatLng): Promise<SensorFeed[]> => {
  try {
    const invokeOptions = origin
      ? {
          method: "POST" as const,
          body: { origin },
        }
      : {
          method: "GET" as const,
        };

    const { data, error } = await supabase.functions.invoke("sensors", invokeOptions);

    if (error) throw new Error(error.message);
    if (data) return parseSensorFeeds(data);
    throw new Error("Invalid sensors response");
  } catch (err) {
    console.warn(
      "Failed to fetch HRFCO sensors from Edge Function. Falling back to pending data.",
      err,
    );
  }

  return DEFAULT_SENSOR_FEEDS;
};

export const canUseRealtimeSensor = (feed: SensorFeed): boolean =>
  feed.status === "ACTIVE" && feed.lastObservedAt != null;
