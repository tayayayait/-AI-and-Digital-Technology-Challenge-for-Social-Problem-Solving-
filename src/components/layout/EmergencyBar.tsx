import { AlertTriangle } from "lucide-react";

export type EmergencyBarVariant = "route" | "shelters" | "call";

const ACTION_LABEL: Record<EmergencyBarVariant, string> = {
  route: "가장 안전한 경로 시작",
  shelters: "경로를 계산할 수 없습니다 · 대피소 목록 보기",
  call: "주변 대피소가 없습니다 · 119 신고",
};

const actionClassName = "w-full flex items-center justify-center gap-2 text-white font-extrabold";
const actionStyle = {
  background: "#dc2626",
  height: 52,
  borderRadius: 12,
  fontSize: 15,
  boxShadow: "0 -4px 18px rgba(220,38,38,0.35)",
};

export function EmergencyBar({
  onAction,
  variant = "route",
}: {
  onAction?: () => void;
  variant?: EmergencyBarVariant;
}) {
  const content = (
    <>
      <AlertTriangle size={20} aria-hidden />
      {ACTION_LABEL[variant]}
    </>
  );

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4"
      style={{ bottom: 64, zIndex: 60 }}
    >
      {variant === "call" ? (
        <a href="tel:119" className={actionClassName} style={actionStyle}>
          {content}
        </a>
      ) : (
        <button type="button" onClick={onAction} className={actionClassName} style={actionStyle}>
          {content}
        </button>
      )}
    </div>
  );
}
