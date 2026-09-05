import { Accessibility, Footprints } from "lucide-react";

import { useAccessibility } from "@/store/accessibility";

export function AccessibilitySettingsCard() {
  const mobilityMode = useAccessibility((state) => state.mobilityMode);
  const setMobilityMode = useAccessibility((state) => state.setMobilityMode);

  return (
    <section
      className="rounded-[8px] border border-[var(--border-soft)] bg-white p-4"
      aria-labelledby="mobility-mode-title"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: mobilityMode ? "#dbeafe" : "var(--surface-alt)" }}
        >
          {mobilityMode ? (
            <Accessibility size={20} className="text-[var(--primary)]" aria-hidden />
          ) : (
            <Footprints size={20} className="text-[var(--text-subtle)]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 break-words">
              <h3 id="mobility-mode-title" className="text-[15px] font-extrabold">
                이동약자 모드
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                본문을 1.25배 키우고 고대비 색상으로 표시합니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="이동약자 모드"
              aria-checked={mobilityMode}
              onClick={() => setMobilityMode(!mobilityMode)}
              className="relative h-7 w-12 shrink-0 rounded-full border border-[var(--border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2"
              style={{ background: mobilityMode ? "var(--primary)" : "var(--surface-alt)" }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: mobilityMode ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>
          <p className="mt-3 break-words text-[12px] leading-relaxed text-[var(--text-subtle)]">
            도보 경로는 계단 회피를 우선 요청하고 45m/분 속도로 도착시간을 다시 계산합니다. TMAP이
            옵션을 제공하지 않으면 경로에 “계단 정보 없음”을 표시합니다.
          </p>
        </div>
      </div>
    </section>
  );
}
