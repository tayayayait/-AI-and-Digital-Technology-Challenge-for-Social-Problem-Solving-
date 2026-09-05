import type { ApiStatus } from "@/lib/api/types";

export interface SourceTimestamp {
  label: string;
  timestamp: string | null;
  status: ApiStatus;
}

const toTimestamp = (value: string | null) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

/** 여러 소스 중 가장 오래된 성공 시각. 화면 대표 기준시각으로 쓴다. */
export const oldestSuccessfulTimestamp = (sources: SourceTimestamp[]): string | null => {
  let oldest: number | null = null;

  for (const source of sources) {
    if (source.status !== "OK") continue;
    const timestamp = toTimestamp(source.timestamp);
    if (timestamp === null) continue;
    oldest = oldest === null ? timestamp : Math.min(oldest, timestamp);
  }

  return oldest === null ? null : new Date(oldest).toISOString();
};

/** "3분 전" 형태의 상대 표기. */
export const relativeAge = (timestamp: string | null, now = Date.now()): string => {
  const parsed = toTimestamp(timestamp);
  if (parsed === null) return "확실한 정보 없음";

  const diffMs = now - parsed;
  if (!Number.isFinite(diffMs) || diffMs < 0) return "확실한 정보 없음";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
};

/** 신선도 등급. 화면에서 색으로 구분한다. */
export const freshness = (timestamp: string | null, now = Date.now()) => {
  const parsed = toTimestamp(timestamp);
  if (parsed === null) return "UNKNOWN" as const;

  const minutes = (now - parsed) / 60_000;
  if (!Number.isFinite(minutes) || minutes < 0) return "UNKNOWN" as const;
  if (minutes <= 10) return "FRESH" as const;
  if (minutes <= 60) return "AGING" as const;
  return "STALE" as const;
};
