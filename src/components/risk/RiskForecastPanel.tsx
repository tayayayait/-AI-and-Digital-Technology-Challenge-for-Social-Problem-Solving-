import { CloudRain, Clock3, TriangleAlert } from "lucide-react";

import type { RiskOutlookPoint } from "@/lib/risk/forecastRisk";
import { RISK_META, riskClass } from "@/lib/risk";

const RISK_RANK: Record<RiskOutlookPoint["riskLevel"], number> = {
  UNKNOWN: -1,
  SAFE: 0,
  WATCH: 1,
  WARNING: 2,
  CRITICAL: 3,
};

const formatForecastTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const highestRiskPoint = (outlook: RiskOutlookPoint[]) =>
  outlook.reduce<RiskOutlookPoint | null>(
    (highest, point) =>
      !highest || RISK_RANK[point.riskLevel] > RISK_RANK[highest.riskLevel] ? point : highest,
    null,
  );

export function RiskForecastPanel({ outlook }: { outlook: RiskOutlookPoint[] }) {
  const highest = highestRiskPoint(outlook);

  return (
    <section
      aria-label="6시간 침수 위험 전망"
      className="rounded-[14px] border border-[var(--border-soft)] bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--surface-alt)] text-[var(--primary)]">
          <Clock3 size={19} aria-hidden />
        </div>
        <div>
          <h2 className="text-[16px] font-extrabold text-[var(--text)]">6시간 침수 위험 전망</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
            기상청 초단기예보와 현재 재난·수위·통제 근거를 시간대별로 계산합니다.
          </p>
        </div>
      </div>

      {highest ? (
        <>
          <div
            className="mt-4 rounded-[10px] px-3 py-3"
            style={{
              background: riskClass(highest.riskLevel).bg,
              color: riskClass(highest.riskLevel).text,
            }}
          >
            <div className="flex items-center gap-2">
              <TriangleAlert size={16} aria-hidden />
              <p className="text-[13px] font-extrabold">
                가장 높은 예상 위험: {RISK_META[highest.riskLevel].label}
              </p>
            </div>
            <p className="mt-1 pl-6 text-[11px] font-bold">
              {formatForecastTime(highest.forecastAt)} · 예상 점수{" "}
              {highest.riskScore < 0 ? "산정 불가" : `${highest.riskScore}점`}
            </p>
          </div>

          <ol className="mt-3 space-y-2">
            {outlook.map((point) => {
              const colors = riskClass(point.riskLevel);
              return (
                <li
                  key={point.forecastAt}
                  className="grid grid-cols-[minmax(88px,auto)_1fr_auto] items-center gap-3 rounded-[10px] border border-[var(--border-soft)] px-3 py-3"
                >
                  <time
                    dateTime={point.forecastAt}
                    className="text-[12px] font-extrabold text-[var(--text)] tnum"
                  >
                    {formatForecastTime(point.forecastAt)}
                  </time>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--text-muted)]">
                      <CloudRain size={14} aria-hidden />
                      <span>시간당 {point.rainfallMmPerHour}mm</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
                      강수확률 {point.precipitationProbabilityPercent ?? "미제공"}%
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    예상 {RISK_META[point.riskLevel].label}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <div
          className="mt-4 rounded-[10px] bg-[var(--surface-alt)] px-4 py-8 text-center text-[13px] font-bold text-[var(--text-muted)]"
          role="status"
        >
          기상청 초단기예보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-subtle)]">
        예상 정보이며 현재 침수 사실을 뜻하지 않습니다. 실제 재난문자와 현장 통제를 우선하세요.
      </p>
    </section>
  );
}
