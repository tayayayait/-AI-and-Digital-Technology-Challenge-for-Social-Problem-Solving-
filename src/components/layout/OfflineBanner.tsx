import { WifiOff } from "lucide-react";
import { freshness, relativeAge } from "@/lib/api/dataTimestamp";

const formatClockTime = (timestamp: string) => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const isOfflineDataStale = (timestamp: string | null, now = Date.now()) => {
  const state = freshness(timestamp, now);
  return state === "STALE" || state === "UNKNOWN";
};

export function OfflineStatusBanner({
  online,
  lastConfirmedAt,
  now = Date.now(),
}: {
  online: boolean;
  lastConfirmedAt: string | null;
  now?: number;
}) {
  if (online) return null;

  const clockTime = lastConfirmedAt ? formatClockTime(lastConfirmedAt) : null;
  const age = relativeAge(lastConfirmedAt, now);
  const stale = isOfflineDataStale(lastConfirmedAt, now);
  const confirmation = clockTime ? `${clockTime} (${age})` : "확실한 정보 없음";

  return (
    <div
      role={stale ? "alert" : "status"}
      className={`flex items-center gap-2 border-b px-4 py-2.5 text-xs font-bold ${
        stale
          ? "border-slate-300 bg-slate-200 text-slate-700"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">오프라인 · 마지막 확인 {confirmation}</span>
      {stale ? <span className="shrink-0">정보가 오래됐습니다</span> : null}
    </div>
  );
}
