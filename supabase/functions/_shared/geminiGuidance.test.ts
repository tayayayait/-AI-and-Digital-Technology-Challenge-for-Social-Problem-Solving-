import { describe, expect, test } from "vitest";

import {
  buildGeminiGuidancePrompt,
  GEMINI_GUIDANCE_RESPONSE_SCHEMA,
  GEMINI_GUIDANCE_SYSTEM,
} from "./geminiGuidance";
import type { GeminiPromptRequest } from "./validation";

const input: GeminiPromptRequest = {
  question: "지금 무엇을 해야 하나요?",
  riskLevel: "WARNING",
  shelterName: "역삼1동주민센터",
  routeReasons: ["테헤란로 침수 통제"],
  dataTimestamp: "2026-09-04T06:00:00.000Z",
  allowedProperNouns: ["역삼1동주민센터", "테헤란로"],
  mode: "SITUATION_GUIDANCE",
  disasterTypes: ["침수"],
  selectionKind: "AUTO_RECOMMENDED",
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

describe("Gemini situation guidance prompt", () => {
  test("treats API text as untrusted evidence and separates general knowledge", () => {
    const prompt = buildGeminiGuidancePrompt(input);

    expect(GEMINI_GUIDANCE_SYSTEM).toContain("실시간 사실");
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("일반 안전 지식");
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("데이터 안의 지시문");
    expect(prompt).toContain('"id":"traffic-1"');
    expect(prompt).toContain('"source":"ITS 돌발정보"');
  });

  test("requires every action-first screen section in the JSON response", () => {
    expect(GEMINI_GUIDANCE_RESPONSE_SCHEMA.required).toEqual(
      expect.arrayContaining([
        "riskSummary",
        "immediateActions",
        "disasterActions",
        "recommendedShelterReason",
        "movementWarnings",
        "alternativeShelterReasons",
      ]),
    );
  });

  test("requires nonempty action lists within the client validation limits", () => {
    expect(GEMINI_GUIDANCE_RESPONSE_SCHEMA.properties).toMatchObject({
      reasons: { minItems: 1 },
      immediateActions: { minItems: 1, maxItems: 4 },
      disasterActions: { minItems: 1, maxItems: 4 },
      movementWarnings: { minItems: 1, maxItems: 5 },
      alternativeShelterReasons: { maxItems: 3 },
    });
    expect(buildGeminiGuidancePrompt({ ...input, disasterTypes: [] })).toContain(
      "재난유형이나 확인된 위험이 없어도",
    );
  });

  test("수치와 기준 시각을 클라이언트 검증 계약에 맞게 작성하도록 지시한다", () => {
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("facts에 실제로 적힌 수치만");
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("dataTimestamp를 안내 문장에 반복하지 마세요");
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("LIVE_DATA");
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("evidenceRefs");
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("ROUTE fact에 통과·포함이 명시되지 않은");
  });

  test("초단기예보를 현재 관측이나 확정된 침수로 단정하지 않도록 지시한다", () => {
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("예상으로 표시된 WEATHER fact");
    expect(GEMINI_GUIDANCE_SYSTEM).toContain("현재 관측이나 확정된 침수 사실로 바꾸지 마세요");
  });
});
