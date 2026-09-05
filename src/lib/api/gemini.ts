import { ACTION_LABEL, ALLOWED_AI_ACTIONS, validateAiResponse } from "@/lib/ai/validateAiResponse";
import { RISK_META } from "@/lib/risk";
import type { AiAnswer, AiGuidanceItem, RiskLevel, SafetyFact, SafetyFactKind } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

export interface GeminiAlternativeShelter {
  shelterId: string;
  shelterName: string;
  distanceMeters: number;
  distanceKind: "ROUTE" | "STRAIGHT_LINE";
  routeVerified: boolean;
}

export interface GeminiRouteExplanationInput {
  question: string;
  riskLevel: RiskLevel;
  recommendedRouteId?: string;
  recommendedShelterId?: string;
  shelterName: string;
  distanceMeters?: number;
  routeReasons: string[];
  dataTimestamp: string;
  allowedProperNouns: string[];
  mode?: "QUESTION" | "SITUATION_GUIDANCE";
  disasterTypes?: string[];
  selectionKind?: "AUTO_RECOMMENDED" | "USER_SELECTED";
  facts?: SafetyFact[];
  alternatives?: GeminiAlternativeShelter[];
}

type AiAction = (typeof ALLOWED_AI_ACTIONS)[number];

export type GeminiChatClient = (input: GeminiRouteExplanationInput) => Promise<unknown>;

export const GEMINI_CHAT_TIMEOUT_MS = 25_000;

export const AI_NOTICE =
  "AI 안내는 공공데이터와 현재 입력값을 기반으로 한 보조 판단입니다. 지자체 대피명령과 현장 통제를 우선하세요.";

const hasFloodRiskReason = (reason: string) =>
  reason.includes("지하차도") ||
  reason.includes("침수") ||
  reason.includes("범람") ||
  reason.includes("통제");

const isResolvedRiskReason = (reason: string) =>
  reason.includes("회피") ||
  reason.includes("우회") ||
  reason.includes("미포함") ||
  reason.includes("영향 없음") ||
  reason.includes("통제 없음") ||
  reason.includes("위험 없음");

const ruleJudgement = (riskLevel: RiskLevel, routeReasons: string[]): AiAction => {
  if (routeReasons.some((reason) => hasFloodRiskReason(reason) && !isResolvedRiskReason(reason))) {
    return "AVOID_ROUTE";
  }
  if (riskLevel === "CRITICAL") return "WALK_TO_SHELTER";
  if (riskLevel === "WARNING") return "WALK_TO_SHELTER";
  if (riskLevel === "WATCH") return "CHECK_OFFICIAL_NOTICE";
  return "WAIT";
};

const guidanceItem = (
  text: string,
  evidenceRefs: string[] = [],
  sourceKind: AiGuidanceItem["sourceKind"] = evidenceRefs.length > 0
    ? "LIVE_DATA"
    : "GENERAL_KNOWLEDGE",
): AiGuidanceItem => ({ text, sourceKind, evidenceRefs });

const factRefs = (facts: SafetyFact[], kinds: SafetyFactKind[]) =>
  facts.filter((fact) => kinds.includes(fact.kind)).map((fact) => fact.id);

const inferDisasterTypes = (input: GeminiRouteExplanationInput) => {
  const explicit = input.disasterTypes?.filter(Boolean) ?? [];
  if (explicit.length > 0) return [...new Set(explicit)].slice(0, 4);

  const evidence = [input.question, ...input.routeReasons].join(" ");
  return [
    evidence.includes("호우") ? "호우" : null,
    evidence.includes("침수") || evidence.includes("지하차도") ? "침수" : null,
    evidence.includes("하천") || evidence.includes("범람") ? "하천 범람" : null,
    evidence.includes("태풍") ? "태풍" : null,
  ].filter((item): item is string => Boolean(item));
};

const buildDisasterActions = (disasterTypes: string[]): AiGuidanceItem[] => {
  const actions: AiGuidanceItem[] = [];
  const joined = disasterTypes.join(" ");

  if (joined.includes("침수") || joined.includes("호우")) {
    actions.push(
      guidanceItem("침수된 도로는 수심을 직접 확인하려 하지 말고 되돌아가 지상 우회로를 찾으세요."),
      guidanceItem("지하차도·지하주차장·반지하 공간에는 진입하지 말고 높은 곳으로 이동하세요."),
    );
  }
  if (joined.includes("하천") || joined.includes("범람")) {
    actions.push(
      guidanceItem(
        "하천변·제방·산책로에서 벗어나 하천에서 떨어진 높은 지상 안전장소로 이동하세요.",
      ),
    );
  }
  if (joined.includes("태풍")) {
    actions.push(guidanceItem("간판·공사장·유리창 주변을 피하고 튼튼한 건물 안쪽으로 이동하세요."));
  }
  if (joined.includes("산사태")) {
    actions.push(
      guidanceItem("산비탈·계곡에서 떨어진 지정 대피장소로 이동하고 현장 대피 안내를 따르세요."),
    );
  }
  if (joined.includes("지진")) {
    actions.push(
      guidanceItem(
        "흔들리는 동안 머리를 보호하고, 흔들림이 멈추면 엘리베이터 대신 계단으로 대피하세요.",
      ),
    );
  }
  if (joined.includes("화재")) {
    actions.push(
      guidanceItem(
        "연기와 불길이 있는 경로에는 진입하지 말고, 대피가 어려우면 문을 닫고 구조를 요청하세요.",
      ),
    );
  }
  if (joined.includes("폭염")) {
    actions.push(
      guidanceItem(
        "야외 활동을 멈추고 그늘이나 시원한 실내에서 쉬며, 이상 증상이 있으면 도움을 요청하세요.",
      ),
    );
  }

  return actions.slice(0, 4).length > 0
    ? actions.slice(0, 4)
    : [guidanceItem("현장 통제와 지자체 대피명령을 가장 먼저 따르세요.")];
};

