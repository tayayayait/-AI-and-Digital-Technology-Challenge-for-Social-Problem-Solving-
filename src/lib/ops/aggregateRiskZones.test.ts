import { describe, expect, test } from "vitest";

import type { RiskZone, Shelter, TrafficEvent } from "@/lib/types";
import { aggregateRiskZones } from "./aggregateRiskZones";

const zone: RiskZone = {
  id: "grid-busan",
  name: "부산 해운대구 격자 1-1",
  level: "WARNING",
  polygon: [
    [129.16, 35.16],
    [129.17, 35.16],
    [129.17, 35.17],
    [129.16, 35.17],
  ],
  reasons: ["침수흔적 중첩"],
};

const shelter: Shelter = {
  id: "busan-shelter",
  name: "해운대구 문화복합센터",
  address: "부산 해운대구 센텀중앙로 170",
  position: { lat: 35.165, lng: 129.165 },
  capacity: 1200,
  status: "OPERATING",
  underground: false,
  type: "지자체 대피시설",
};

const event = (overrides: Partial<TrafficEvent>): TrafficEvent => ({
  id: "event-1",
  type: "통제",
  eventType: "침수",
  position: { lat: 35.165, lng: 129.165 },
  roadName: "센텀중앙로",
  message: "침수로 전면 통제",
  source: "ITS",
  ...overrides,
});

describe("aggregateRiskZones", () => {
  test("하드코딩 도로 대신 인접한 실제 BLOCKING ITS 도로명만 사용한다", () => {
    const [result] = aggregateRiskZones(
      [zone],
      [shelter],
      [
        event({ id: "blocking-near" }),
        event({ id: "caution-near", roadName: "수영강변대로", eventType: "공사", message: "공사" }),
        event({
          id: "blocking-far",
          roadName: "부산항대교",
          position: { lat: 35.1, lng: 129.07 },
        }),
      ],
    );

    expect(result?.controlRoads).toEqual(["센텀중앙로"]);
    expect(JSON.stringify(result)).not.toMatch(/강남대로|테헤란로|역삼로/);
  });

  test("실제 통제 도로가 없으면 지어낸 도로명을 만들지 않는다", () => {
    const [result] = aggregateRiskZones([zone], [shelter], []);

    expect(result?.controlRoads).toEqual([]);
  });
});
