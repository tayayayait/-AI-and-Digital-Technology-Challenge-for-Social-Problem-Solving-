import { RISK_META, riskClass } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";

export function RiskBadge({
  level,
  size = "md",
  stale = false,
}: {
  level: RiskLevel;
  size?: "sm" | "md";
  stale?: boolean;
}) {
  const c = riskClass(stale ? "UNKNOWN" : level);
  const h = size === "sm" ? 22 : 28;
  const fs = size === "sm" ? 12 : 13;
  return (
    <span
      role="status"
      aria-label={
        stale
          ? `정보가 오래된 마지막 위험도: ${RISK_META[level].label}`
          : `현재 위험도: ${RISK_META[level].label}`
      }
      className="inline-flex items-center gap-1.5 font-extrabold tnum"
      style={{
        background: c.bg,
        color: c.text,
        height: h,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: fs,
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: c.text,
          display: "inline-block",
        }}
      />
      {RISK_META[level].label}
    </span>
  );
}
