import { describe, expect, test } from "vitest";

import {
  buildRuleBasedAiAnswer,
  explainRouteWithGemini,
  GEMINI_CHAT_TIMEOUT_MS,
  shouldCallGemini,
  type GeminiRouteExplanationInput,
} from "./gemini";

const baseInput: GeminiRouteExplanationInput = {
  question: "지금 나가도 되나요?",
  riskLevel: "WARNING",
  recommendedRouteId: "walk-1",
  recommendedShelterId: "s-01",
  shelterName: "역삼초등학교 체육관",
  routeReasons: ["침수 이력 구간 포함", "지하차도 통과"],
  dataTimestamp: "2026-06-11T08:00:00.000Z",
  allowedProperNouns: ["역삼초등학교 체육관", "침수", "지하차도"],
  mode: "SITUATION_GUIDANCE",
  disasterTypes: ["침수", "호우"],
  selectionKind: "AUTO_RECOMMENDED",
  facts: [
    {
      id: "risk-current",
      kind: "RISK",
      text: "현재 위험도 경계",
      source: "재난·기상 API 종합",
      observedAt: "2026-06-11T08:00:00.000Z",
      status: "LIVE",
    },
    {
      id: "route-risk",
      kind: "UNDERPASS",
      text: "역삼 지하차도 통과",
      source: "경로 분석",
      observedAt: "2026-06-11T08:00:00.000Z",
      status: "LIVE",
    },
  ],
  alternatives: [
    {
      shelterId: "s-02",
      shelterName: "논현초등학교 체육관",
      distanceMeters: 930,
      distanceKind: "STRAIGHT_LINE",
      routeVerified: false,
    },
  ],
};

