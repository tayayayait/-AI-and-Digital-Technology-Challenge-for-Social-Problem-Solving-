import { afterEach, describe, expect, it } from "vitest";
import { migratePersistedScenario, toPersistedScenario, useScenario } from "./scenario";

afterEach(() => {
  useScenario.setState({ speechEnabled: false });
});

describe("scenario persistence", () => {
  it("persists only the minimal offline state and lowers user and route coordinates to 3 decimals", () => {
    const persisted = toPersistedScenario({
      origin: { lat: 37.4979123, lng: 127.0276123 },
      locationStatus: "GRANTED",
      riskLevel: "WARNING",
      riskScore: 62,
      speechEnabled: true,
      lastConfirmedAt: "2026-08-31T08:02:00.000Z",
      lastRecommendation: {
        shelter: {
          id: "s-1",
          name: "안전 대피소",
          address: "서울시",
          position: { lat: 37.5012222, lng: 127.0312444 },
          capacity: 100,
          status: "OPERATING",
          underground: false,
          type: "학교",
        },
        route: {
          id: "r-1",
          mode: "WALK",
          status: "RECOMMENDED",
          name: "안전 경로",
          distanceMeters: 800,
          durationSeconds: 600,
          safetyScore: 90,
          riskReasons: [],
          geometry: [
            { lat: 37.4979123, lng: 127.0276123 },
            { lat: 37.5012222, lng: 127.0312444 },
          ],
          shelterId: "s-1",
        },
        actionTitle: "즉시 이동하세요",
        actionBody: "안전 경로만 이용하세요.",
        confirmedAt: "2026-08-31T08:02:00.000Z",
      },
    });

    expect(Object.keys(persisted).sort()).toEqual([
      "lastConfirmedAt",
      "lastRecommendation",
      "locationStatus",
      "origin",
      "riskLevel",
      "riskScore",
      "speechEnabled",
    ]);
    expect(persisted.speechEnabled).toBe(true);
    expect(persisted.origin).toEqual({ lat: 37.498, lng: 127.028 });
    expect(persisted.lastRecommendation?.route?.geometry).toEqual([
      { lat: 37.498, lng: 127.028 },
      { lat: 37.501, lng: 127.031 },
    ]);
  });

  it("기존 저장값은 자동 음성 안내를 끈 상태로 마이그레이션한다", () => {
    expect(migratePersistedScenario({}).speechEnabled).toBe(false);
    expect(migratePersistedScenario({ speechEnabled: "true" }).speechEnabled).toBe(false);
    expect(migratePersistedScenario({ speechEnabled: true }).speechEnabled).toBe(true);
  });

  it("자동 음성 안내는 기본적으로 꺼져 있고 사용자가 명시적으로 켤 수 있다", () => {
    expect(useScenario.getState().speechEnabled).toBe(false);

    useScenario.getState().setSpeechEnabled(true);

    expect(useScenario.getState().speechEnabled).toBe(true);
  });
});
