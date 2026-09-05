import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { OpsDetailPanel } from "@/components/ops/OpsDetailPanel";
import { OpsLayout } from "@/components/ops/OpsLayout";
import { RiskZoneTable } from "@/components/ops/RiskZoneTable";
import { useDynamicRiskZones } from "@/hooks/useDynamicRiskZones";
import { aggregateRiskZones } from "@/lib/ops/aggregateRiskZones";

export const Route = createFileRoute("/ops/risk-zones")({
  head: () => ({
    meta: [{ title: "위험지역 — 현장정보" }],
  }),
  component: RiskZonesPage,
});

function RiskZonesPage() {
  const { riskZones, status, region, shelters, trafficEvents, sampledCells, failedCells } =
    useDynamicRiskZones();
  const zones = useMemo(
    () => aggregateRiskZones(riskZones, shelters, trafficEvents),
    [riskZones, shelters, trafficEvents],
  );
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    const nextSelectedId = zones.some((zone) => zone.id === selectedId) ? selectedId : zones[0]?.id;
    if (nextSelectedId !== selectedId) setSelectedId(nextSelectedId);
  }, [selectedId, zones]);

  const selectedZone = zones.find((zone) => zone.id === selectedId) ?? zones[0] ?? null;
  const description =
    status === "READY"
      ? `${region} · ${sampledCells.toLocaleString()}개 격자 분석${failedCells > 0 ? ` · ${failedCells.toLocaleString()}개 확인 실패` : ""}`
      : "침수흔적, 하천범람, 관측·통제 신호를 500m 격자로 분석합니다.";

  return (
    <OpsLayout
      title="위험지역"
      description={description}
      detail={<OpsDetailPanel zone={selectedZone} />}
    >
      {status === "READY" ? (
        <RiskZoneTable
          zones={zones}
          selectedId={selectedZone?.id}
          onSelect={(zone) => setSelectedId(zone.id)}
        />
      ) : (
        <RiskZoneStatus status={status} />
      )}
    </OpsLayout>
  );
}

function RiskZoneStatus({ status }: { status: ReturnType<typeof useDynamicRiskZones>["status"] }) {
  const message =
    status === "IDLE"
      ? "관심 지역을 먼저 설정하세요"
      : status === "LOADING"
        ? "위험구역을 산출하고 있습니다…"
        : status === "FAILED"
          ? "위험구역을 산출할 수 없습니다 · 데이터 상태 확인"
          : "현재 기준 위험구역 없음";

  return (
    <div
      className="rounded-[12px] border border-[var(--border-soft)] bg-white px-5 py-12 text-center text-[14px] font-bold text-[var(--text-muted)]"
      role="status"
    >
      {message}
    </div>
  );
}