const buildStructuredFallback = (
  input: GeminiRouteExplanationInput,
  judgement: AiAction,
): Pick<
  AiAnswer,
  | "riskSummary"
  | "immediateActions"
  | "disasterActions"
  | "recommendedShelterReason"
  | "movementWarnings"
  | "alternativeShelterReasons"
> => {
  const facts = input.facts ?? [];
  const riskRefs = factRefs(facts, ["RISK", "WEATHER", "WARNING", "DISASTER_MESSAGE"]).slice(0, 4);
  const routeRefs = factRefs(facts, ["ROUTE", "TRAFFIC", "UNDERPASS", "FLOOD_MAP", "RIVER"]).slice(
    0,
    4,
  );
  const shelterRefs = factRefs(facts, ["SHELTER"]);
  const movementFacts = facts
    .filter((fact) => ["TRAFFIC", "UNDERPASS", "FLOOD_MAP", "RIVER"].includes(fact.kind))
    .slice(0, 4);
  const meta = RISK_META[input.riskLevel];
  const riskFact = facts.find((fact) => fact.id === "risk-current");

  return {
    riskSummary: guidanceItem(
      riskFact?.text ?? "현재 위험도 판단에는 데이터 확인이 필요합니다.",
      riskRefs,
    ),
    immediateActions: [
      guidanceItem(
        judgement === "AVOID_ROUTE"
          ? "침수·통제 위험이 남은 경로에는 진입하지 말고 우회 경로를 다시 확인하세요."
          : riskFact?.status !== "LIVE"
            ? "현재 정보만으로 안전을 단정할 수 없습니다. 공식 재난 알림과 주변 통제를 먼저 확인하세요."
            : meta.actionTitle + ". " + meta.actionBody,
        judgement === "AVOID_ROUTE" && routeRefs.length > 0 ? routeRefs : riskRefs,
      ),
    ],
    disasterActions: buildDisasterActions(inferDisasterTypes(input)),
    recommendedShelterReason: guidanceItem(
      input.recommendedRouteId
        ? (input.selectionKind === "USER_SELECTED"
            ? "직접 선택한 후보입니다. "
            : "현재 경로 비교 결과에 연결된 후보입니다. ") +
            "출발 전 운영 여부와 아래 경로 위험요소를 함께 확인하세요."
        : "실제 이동 경로가 확인되지 않았습니다. 가까운 후보라는 이유만으로 안전하다고 볼 수 없으니 경로와 운영 여부를 먼저 확인하세요.",
      [...new Set([...routeRefs, ...shelterRefs])].slice(0, 8),
    ),
    movementWarnings:
      movementFacts.length > 0
        ? movementFacts.map((fact) =>
            guidanceItem(`${fact.text}. 현장 통제와 실제 위험 여부를 확인하세요.`.slice(0, 320), [
              fact.id,
            ]),
          )
        : [
            guidanceItem(
              "이동 중 물이 고인 도로·하천변·지하차도·저지대가 보이면 진입하지 말고 높은 지상 경로로 우회하세요.",
            ),
          ],
    alternativeShelterReasons: (input.alternatives ?? []).map((alternative) => ({
      shelterId: alternative.shelterId,
      reason: guidanceItem(
        "주 대피소 이용이 어려울 때 비교할 후보입니다. 운영 여부와 이동 경로를 확인한 뒤 선택하세요.",
      ),
    })),
  };
};

