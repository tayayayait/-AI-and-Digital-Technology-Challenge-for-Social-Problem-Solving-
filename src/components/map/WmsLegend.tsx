import { useState } from "react";
import { Info, X } from "lucide-react";

export function WmsLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute right-3 top-3 z-[1000]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border-soft)] bg-white/95 text-[var(--text)] shadow-sm transition-colors hover:bg-gray-50"
        aria-label="지도 색상 범례 보기"
      >
        <Info size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-[280px] rounded-[12px] border border-[var(--border-soft)] bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold text-[var(--text)]">침수 위험지도 범례</h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4">
            <section>
              <h4 className="mb-1.5 text-[12px] font-bold text-[var(--text-subtle)]">
                침수 깊이 (수심) 색상표
              </h4>
              <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
                침수흔적도(과거)와 하천범람지도(예측) 모두 아래 색상 기준으로 물의 깊이를
                나타냅니다.
              </p>
              <ul className="space-y-1.5 text-[12px] text-[var(--text)]">
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#ffff00] border border-black/10"></span>{" "}
                  0.5m 미만 (발목~무릎)
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#00ffff] border border-black/10"></span>{" "}
                  0.5 ~ 1.0m 미만 (허리)
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#0000ff] border border-black/10"></span>{" "}
                  1.0 ~ 2.0m 미만 (가슴~머리)
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#ff00ff] border border-black/10"></span>{" "}
                  2.0 ~ 5.0m 미만 (위험)
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#ff0000] border border-black/10"></span>{" "}
                  5.0m 이상 (완전 침수)
                </li>
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
