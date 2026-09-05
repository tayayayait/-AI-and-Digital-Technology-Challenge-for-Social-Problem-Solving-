import { describe, expect, test } from "vitest";

import type { GeminiRouteExplanationInput } from "@/lib/api/gemini";
import { aiAdviceQueryKey } from "./useAiAdvice";

const input: GeminiRouteExplanationInput = {
  question: "현재 상황을 설명해줘.",
  riskLevel: "WARNING",
  shelterName: "역삼1동주민센터",
  routeReasons: ["침수 통제 구간 회피"],
  dataTimestamp: "2026-09-04T06:00:00.000Z",
  allowedProperNouns: ["역삼1동주민센터"],
  mode: "SITUATION_GUIDANCE",
  disasterTypes: ["침수"],
  facts: [
    {
      id: "traffic-1",
      kind: "TRAFFIC",
      text: "테헤란로 침수 통제",
      source: "ITS 돌발정보",
      observedAt: "2026-09-04T06:00:00.000Z",
      status: "LIVE",
    },
  ],
  alternatives: [],
};

describe("aiAdviceQueryKey", () => {
  test("실시간 근거 내용이나 기준시각이 바뀌면 캐시 키도 바뀐다", () => {
    const changedFact = {
      ...input,
      facts: input.facts?.map((fact) => ({ ...fact, text: "테헤란로 통제 해제" })),
    };
    const changedTimestamp = {
      ...input,
      dataTimestamp: "2026-09-04T06:05:00.000Z",
    };

    expect(aiAdviceQueryKey(input)).not.toEqual(aiAdviceQueryKey(changedFact));
    expect(aiAdviceQueryKey(input)).not.toEqual(aiAdviceQueryKey(changedTimestamp));
  });
});
