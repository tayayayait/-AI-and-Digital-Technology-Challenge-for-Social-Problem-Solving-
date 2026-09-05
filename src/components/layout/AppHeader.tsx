import { useNavigate } from "@tanstack/react-router";
import { useScenario } from "@/store/scenario";
import { getScenarioPreset } from "@/lib/scenario/presets";
import { RiskBadge } from "@/components/risk/RiskBadge";

interface AppHeaderProps {
  title?: string;
  context?: "citizen" | "field";
  staleRisk?: boolean;
}

export function AppHeader({
  title = "침수퇴로 AI",
  context = "citizen",
  staleRisk = false,
}: AppHeaderProps) {
  const { riskLevel, scenarioPresetId, setLocationStatus } = useScenario();
  const navigate = useNavigate();
  const isField = context === "field";
  const activeScenario = getScenarioPreset(scenarioPresetId);
  const returnToAddressSetup = () => {
    setLocationStatus("PROMPT");
    void navigate({ to: "/" });
  };

  return (
    <header
      className="sticky top-0 bg-white border-b border-[var(--border-soft)] flex items-center gap-3 px-4"
      style={{ height: 56, zIndex: 45 }}
    >
      <RiskBadge level={riskLevel} stale={staleRisk} />
      {isField ? (
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-[var(--text-subtle)]">공개 현장정보</div>
          <h1 className="text-[15px] font-bold truncate">현장정보</h1>
        </div>
      ) : (
        <div className="relative flex-1 min-w-0 rounded-[8px]">
          <div className="text-[11px] font-bold text-[var(--text-subtle)]">시민 화면</div>
          <h1 className="text-[15px] font-bold truncate">{title}</h1>
          <button
            type="button"
            onClick={returnToAddressSetup}
            className="absolute inset-0 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            aria-label={`${title} 초기 주소 설정 화면으로 이동`}
          />
        </div>
      )}
      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="text-[11px] font-bold text-[var(--text-subtle)]">상태</span>
        <span className="max-w-[136px] truncate rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-2 py-1 text-[12px] font-bold text-[var(--text)]">
          {activeScenario.label}
        </span>
      </div>
    </header>
  );
}
