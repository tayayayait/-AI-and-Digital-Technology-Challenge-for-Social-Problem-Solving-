import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { AddressFallback } from "@/components/location/AddressFallback";
import { RiskForecastPanel } from "@/components/risk/RiskForecastPanel";
import { useRiskAssessment } from "@/hooks/useRiskAssessment";
import type { GeocodeResult } from "@/lib/geocoding";
import { useScenario } from "@/store/scenario";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "6시간 위험 전망 — 침수퇴로 AI" },
      {
        name: "description",
        content: "기상청 초단기예보를 바탕으로 앞으로 6시간의 침수 위험 변화를 확인합니다.",
      },
    ],
  }),
  component: ForecastPage,
});

function ForecastPage() {
  const { origin, locationStatus, setLocationStatus, setOrigin } = useScenario();
  const assessment = useRiskAssessment(origin);
  const hasSelectedLocation = locationStatus === "GRANTED";

  return (
    <div className="flex flex-1 flex-col px-4 pb-5 pt-4">
      <header>
        <h1 className="text-[20px] font-extrabold text-[var(--text)]">앞으로 6시간 위험 전망</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
          선택한 위치의 강우 변화와 침수 위험 상승 시점을 미리 확인하세요.
        </p>
      </header>

      {hasSelectedLocation ? (
        <div className="mt-4 space-y-4">
          <RiskForecastPanel outlook={assessment.riskOutlook} />
          <section
            className="rounded-[12px] bg-[var(--surface-alt)] p-4"
            aria-label="전망 활용 안내"
          >
            <div className="flex items-center gap-2">
              <Info size={16} className="text-[var(--primary)]" aria-hidden />
              <h2 className="text-[14px] font-extrabold">위험이 오르기 전에 준비하세요</h2>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
              예상 위험이 경계 이상으로 오르면 미리 가까운 대피소와 이동 경로를 확인하고, 재난문자
              또는 현장 통제가 시작되면 즉시 그 안내를 따르세요.
            </p>
          </section>
        </div>
      ) : (
        <section className="mt-5" aria-label="전망 위치 설정">
          <div className="rounded-[12px] bg-white p-4">
            <h2 className="text-[15px] font-extrabold">전망을 확인할 위치를 설정해 주세요</h2>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              주소를 선택하면 해당 기상청 격자의 6시간 전망을 계산합니다.
            </p>
          </div>
          <div className="mt-3">
            <AddressFallback
              onSelect={(result: GeocodeResult) => {
                setOrigin(result.position);
                setLocationStatus("GRANTED");
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
