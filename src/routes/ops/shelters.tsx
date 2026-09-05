import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { OpsLayout } from "@/components/ops/OpsLayout";
import { useShelters } from "@/hooks/useShelters";
import { useScenario } from "@/store/scenario";
import { displayShelterStatus, toShelterOperation } from "@/lib/shelters/operationStatus";
import type { ShelterStatus } from "@/lib/types";

const SHELTER_STATUS_LABEL: Record<ShelterStatus, string> = {
  OPERATING: "운영중",
  CHECK_REQUIRED: "확인필요",
  EXCLUDED: "침수대피 제외",
};

export const Route = createFileRoute("/ops/shelters")({
  head: () => ({
    meta: [{ title: "대피소 — 현장정보" }],
  }),
  component: OpsSheltersPage,
});

function OpsSheltersPage() {
  const { origin } = useScenario();
  const { shelters, isLoading, error } = useShelters(origin);

  const operations = useMemo(
    () => shelters.slice(0, 12).map((shelter) => toShelterOperation(shelter, null)),
    [shelters],
  );

  return (
    <OpsLayout
      title="대피소"
      description="대피소 운영 상태와 수용 규모를 한 화면에서 확인합니다."
      detail={
        <p className="text-[13px] text-[var(--text-muted)]">
          {isLoading ? "데이터 로딩 중..." : "대피소 상세 패널 준비 중"}
        </p>
      }
    >
      {isLoading ? (
        <ShelterStatusMessage>대피소 데이터를 불러오고 있습니다…</ShelterStatusMessage>
      ) : error ? (
        <ShelterStatusMessage>대피소 데이터를 불러오지 못했습니다</ShelterStatusMessage>
      ) : operations.length === 0 ? (
        <ShelterStatusMessage>현재 표시할 대피소가 없습니다</ShelterStatusMessage>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {operations.map((shelter) => {
            const displayStatus = displayShelterStatus(shelter.status, shelter.checkedAt);

            return (
              <article
                key={shelter.id}
                className="min-w-0 rounded-[8px] border border-[var(--border-soft)] bg-white p-4"
              >
                <h3 className="text-[15px] font-extrabold">{shelter.name}</h3>
                <p className="mt-1 truncate text-[12px] text-[var(--text-muted)]">
                  {shelter.address}
                </p>
                <div className="mt-3 text-[12px] font-bold text-[var(--text-subtle)] tnum">
                  수용 {shelter.capacity.toLocaleString()}명 · {SHELTER_STATUS_LABEL[displayStatus]}
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-subtle)]">
                  최근 확인 {shelter.checkedAt ?? "확실한 정보 없음"} · 출처 {shelter.source}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </OpsLayout>
  );
}

function ShelterStatusMessage({ children }: { children: string }) {
  return (
    <div
      className="rounded-[12px] border border-[var(--border-soft)] bg-white px-5 py-12 text-center text-[14px] font-bold text-[var(--text-muted)]"
      role="status"
    >
      {children}
    </div>
  );
}
