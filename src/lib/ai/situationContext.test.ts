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
});