export const buildRuleBasedAiAnswer = (input: GeminiRouteExplanationInput): AiAnswer => {
  const calculatedJudgement = ruleJudgement(input.riskLevel, input.routeReasons);
  const hasCurrentRiskFact = input.facts?.some(
    (fact) => fact.id === "risk-current" && fact.status === "LIVE",
  );
  const judgement =
    input.mode === "SITUATION_GUIDANCE" &&
    ((!input.recommendedRouteId &&
      ["WALK_TO_SHELTER", "DRIVE_TO_SAFE_ZONE"].includes(calculatedJudgement)) ||
      (calculatedJudgement === "WAIT" && !hasCurrentRiskFact))
      ? "CHECK_OFFICIAL_NOTICE"
      : calculatedJudgement;
  const question = input.question.replace(/\s+/g, " ");
  const routeReasons =
    input.routeReasons.length > 0 ? input.routeReasons : ["수집된 위험 근거 없음"];
  const structured = buildStructuredFallback(input, judgement);

  if (input.mode === "SITUATION_GUIDANCE") {
    return {
      ...structured,
      judgement,
      judgementLabel:
        judgement === "WAIT" ? RISK_META[input.riskLevel].actionTitle : ACTION_LABEL[judgement],
      reasons: structured.immediateActions?.map((item) => item.text) ?? routeReasons,
      basis: ["API 근거", "규칙 기반 안전 안내"],
      timestamp: input.dataTimestamp,
      verified: false,
    };
  }

  if (question.includes("가족")) {
    return {
      ...structured,
      judgement,
      judgementLabel: "가족 공유 문구",
      reasons: [
        `${input.shelterName} 방향으로 이동 중입니다. 가족에게 공유할 위치와 이동 상태를 짧게 전달하세요.`,
        ...routeReasons,
      ],
      basis: ["질문유형", "경로근거"],
      timestamp: input.dataTimestamp,
      verified: false,
    };
  }

  if (question.includes("신고") || question.includes("119")) {
    return {
      ...structured,
      judgement: "CALL_119",
      judgementLabel: "신고 내용 정리",
      reasons: [
        `${input.shelterName} 주변 위험 상황, 현재 위치, 통제 여부를 신고 내용에 포함하세요.`,
        ...routeReasons,
      ],
      basis: ["질문유형", "경로근거"],
      timestamp: input.dataTimestamp,
      verified: false,
    };
  }

  if (question.includes("추천") || question.includes("경로") || question.includes("안전점수")) {
    return {
      ...structured,
      judgement,
      judgementLabel: "안전 경로 안내",
      reasons: [
        `${input.shelterName}까지 비교적 안전한 대안 경로를 우선 확인하세요.`,
        ...routeReasons,
      ],
      basis: ["경로상태", "위험근거"],
      timestamp: input.dataTimestamp,
      verified: false,
    };
  }

  if (question.includes("지금") || question.includes("이동") || question.includes("나가")) {
    return {
      ...structured,
      judgement,
      judgementLabel: ACTION_LABEL[judgement],
      reasons: [
        `지금 당장 이동 여부는 ${input.shelterName}까지의 경로 위험 근거를 확인한 뒤 판단하세요.`,
        ...routeReasons,
      ],
      basis: ["질문유형", "경로근거"],
      timestamp: input.dataTimestamp,
      verified: false,
    };
  }

  return {
    ...structured,
    judgement,
    judgementLabel: ACTION_LABEL[judgement],
    reasons: ["AI 통신 지연으로 맞춤형 안내를 제공할 수 없습니다."],
    basis: ["통신지연"],
    timestamp: input.dataTimestamp,
    verified: false,
  };
};

export const shouldCallGemini = (input: GeminiRouteExplanationInput) =>
  Boolean(
    input.riskLevel &&
    input.dataTimestamp &&
    ((input.recommendedRouteId && input.recommendedShelterId) || input.facts?.length),
  );

const invokeGeminiChatEdge: GeminiChatClient = async (input) => {
  const { data, error } = await supabase.functions.invoke("gemini-chat", {
    body: input,
  });
  if (error) throw new Error(error.message);
  return data;
};

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      globalThis.setTimeout(() => reject(new Error("Gemini timeout")), ms);
    }),
  ]);

export const explainRouteWithGemini = async (
  input: GeminiRouteExplanationInput,
  client: GeminiChatClient = invokeGeminiChatEdge,
): Promise<AiAnswer> => {
  const fallback = buildRuleBasedAiAnswer(input);
  if (!shouldCallGemini(input)) return fallback;

  try {
    const data = await withTimeout(client(input), GEMINI_CHAT_TIMEOUT_MS);
    const validated = validateAiResponse({
      data,
      fallback,
      timestamp: input.dataTimestamp,
      allowedTerms: input.allowedProperNouns,
      factIds: input.facts?.map((fact) => fact.id),
      facts: input.facts,
      allowedShelterIds: input.alternatives?.map((shelter) => shelter.shelterId),
      requireStructured: input.mode === "SITUATION_GUIDANCE",
    });
    if (input.mode === "SITUATION_GUIDANCE" && validated.verified) {
      const movement =
        validated.judgement === "WALK_TO_SHELTER" || validated.judgement === "DRIVE_TO_SAFE_ZONE";
      if (
        (movement && !input.recommendedRouteId) ||
        (fallback.judgement === "AVOID_ROUTE" &&
          !["AVOID_ROUTE", "CALL_119", "CHECK_OFFICIAL_NOTICE"].includes(validated.judgement))
      )
        return fallback;
    }
    if (!validated.verified) {
      console.warn("AI response validation failed, falling back to rule-based.");
    }
    return validated;
  } catch (error) {
    console.error("Gemini AI failed:", error);
    return fallback;
  }
};
