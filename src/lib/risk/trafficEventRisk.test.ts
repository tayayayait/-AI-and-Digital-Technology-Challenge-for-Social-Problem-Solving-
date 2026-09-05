import { describe, expect, test } from "vitest";

import type { TrafficEvent } from "@/lib/types";
import { hasBlockingEventNearby, TRAFFIC_CONTROL_RADIUS_M } from "./trafficEventRisk";

const origin = { lat: 37.4979, lng: 127.0276 };

const event = (overrides: Partial<TrafficEvent> = {}): TrafficEvent => ({
  id: "event-1",
  type: "incident",
  eventType: "돌발",
  eventDetailType: "침수",
  position: origin,
  roadName: "강남대로",
  message: "전면 통제중",
  source: "ITS",
  ...overrides,
});

describe("hasBlockingEventNearby", () => {
  test("반경 1km 안의 통행 차단급 이벤트를 감지한다", () => {
    expect(hasBlockingEventNearby([event()], origin)).toBe(true);
    expect(TRAFFIC_CONTROL_RADIUS_M).toBe(1_000);
  });

  test("반경 안이라도 주의 이벤트만 있으면 false를 반환한다", () => {
    expect(
      hasBlockingEventNearby(
        [
          event({
            eventType: "교통",
            eventDetailType: "공사",
            message: "서행하세요",
          }),
        ],
        origin,
      ),
    ).toBe(false);
  });

  test("반경 밖의 통행 차단급 이벤트를 제외한다", () => {
    expect(
      hasBlockingEventNearby(
        [event({ position: { lat: origin.lat + 0.02, lng: origin.lng } })],
        origin,
      ),
    ).toBe(false);
  });

  test("빈 배열과 유효하지 않은 좌표를 안전하게 제외한다", () => {
    expect(hasBlockingEventNearby([], origin)).toBe(false);
    expect(
      hasBlockingEventNearby([event({ position: { lat: Number.NaN, lng: Number.NaN } })], origin),
    ).toBe(false);
  });
});
