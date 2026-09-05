import { z } from "zod";

import type { AiAnswer, AiGuidanceItem, SafetyFact } from "@/lib/types";

export const ALLOWED_AI_ACTIONS = [
  "WAIT",
  "WALK_TO_SHELTER",
  "DRIVE_TO_SAFE_ZONE",
  "AVOID_ROUTE",
  "CALL_119",
  "CHECK_OFFICIAL_NOTICE",
] as const;

export const ACTION_LABEL: Record<(typeof ALLOWED_AI_ACTIONS)[number], string> = {
  WAIT: "현재 위치에서 대기",
  WALK_TO_SHELTER: "도보로 대피소 이동",
  DRIVE_TO_SAFE_ZONE: "차량으로 안전지대 이동",
  AVOID_ROUTE: "위험 경로 회피",
  CALL_119: "119 신고",
  CHECK_OFFICIAL_NOTICE: "공식 안내 확인",
};

const guidanceItemSchema = z.object({
  text: z.string().min(1).max(320),
  sourceKind: z.enum(["LIVE_DATA", "GENERAL_KNOWLEDGE"]),
  evidenceRefs: z.array(z.string().min(1).max(100)).max(8),
});

const alternativeShelterReasonSchema = z.object({
  shelterId: z.string().min(1).max(100),
  reason: guidanceItemSchema,
});

const aiAnswerSchema = z.object({
  judgement: z.enum(ALLOWED_AI_ACTIONS),
  judgementLabel: z.string().optional(),
  reasons: z.array(z.string()).min(1),
  basis: z.array(z.string()).optional().default([]),
  timestamp: z.string().optional(),
  verified: z.boolean().optional(),
  riskSummary: guidanceItemSchema.optional(),
  immediateActions: z.array(guidanceItemSchema).max(4).optional(),
  disasterActions: z.array(guidanceItemSchema).max(4).optional(),
  recommendedShelterReason: guidanceItemSchema.optional(),
  movementWarnings: z.array(guidanceItemSchema).max(5).optional(),
  alternativeShelterReasons: z.array(alternativeShelterReasonSchema).max(3).optional(),
});

const PROPER_NOUN_PATTERN =
  /[가-힣A-Za-z0-9]+(?:초등학교|중학교|고등학교|주민센터|구민회관|병원|대피소|지하차도)/g;
const COMMON_ALLOWED_TERMS = ["안전", "경로", "위험", "침수", "범람", "통제", "대피", "이동"];

const containsUnknownProperNoun = (text: string, allowedTerms: string[]) => {
  const matches = text.match(PROPER_NOUN_PATTERN) ?? [];
  const allowList = [...allowedTerms, ...COMMON_ALLOWED_TERMS].map((term) =>
    term.replace(/\s+/g, ""),
  );

  return matches.some((match) => {
    const normalizedMatch = match.replace(/\s+/g, "");
    const isAllowed = allowList.some((term) => {
      const coreNoun = normalizedMatch.replace(
        /(초등학교|중학교|고등학교|주민센터|구민회관|병원|대피소|지하차도)$/,
        "",
      );
      return term.includes(normalizedMatch) || (coreNoun.length >= 2 && term.includes(coreNoun));
    });
    return !isAllowed;
  });
};

const CURRENT_MEASUREMENT_PATTERN = /(\d+(?:\.\d+)?)\s*(mm|cm|km|m|℃|점|%|분|시간당|단계)/i;

interface ParsedMeasurement {
  value: number;
  unit: string;
  decimals: number;
}

const measurements = (text: string): ParsedMeasurement[] =>
  [...text.matchAll(new RegExp(CURRENT_MEASUREMENT_PATTERN.source, "gi"))].flatMap((match) => {
    const numberText = match[1];
    const unit = match[2].toLowerCase();
    const matchIndex = match.index ?? 0;
    const prefix = text.slice(Math.max(0, matchIndex - 8), matchIndex);

    // "05시 27분"의 27분은 이동 소요시간이 아니라 기준 시각이다.
    if (unit === "분" && /\d{1,2}\s*시\s*$/.test(prefix)) return [];

    return [
      {
        value: Number(numberText),
        unit,
        decimals: numberText.includes(".") ? numberText.split(".")[1].length : 0,
      },
    ];
  });

