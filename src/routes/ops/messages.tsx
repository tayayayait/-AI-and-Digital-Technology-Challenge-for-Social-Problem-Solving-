import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { NoticeGenerator } from "@/components/ops/NoticeGenerator";
import { OpsLayout } from "@/components/ops/OpsLayout";
import { useDynamicRiskZones } from "@/hooks/useDynamicRiskZones";
import { aggregateRiskZones } from "@/lib/ops/aggregateRiskZones";
import { recordAuditLog } from "@/lib/ops/audit";

export const Route = createFileRoute("/ops/messages")({
  head: () => ({
    meta: [{ title: "주민 안내문 — 현장정보" }],
  }),
  component: OpsMessagesPage,
});

function OpsMessagesPage() {
  const [generated, setGenerated] = useState("");
  const [verified, setVerified] = useState(false);
  const {
    riskZones,
    status,
    region,
    shelters,
    trafficEvents,
    dataTimestamp: sourceTimestamp,
  } = useDynamicRiskZones();
  const zones = useMemo(
    () => aggregateRiskZones(riskZones, shelters, trafficEvents),
    [riskZones, shelters, trafficEvents],
  );
  const zone = zones[0];
  const dataTimestamp = sourceTimestamp ?? "확실한 정보 없음";
  const recommendedAction = "침수 위험 구간을 피하고 지정 대피소로 이동하세요.";
  const allowedProperNouns = zone
    ? Array.from(
        new Set([
          region,
          zone.name,
          ...zone.impactShelters.map((shelter) => shelter.name),
          ...zone.controlRoads,
        ]),
      )
    : [region];

  return (
    <OpsLayout
      title="주민 안내문"
      description="위험지역과 추천 행동을 바탕으로 주민 안내문을 생성합니다."
      detail={<NoticePreview notice={generated} verified={verified} />}
    >
      {status === "READY" && zone ? (
        <NoticeGenerator
          region={region}
          riskLevel={zone.level}
          riskFactors={zone.reasons}
          recommendedAction={recommendedAction}
          dataTimestamp={dataTimestamp}
          allowedProperNouns={allowedProperNouns}
          onGenerated={(notice, isVerified) => {
            setGenerated(notice);
            setVerified(isVerified);
            void recordAuditLog({
              action: "NOTICE_GENERATION",
              entityType: "ops_notice",
              entityId: zone.id,
              summary: isVerified ? "Gemini 안내문 생성" : "규칙 기반 안내문 생성",
              metadata: {
                region,
                riskZone: zone.name,
                riskLevel: zone.level,
                verified: isVerified,
                length: notice.length,
                dataTimestamp,
              },
            });
          }}
        />
      ) : (
        <MessageTargetStatus status={status === "READY" ? "EMPTY" : status} />
      )}
    </OpsLayout>
  );
}

function MessageTargetStatus({
  status,
}: {
  status: ReturnType<typeof useDynamicRiskZones>["status"];
}) {
  const message =
    status === "IDLE"
      ? "관심 지역을 먼저 설정하세요"
      : status === "LOADING"
        ? "안내 대상을 산출하고 있습니다…"
        : status === "FAILED"
          ? "안내 대상을 산출할 수 없습니다 · 데이터 상태 확인"
          : "현재 기준 안내 대상 위험구역 없음";

  return (
    <div
      className="rounded-[12px] border border-[var(--border-soft)] bg-white px-5 py-12 text-center text-[14px] font-bold text-[var(--text-muted)]"
      role="status"
    >
      {message}
    </div>
  );
}

function NoticePreview({ notice, verified }: { notice: string; verified: boolean }) {
  if (!notice) {
    return (
      <p className="text-[13px] text-[var(--text-muted)]">
        안내문을 생성하면 이 영역에 검증 상태와 초안이 표시됩니다.
      </p>
    );
  }

  return (
    <div>
      <div className="text-[12px] font-extrabold text-[var(--text-subtle)]">
        {verified ? "Gemini 생성·검증 완료" : "규칙 기반 안내문"}
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded-[8px] bg-[var(--surface-alt)] p-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
        {notice}
      </pre>
    </div>
  );
}
