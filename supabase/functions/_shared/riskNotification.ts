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