const isSupportedMeasurement = (candidate: ParsedMeasurement, sources: ParsedMeasurement[]) =>
  sources.some((source) => {
    if (source.unit !== candidate.unit) return false;
    if (source.value === candidate.value) return true;
    if (candidate.decimals >= source.decimals) return false;

    return Number(source.value.toFixed(candidate.decimals)) === candidate.value;
  });

const collectGuidanceItems = (answer: z.infer<typeof aiAnswerSchema>) => [
  ...(answer.riskSummary ? [answer.riskSummary] : []),
  ...(answer.immediateActions ?? []),
  ...(answer.disasterActions ?? []),
  ...(answer.recommendedShelterReason ? [answer.recommendedShelterReason] : []),
  ...(answer.movementWarnings ?? []),
  ...(answer.alternativeShelterReasons ?? []).map((item) => item.reason),
];

const hasInvalidGuidanceSource = (item: AiGuidanceItem, knownFactIds: Set<string>) => {
  if (item.sourceKind === "LIVE_DATA") {
    return (
      item.evidenceRefs.length === 0 ||
      item.evidenceRefs.some((reference) => !knownFactIds.has(reference))
    );
  }

  return item.evidenceRefs.length > 0 || measurements(item.text).length > 0;
};

export const validateAiResponse = ({
  data,
  fallback,
  timestamp,
  allowedTerms,
  factIds = [],
  facts = [],
  allowedShelterIds = [],
  requireStructured = false,
}: {
  data: unknown;
  fallback: AiAnswer;
  timestamp: string;
  allowedTerms: string[];
  factIds?: string[];
  facts?: SafetyFact[];
  allowedShelterIds?: string[];
  requireStructured?: boolean;
}): AiAnswer => {
  const parsed = aiAnswerSchema.safeParse(data);
  if (!parsed.success) {
    console.warn("[AI Validation] Response schema validation failed.");
    return fallback;
  }

  if (
    requireStructured &&
    (!parsed.data.riskSummary ||
      !parsed.data.immediateActions?.length ||
      !parsed.data.disasterActions?.length ||
      !parsed.data.recommendedShelterReason ||
      !parsed.data.movementWarnings?.length ||
      !parsed.data.alternativeShelterReasons)
  ) {
    console.warn("[AI Validation] Structured guidance fields are missing.");
    return fallback;
  }

  const knownFactIds = new Set(factIds);
  const guidanceItems = collectGuidanceItems(parsed.data);
  if (guidanceItems.some((item) => hasInvalidGuidanceSource(item, knownFactIds))) {
    console.warn("[AI Validation] Guidance cited an invalid source.");
    return fallback;
  }
  if (
    facts.length > 0 &&
    guidanceItems.some((item) => {
      if (item.sourceKind !== "LIVE_DATA") return false;
      const sourceValues = measurements(
        facts
          .filter((fact) => item.evidenceRefs.includes(fact.id))
          .map((fact) => fact.text)
          .join(" "),
      );
      return measurements(item.text).some((value) => !isSupportedMeasurement(value, sourceValues));
    })
  ) {
    console.warn("[AI Validation] Measurement was not present in cited facts.");
    return fallback;
  }

  const allowedShelterIdSet = new Set(allowedShelterIds);
  if (
    (parsed.data.alternativeShelterReasons ?? []).some(
      ({ shelterId }) => !allowedShelterIdSet.has(shelterId),
    )
  ) {
    console.warn("[AI Validation] Guidance cited an unknown alternative shelter.");
    return fallback;
  }

  const textForProperNounCheck = [
    parsed.data.judgementLabel ?? "",
    ...parsed.data.reasons,
    ...parsed.data.basis,
    ...guidanceItems.map((item) => item.text),
  ].join(" ");
  if (containsUnknownProperNoun(textForProperNounCheck, allowedTerms)) {
    console.warn("[AI Validation] Unknown place name in guidance.");
    return fallback;
  }

  return {
    judgement: parsed.data.judgement,
    judgementLabel: ACTION_LABEL[parsed.data.judgement],
    reasons: parsed.data.reasons,
    basis: parsed.data.basis,
    timestamp,
    verified: true,
    riskSummary: parsed.data.riskSummary,
    immediateActions: parsed.data.immediateActions,
    disasterActions: parsed.data.disasterActions,
    recommendedShelterReason: parsed.data.recommendedShelterReason,
    movementWarnings: parsed.data.movementWarnings,
    alternativeShelterReasons: parsed.data.alternativeShelterReasons,
  };
};