describe("buildRuleBasedAiAnswer", () => {
  test("keeps the Gemini timeout above observed deployed latency", () => {
    expect(GEMINI_CHAT_TIMEOUT_MS).toBeGreaterThanOrEqual(25_000);
  });

  test("returns question-specific fallback guidance for quick questions", () => {
    const leaveNow = buildRuleBasedAiAnswer({
      ...baseInput,
      mode: "QUESTION",
      question: "지금 나가도 되나요?",
    });
    const familyMessage = buildRuleBasedAiAnswer({
      ...baseInput,
      mode: "QUESTION",
      question: "가족에게 보낼 문구를 만들어주세요.",
    });
    const report = buildRuleBasedAiAnswer({
      ...baseInput,
      mode: "QUESTION",
      question: "담당자에게 신고할 내용을 정리해주세요.",
    });

    expect(leaveNow.reasons.join(" ")).toContain("지금 당장 이동");
    expect(familyMessage.judgementLabel).toBe("가족 공유 문구");
    expect(familyMessage.reasons.join(" ")).toContain("가족에게 공유");
    expect(report.judgementLabel).toBe("신고 내용 정리");
    expect(report.reasons.join(" ")).toContain("신고");
    expect(new Set([leaveNow.reasons[0], familyMessage.reasons[0], report.reasons[0]]).size).toBe(
      3,
    );
  });

  test("returns route-comparison fallback guidance for route explanation questions", () => {
    const answer = buildRuleBasedAiAnswer({
      ...baseInput,
      mode: "QUESTION",
      question: "추천 차량 경로인 NAVER 차량 경로가 선택된 이유를 설명해줘. 안전점수 82점.",
    });

    expect(answer.judgementLabel).toBe("안전 경로 안내");
    expect(answer.reasons.join(" ")).toContain("비교적 안전한 대안 경로");
    expect(answer.reasons.join(" ")).toContain("침수 이력 구간 포함");
    expect(answer.basis).toContain("경로상태");
  });

  test("긴급 단계라도 침수 위험 경로는 이동보다 회피를 우선한다", () => {
    const answer = buildRuleBasedAiAnswer({
      ...baseInput,
      riskLevel: "CRITICAL",
      routeReasons: ["역삼 지하차도 통과 · 침수 위험 · 진입 제외"],
    });

    expect(answer.judgement).toBe("AVOID_ROUTE");
  });

  test("규칙 기반 안내도 구조화된 다섯 단계와 일반 지식 출처를 제공한다", () => {
    const answer = buildRuleBasedAiAnswer(baseInput);

    expect(answer.riskSummary?.evidenceRefs).toContain("risk-current");
    expect(answer.immediateActions?.length).toBeGreaterThan(0);
    expect(answer.disasterActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: "GENERAL_KNOWLEDGE",
          evidenceRefs: [],
        }),
      ]),
    );
    expect(answer.movementWarnings?.length).toBeGreaterThan(0);
    expect(answer.alternativeShelterReasons?.[0]?.shelterId).toBe("s-02");
  });

  test("호출에 실패해도 홈의 핵심 제목은 행동을 직접 안내한다", () => {
    const answer = buildRuleBasedAiAnswer({
      ...baseInput,
      question: "대피소 추천과 경로를 알려줘",
    });
    expect(answer.judgementLabel).toBe("위험 경로 회피");
    expect(answer.reasons.join(" ")).not.toContain("비교적 안전");
  });

  test("검증된 구조와 유효한 근거 ID를 가진 응답을 사용한다", async () => {
    const response = {
      ...buildRuleBasedAiAnswer(baseInput),
      riskSummary: {
        text: "침수 위험 근거가 있습니다.",
        sourceKind: "LIVE_DATA",
        evidenceRefs: ["risk-current"],
      },
      recommendedShelterReason: {
        text: "출발 전 대피시설의 운영 여부를 확인하세요.",
        sourceKind: "GENERAL_KNOWLEDGE",
        evidenceRefs: [],
      },
    };
    const answer = await explainRouteWithGemini(
      {
        ...baseInput,
        allowedProperNouns: [...baseInput.allowedProperNouns, "역삼 지하차도"],
      },
      async () => response,
    );
    expect(answer.verified).toBe(true);
  });

  test("구버전 서버가 검증 완료로 표시해도 구조화된 안내가 없으면 사용하지 않는다", async () => {
    const answer = await explainRouteWithGemini(baseInput, async () => ({
      judgement: "WAIT",
      reasons: ["현재 위치에서 대기하세요."],
      basis: [],
      timestamp: baseInput.dataTimestamp,
      verified: true,
    }));

    expect(answer.verified).toBe(false);
    expect(answer.judgement).toBe("AVOID_ROUTE");
    expect(answer.riskSummary?.evidenceRefs).toContain("risk-current");
  });

  test("일반 지식에 현재 거리 수치를 만들어 넣은 응답은 사용하지 않는다", async () => {
    const response = {
      ...buildRuleBasedAiAnswer(baseInput),
      recommendedShelterReason: {
        text: "현재 대피소는 600m 거리입니다.",
        sourceKind: "GENERAL_KNOWLEDGE",
        evidenceRefs: [],
      },
    };
    expect((await explainRouteWithGemini(baseInput, async () => response)).verified).toBe(false);
  });

  test("유효한 ID를 붙여도 근거에 없는 거리 수치는 사용하지 않는다", async () => {
    const response = {
      ...buildRuleBasedAiAnswer(baseInput),
      recommendedShelterReason: {
        text: "현재 대피소는 999m 거리입니다.",
        sourceKind: "LIVE_DATA",
        evidenceRefs: ["risk-current"],
      },
    };
    expect(
      (
        await explainRouteWithGemini(
          {
            ...baseInput,
            allowedProperNouns: [...baseInput.allowedProperNouns, "역삼 지하차도"],
          },
          async () => response,
        )
      ).verified,
    ).toBe(false);
  });

  test("알 수 없는 실시간 근거 ID를 인용한 Gemini 응답은 사용하지 않는다", async () => {
    const answer = await explainRouteWithGemini(baseInput, async () => ({
      judgement: "AVOID_ROUTE",
      reasons: ["통제 구간을 피하세요."],
      basis: ["unknown-fact"],
      riskSummary: {
        text: "현재 침수 위험이 높습니다.",
        sourceKind: "LIVE_DATA",
        evidenceRefs: ["unknown-fact"],
      },
      immediateActions: [
        {
          text: "즉시 우회하세요.",
          sourceKind: "LIVE_DATA",
          evidenceRefs: ["unknown-fact"],
        },
      ],
      disasterActions: [],
      recommendedShelterReason: {
        text: "추천 대피소로 이동하세요.",
        sourceKind: "LIVE_DATA",
        evidenceRefs: ["unknown-fact"],
      },
      movementWarnings: [],
      alternativeShelterReasons: [],
    }));

    expect(answer.verified).toBe(false);
    expect(answer.riskSummary?.evidenceRefs).toContain("risk-current");
  });

  test("입력에 없는 대체 대피소 ID를 만든 Gemini 응답은 사용하지 않는다", async () => {
    const answer = await explainRouteWithGemini(baseInput, async () => ({
      judgement: "AVOID_ROUTE",
      reasons: ["지하차도를 피하세요."],
      basis: ["route-risk"],
      riskSummary: {
        text: "현재 경계 단계입니다.",
        sourceKind: "LIVE_DATA",
        evidenceRefs: ["risk-current"],
      },
      immediateActions: [
        {
          text: "지하차도를 피해 이동하세요.",
          sourceKind: "LIVE_DATA",
          evidenceRefs: ["route-risk"],
        },
      ],
      disasterActions: [],
      recommendedShelterReason: {
        text: "현재 추천 경로를 확인하세요.",
        sourceKind: "LIVE_DATA",
        evidenceRefs: ["route-risk"],
      },
      movementWarnings: [],
      alternativeShelterReasons: [
        {
          shelterId: "hallucinated-shelter",
          reason: {
            text: "대체 후보입니다.",
            sourceKind: "GENERAL_KNOWLEDGE",
            evidenceRefs: [],
          },
        },
      ],
    }));

    expect(answer.verified).toBe(false);
    expect(answer.alternativeShelterReasons?.[0]?.shelterId).toBe("s-02");
  });

  test("경로가 없어도 현재 사실 근거가 있으면 Gemini 보완 분석을 허용한다", () => {
    expect(
      shouldCallGemini({
        ...baseInput,
        recommendedRouteId: undefined,
        recommendedShelterId: undefined,
        shelterName: "확인 가능한 대피소 없음",
      }),
    ).toBe(true);
  });

  test("확인된 경로가 없으면 기본 안내가 즉시 이동을 지시하지 않는다", () => {
    const answer = buildRuleBasedAiAnswer({
      ...baseInput,
      riskLevel: "CRITICAL",
      recommendedRouteId: undefined,
      routeReasons: [],
    });
    expect(answer.judgement).toBe("CHECK_OFFICIAL_NOTICE");
  });

  test("지연 데이터의 낮은 위험도를 대피 불필요로 단정하지 않는다", () => {
    const answer = buildRuleBasedAiAnswer({
      ...baseInput,
      riskLevel: "SAFE",
      routeReasons: [],
      facts: baseInput.facts?.map((fact) => ({ ...fact, status: "FALLBACK" })),
    });
    expect(answer.judgement).toBe("CHECK_OFFICIAL_NOTICE");
  });
});
