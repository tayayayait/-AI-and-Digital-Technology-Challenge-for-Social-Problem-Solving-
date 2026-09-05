export type RiskLevel = "SAFE" | "WATCH" | "WARNING" | "CRITICAL" | "UNKNOWN";

const RANK: Record<RiskLevel, number> = {
  UNKNOWN: -1,
  SAFE: 0,
  WATCH: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export interface NotifyDecisionInput {
  currentLevel: RiskLevel;
  lastNotifiedLevel: RiskLevel | null;
  lastNotifiedAt: string | null;
  threshold: RiskLevel;
  now: number;
}

export const RENOTIFY_COOLDOWN_MS = 60 * 60 * 1_000;

export const shouldNotify = ({
  currentLevel,
  lastNotifiedLevel,
  lastNotifiedAt,
  threshold,
  now,
}: NotifyDecisionInput): boolean => {
  if (currentLevel === "UNKNOWN") return false;
  if (RANK[currentLevel] < RANK[threshold]) return false;
  if (!lastNotifiedLevel) return true;
  if (RANK[currentLevel] > RANK[lastNotifiedLevel]) return true;
  if (RANK[currentLevel] === RANK[lastNotifiedLevel]) {
    if (!lastNotifiedAt) return true;
    return now - new Date(lastNotifiedAt).getTime() >= RENOTIFY_COOLDOWN_MS;
  }
  return false;
};

const ACTIONABLE_COPY = {
  WATCH: ["침수 위험 주의", "이동 전 주변 위험과 안전 경로를 확인하세요."],
  WARNING: ["침수 위험 경계", "안전한 대피소 이동을 준비하고 추천 경로를 확인하세요."],
  CRITICAL: ["침수 위험 심각", "즉시 안전한 곳으로 이동하세요. 가장 안전한 경로를 확인하세요."],
} as const;

export const buildRiskNotificationCopy = ({
  level,
  forecastAt,
}: {
  level: RiskLevel;
  forecastAt?: string;
}) => {
  const actionableLevel = level === "WATCH" || level === "WARNING" ? level : "CRITICAL";
  const [title, body] = ACTIONABLE_COPY[actionableLevel];
  if (!forecastAt) {
    return {
      title,
      body,
      url: "/routes",
      tag: `flood-risk-${actionableLevel.toLowerCase()}`,
    };
  }

  const hour = forecastAt.match(/T(\d{2}):/)?.[1];
  return {
    title: `6시간 내 침수 위험 ${title.replace("침수 위험 ", "")} 예상`,
    body: `${hour ? Number(hour) + "시경" : "곧"} 위험 상승이 예상됩니다. 대피소와 이동 경로를 미리 확인하세요.`,
    url: "/forecast",
    tag: `flood-forecast-${actionableLevel.toLowerCase()}`,
  };
};
