import { describe, expect, test } from "vitest";
import { buildSituationFacts, safetyFactStatus } from "./situationContext";

describe("situation facts", () => {
  test("시각 미확인·실패·오프라인 근거는 실시간으로 간주하지 않는다", () => {
    expect(safetyFactStatus("OK", null, true)).toBe("DELAYED");
    expect(safetyFactStatus("FALLBACK", new Date().toISOString(), true)).toBe("FALLBACK");
    expect(safetyFactStatus("OK", new Date().toISOString(), false)).toBe("FALLBACK");
    expect(safetyFactStatus("OK", new Date().toISOString(), true)).toBe("LIVE");
  });

  test("누락 데이터와 실제 경로가 없는 후보의 한계를 사실에 명시한다", () => {
    const facts = buildSituationFacts({
      assessment: {
        total: 0,
        missingDataCount: 2,
        reasons: ["필수 데이터 실패"],
        dataSources: [],
      } as unknown as Parameters<typeof buildSituationFacts>[0]["assessment"],
      riskLevel: "SAFE",
      timestamp: null,
      online: true,
      alternatives: [
        {
          shelterId: "s-02",
          shelterName: "대체시설",
          distanceMeters: 900,
          distanceKind: "STRAIGHT_LINE",
          routeVerified: false,
        },
      ],
    });
    expect(facts[0].status).toBe("FALLBACK");
    expect(facts[0].text).toContain("안전 보장으로 해석하지 말 것");
    expect(facts.find((fact) => fact.id === "alternative-s-02")?.text).toContain(
      "실제 경로 미확인",
    );
    expect(facts.every((fact) => fact.text.length <= 320)).toBe(true);
  });

  test("추천 대피소의 직선거리를 Gemini가 인용할 수 있는 사실에 포함한다", () => {
    const facts = buildSituationFacts({
      assessment: {
        total: 5,
        missingDataCount: 0,
        reasons: [],
        dataSources: [],
      } as unknown as Parameters<typeof buildSituationFacts>[0]["assessment"],
      riskLevel: "SAFE",
      timestamp: "2026-09-05T05:27:44.000Z",
      online: true,
      shelter: {
        id: "s-01",
        name: "삼구트리니엔(104동)",
        address: "경상북도 구미시 옥계북로 33",
        status: "CHECK_REQUIRED",
        underground: false,
      } as Parameters<typeof buildSituationFacts>[0]["shelter"],
      shelterDistanceMeters: 155.84,
      shelterDistanceKind: "STRAIGHT_LINE",
      alternatives: [],
    });

    expect(facts.find((fact) => fact.id === "shelter-s-01")?.text).toContain(
      "현재 위치 기준 직선거리 156m",
    );
  });
});
