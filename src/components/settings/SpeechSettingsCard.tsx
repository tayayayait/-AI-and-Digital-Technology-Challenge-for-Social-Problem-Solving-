import { Volume2, VolumeX } from "lucide-react";

import { useScenario } from "@/store/scenario";

export function SpeechSettingsCard() {
  const speechEnabled = useScenario((state) => state.speechEnabled);
  const setSpeechEnabled = useScenario((state) => state.setSpeechEnabled);

  return (
    <section className="rounded-[8px] border border-[var(--border-soft)] bg-white p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: speechEnabled ? "#dbeafe" : "var(--surface-alt)" }}
        >
          {speechEnabled ? (
            <Volume2 size={18} className="text-[var(--primary)]" aria-hidden />
          ) : (
            <VolumeX size={18} className="text-[var(--text-subtle)]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-extrabold">음성 안내 설정</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                사용자 동작 이후 심각 단계에서 한 번만 자동 재생합니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="심각 단계 자동 음성 안내"
              aria-checked={speechEnabled}
              onClick={() => setSpeechEnabled(!speechEnabled)}
              className="relative h-7 w-12 shrink-0 rounded-full border border-[var(--border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              style={{ background: speechEnabled ? "var(--primary)" : "var(--surface-alt)" }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: speechEnabled ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-subtle)]">
            자동 안내가 꺼져 있어도 모든 위험 단계에서 수동으로 다시 들을 수 있습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
