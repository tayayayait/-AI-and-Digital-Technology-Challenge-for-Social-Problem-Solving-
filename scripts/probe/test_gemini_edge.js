import { readRequiredEnv } from "./load-env.js";

const baseUrl = readRequiredEnv("VITE_SUPABASE_URL", "SUPABASE_URL");
const key = readRequiredEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY");
const timestamp = new Date().toISOString();
const response = await fetch(new URL("/functions/v1/gemini-chat", baseUrl), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: "Bearer " + key,
  },
  signal: AbortSignal.timeout(30_000),
  body: JSON.stringify({
    question: "현재 상황에서 무엇을 확인해야 하나요?",
    mode: "SITUATION_GUIDANCE",
    riskLevel: "SAFE",
    shelterName: "확인 가능한 대피소 없음",
    routeReasons: [],
    allowedProperNouns: [],
    dataTimestamp: timestamp,
    disasterTypes: ["침수"],
    facts: [
      {
        id: "risk-current",
        kind: "RISK",
        text: "테스트용 위험 점수 5점. 현장 안전 보장 아님.",
        source: "테스트용 API 근거",
        observedAt: timestamp,
        status: "LIVE",
      },
    ],
    alternatives: [],
  }),
});
const body = await response.json();
const isGuidanceItem = (item) =>
  item &&
  typeof item.text === "string" &&
  item.text.length > 0 &&
  ["LIVE_DATA", "GENERAL_KNOWLEDGE"].includes(item.sourceKind) &&
  Array.isArray(item.evidenceRefs);
const invalidSections = [];
for (const section of ["riskSummary", "recommendedShelterReason"]) {
  if (!isGuidanceItem(body?.[section])) invalidSections.push(section);
}
for (const section of ["immediateActions", "disasterActions", "movementWarnings"]) {
  if (
    !Array.isArray(body?.[section]) ||
    !body[section].length ||
    !body[section].every(isGuidanceItem)
  ) {
    invalidSections.push(section);
  }
}
if (!Array.isArray(body?.alternativeShelterReasons))
  invalidSections.push("alternativeShelterReasons");

// Only print contract diagnostics, never credentials or generated/user content.
console.log(
  JSON.stringify(
    { status: response.status, responseKeys: Object.keys(body ?? {}), invalidSections },
    null,
    2,
  ),
);
if (!response.ok || invalidSections.length > 0) {
  console.error(
    "Gemini 안내 응답 규격 불일치: gemini-chat 배포 버전과 필수 안내 항목을 확인하세요.",
  );
  process.exitCode = 1;
}
