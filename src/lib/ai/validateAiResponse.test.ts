import { describe, expect, test } from "vitest";

import type { AiAnswer, SafetyFact } from "@/lib/types";
import { validateAiResponse } from "./validateAiResponse";

const fallback: AiAnswer = {
  judgement: "CHECK_OFFICIAL_NOTICE",
  judgementLabel: "공식 안내 확인",
  reasons: ["규칙 기반 안내"],
  basis: ["규칙"],
  timestamp: "2026-09-05T05:27:44.000Z",
  verified: false,
};

const validate = (text: string, fact: SafetyFact) =>
  validateAiResponse({
    data: {
      judgement: "CHECK_OFFICIAL_NOTICE",
      reasons: [text],
      basis: [fact.id],
      riskSummary: {
        text,
        sourceKind: "LIVE_DATA",
        evidenceRefs: [fact.id],
      },
    },
    fallback,
    timestamp: fallback.timestamp,
    allowedTerms: [],
    factIds: [fact.id],
    facts: [fact],
  });

describe("validateAiResponse measurements", () => {
  test("시각의 분 표기를 이동시간 측정값으로 오인하지 않는다", () => {
    const result = validate("2026년 9월 5일 05시 27분 44초 기준 위험 점수는 5점입니다.", {
      id: "risk-current",
      kind: "RISK",
      text: "현재 위험 점수 5점",
      source: "재난·기상·지도 API 종합",
      observedAt: "2026-09-05T05:27:44.000Z",
      status: "LIVE",
    });

    expect(result.verified).toBe(true);
  });

  test("근거 수치를 표시 자릿수에 맞게 반올림한 표현을 허용한다", () => {
    const result = validate("현재 위치에서 직선거리 155.8m입니다.", {
      id: "shelter-s-01",
      kind: "SHELTER",
      text: "현재 위치 기준 직선거리 155.84m",
      source: "대피소 API · 좌표 간 거리 계산",
      observedAt: "2026-09-05T05:27:44.000Z",
      status: "LIVE",
    });

    expect(result.verified).toBe(true);
  });

  test("근거와 다른 거리 수치는 계속 차단한다", () => {
    const result = validate("현재 위치에서 직선거리 600m입니다.", {
      id: "shelter-s-01",
      kind: "SHELTER",
      text: "현재 위치 기준 직선거리 155.84m",
      source: "대피소 API · 좌표 간 거리 계산",
      observedAt: "2026-09-05T05:27:44.000Z",
      status: "LIVE",
    });

    expect(result.verified).toBe(false);
  });
});
