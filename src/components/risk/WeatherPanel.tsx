import { CloudRain, Droplets, AlertTriangle, Thermometer } from "lucide-react";
import type { WeatherSnapshot } from "@/lib/api/types";
import type { WeatherWarningAlert } from "@/lib/api/weatherWarning";

const PRECIPITATION_LABEL: Record<string, string> = {
  rain: "비",
  "rain-snow": "비/눈",
  snow: "눈",
  shower: "소나기",
  drizzle: "이슬비",
  sleet: "진눈깨비",
  flurry: "눈날림",
  none: "맑음",
};

export function WeatherPanel({
  weather,
  warnings = [],
}: {
  weather: WeatherSnapshot | null;
  /** 기상청 기상특보. 관측값에서 유도한 값이 아니라 실제 발효 중인 특보다. */
  warnings?: WeatherWarningAlert[];
}) {
  if (!weather) return null;

  const { rainfallMmPerHour, humidityPercent, precipitationType, temperatureCelsius } = weather;

  const alerts = warnings;
  const hasAlert = alerts.length > 0;

  const isClear =
    !rainfallMmPerHour &&
    (!precipitationType || precipitationType === "none") &&
    !hasAlert &&
    temperatureCelsius === undefined &&
    humidityPercent === undefined;

  const ptyLabel = precipitationType
    ? PRECIPITATION_LABEL[precipitationType] || precipitationType
    : "맑음";

  return (
    <section
      aria-label="현재 기상 상황"
      className="border-t border-[var(--border-soft)] bg-white px-4 py-4"
    >
      <div className="flex items-center gap-2">
        <CloudRain size={17} className="text-[var(--primary)]" aria-hidden />
        <h2 className="text-[15px] font-extrabold text-[var(--text)]">실시간 기상 상황</h2>
      </div>

      <div className="mt-3 rounded-[8px] border border-[var(--border-soft)] bg-[var(--surface-alt)] px-4 py-3">
        {isClear ? (
          <p className="text-[13px] font-medium text-[var(--text-muted)]">
            현재 강수 및 기상 특보가 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CloudRain size={14} className="text-[var(--text-muted)]" />
                <span className="text-[13px] font-bold text-[var(--text)]">
                  {ptyLabel}
                  {rainfallMmPerHour > 0 ? ` (시간당 ${rainfallMmPerHour}mm)` : ""}
                </span>
              </div>

              {temperatureCelsius !== undefined ? (
                <div className="flex items-center gap-1.5">
                  <Thermometer size={14} className="text-[var(--text-muted)]" />
                  <span className="text-[13px] font-bold text-[var(--text)]">
                    {temperatureCelsius}℃
                  </span>
                </div>
              ) : null}

              {humidityPercent !== undefined ? (
                <div className="flex items-center gap-1.5">
                  <Droplets size={14} className="text-[var(--text-muted)]" />
                  <span className="text-[13px] font-bold text-[var(--text)]">
                    습도 {humidityPercent}%
                  </span>
                </div>
              ) : null}
            </div>

            {hasAlert ? (
              <div className="space-y-1.5 pt-2 border-t border-[var(--border-soft)]">
                <p className="text-[11px] font-bold text-[var(--text-muted)]">기상청 기상특보</p>
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-1.5">
                    <AlertTriangle
                      size={14}
                      className={
                        alert.level === "CRITICAL"
                          ? "text-[var(--risk-critical-text)]"
                          : alert.level === "WARNING"
                            ? "text-[var(--risk-warning-text)]"
                            : "text-[var(--risk-watch-text)]"
                      }
                    />
                    <span className="text-[12px] font-extrabold leading-snug text-[var(--text)]">
                      {alert.title}
                      {alert.zone ? (
                        <span className="ml-1 font-bold text-[var(--text-muted)]">
                          {alert.zone}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
