import { scoreToLevel } from "@/lib/risk";
import type { RiskCalculationInput, RiskScoreBreakdown } from "@/lib/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const includesAny = (value: string, keywords: string[]) =>
  keywords.some((keyword) => value.includes(keyword));

const parsePrecipitationAmount = (value?: string) => {
  if (!value || value === "강수없음") return 0;
  if (value.includes("30.0~50.0")) return 40;
  if (value.includes("50.0")) return 50;
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const sensorRainfallMmPerHour = (input: Pick<RiskCalculationInput, "sensors">) => {
  const values = (input.sensors ?? [])
    .filter((sensor) => sensor.status === "ACTIVE")
    .map((sensor) => sensor.currentRainfallMmPerHour ?? 0);
  return Math.max(0, ...values);
};

/**
 * 침수 관련 기상특보 등급별 가중치.
 *
 * 기상청이 특보를 발령했다는 사실은 관측 강우량과 독립된 근거다. 국지성 호우처럼
 * 관측 지점 강우가 아직 낮은데도 경보가 나가는 상황이 있으므로, 강우 점수와 비교해
 * 더 높은 쪽을 채택한다.
 */
const WARNING_LEVEL_SCORE: Record<"WATCH" | "WARNING" | "CRITICAL", number> = {
  WATCH: 12, // 예비특보
  WARNING: 22, // 주의보
  CRITICAL: 30, // 경보
};

const weatherRiskScore = ({
  weather,
  forecast,
  sensors,
  floodWarningLevel,
}: Pick<RiskCalculationInput, "weather" | "forecast" | "sensors" | "floodWarningLevel">) => {
  const currentRain = weather?.rainfallMmPerHour ?? 0;
  const forecastRain =
    forecast?.rainfallMmPerHour ?? parsePrecipitationAmount(forecast?.precipitationAmount);
  const hrfcoRain = sensorRainfallMmPerHour({ sensors });

  const rainLimitMmPerHour = 30;
  const maxRain = Math.max(currentRain, forecastRain, hrfcoRain);
  const rainScore = Math.min(30, Math.round(30 * (maxRain / rainLimitMmPerHour)));

  const warningScore = floodWarningLevel ? WARNING_LEVEL_SCORE[floodWarningLevel] : 0;

  return clamp(Math.max(rainScore, warningScore), 0, 30);
};

const disasterMessageScore = (input: RiskCalculationInput) => {
  const relevant = input.disasterMessages.some((message) =>
    includesAny(`${message.region} ${message.body}`, ["침수", "대피", "통제", "하천", "호우"]),
  );
  return relevant ? 15 : 0;
};

const riskLevelScore = (riskLevel?: string) => {
  switch (riskLevel) {
    case "CRITICAL":
      return 80;
    case "WARNING":
      return 55;
    case "WATCH":
      return 30;
    default:
      return 0;
  }
};

const waterThresholdScore = (sensor: NonNullable<RiskCalculationInput["sensors"]>[number]) => {
  if (sensor.currentLevel == null) return 0;
  if (sensor.seriousLevel != null && sensor.currentLevel >= sensor.seriousLevel) return 80;
  if (sensor.alarmLevel != null && sensor.currentLevel >= sensor.alarmLevel) return 80;
  if (sensor.warningLevel != null && sensor.currentLevel >= sensor.warningLevel) return 55;
  if (sensor.attentionLevel != null && sensor.currentLevel >= sensor.attentionLevel) return 30;
  if (sensor.warningLevel != null && sensor.currentLevel >= sensor.warningLevel * 0.8) return 15;
  return 0;
};

const sensorRiskScore = (input: RiskCalculationInput) => {
  if (!input.sensors || input.sensors.length === 0) return 0;

  let maxScore = 0;
  for (const sensor of input.sensors) {
    if (sensor.status !== "ACTIVE" || sensor.type === "RAINFALL") continue;
    maxScore = Math.max(maxScore, riskLevelScore(sensor.riskLevel), waterThresholdScore(sensor));
  }
  return maxScore;
};

const hasActiveSensor = (input: RiskCalculationInput) =>
  (input.sensors ?? []).some((sensor) => sensor.status === "ACTIVE");

const cctvFloodEvidenceScore = (input: RiskCalculationInput) => {
  const evidence = input.cctvFloodEvidence;
  if (!evidence || evidence.confidence < 0.7 || evidence.confidence > 1) return 0;

  return {
    NONE: 0,
    SHALLOW: 5,
    DEEP: 10,
    IMPASSABLE: 15,
  }[evidence.depthGrade];
};

export const calculateRiskScore = (input: RiskCalculationInput): RiskScoreBreakdown => {
  const missingDataCount =
    (input.weather ? 0 : 1) + (input.forecast ? 0 : 1) + (input.failedDataCount ?? 0);

  if (missingDataCount >= 2 && !hasActiveSensor(input)) {
    return {
      weather: 0,
      floodTrace: 0,
      riverFlood: 0,
      disasterMessages: 0,
      underpass: 0,
      trafficControl: 0,
      cctvFlood: 0,
      total: -1,
      level: "UNKNOWN",
      reasons: ["필수 데이터 2개 이상 실패"],
      missingDataCount,
    };
  }

  const weather = weatherRiskScore(input);

  const traceOverlapRatio = input.floodTraceOverlap ?? (input.floodTrace ? 1 : 0);
  const floodTrace = Math.min(25, Math.round(25 * traceOverlapRatio));

  const sensor = sensorRiskScore(input);
  const riverOverlapRatio = input.riverFloodOverlap ?? (input.riverFlood ? 1 : 0);
  const riverBase = Math.min(20, Math.round(20 * riverOverlapRatio));
  const riverFlood = Math.max(riverBase, sensor);

  const disasterMessages = disasterMessageScore(input);
  const underpass = input.hasUnderpass ? 5 : 0;
  const trafficControl = input.trafficControl ? 5 : 0;
  const cctvFlood = cctvFloodEvidenceScore(input);

  const total = clamp(
    weather + floodTrace + riverFlood + disasterMessages + underpass + trafficControl + cctvFlood,
    0,
    100,
  );

  const reasons = [
    weather > 0 ? (input.floodWarningTitle ?? "강우·예보 위험") : "",
    floodTrace > 0 ? "침수흔적 중첩" : "",
    riverFlood > 0
      ? sensor >= 80
        ? "실시간 수위·홍수예보 위험"
        : sensor >= 30
          ? "실시간 수위·강우 위험"
          : "하천범람 위험"
      : "",
    disasterMessages > 0 ? "재난문자 위험지역" : "",
    underpass > 0 ? "지하차도·저지대 통과" : "",
    trafficControl > 0 ? (input.trafficControlTitle ?? "교통통제·돌발") : "",
    cctvFlood > 0 ? `CCTV AI 판독 ${input.cctvFloodEvidence?.depthGrade}` : "",
  ].filter(Boolean);

  return {
    weather,
    floodTrace,
    riverFlood,
    disasterMessages,
    underpass,
    trafficControl,
    cctvFlood,
    total,
    level: scoreToLevel(total),
    reasons,
    missingDataCount,
  };
};
