import { beforeEach, describe, expect, test, vi } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import { fetchSensorFeeds, type SensorFeed } from "./sensorAccess";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const sensor: SensorFeed = {
  id: "sensor-1",
  name: "구미 수위 관측소",
  provider: "한강홍수통제소",
  region: "경상북도 구미시",
  status: "ACTIVE",
  source: "HRFCO waterlevel",
  lastObservedAt: "2026-09-03T04:00:00.000Z",
  type: "WATER_LEVEL",
  position: { lat: 36.1195, lng: 128.3446 },
  currentLevel: 1.2,
};

describe("fetchSensorFeeds", () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  test("durationMs가 추가된 Edge 배열 응답을 파싱한다", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { data: [sensor], durationMs: 18 },
      error: null,
    });

    await expect(fetchSensorFeeds({ lat: 36.1195, lng: 128.3446 })).resolves.toEqual([sensor]);
  });
});
