import { AlertTriangle, MapPinned, Route } from "lucide-react";
import type { ReactNode } from "react";

import type { AggregatedRiskZone } from "@/lib/ops/aggregateRiskZones";
import { RISK_META, riskClass } from "@/lib/risk";

export function OpsDetailPanel({ zone }: { zone: AggregatedRiskZone | null }) {
  if (!zone) {
    return (
      <div>
        <h3 className="text-[16px] font-extrabold">위험지역 상세</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
          표에서 위험지역을 선택하면 영향 대피소와 통제 후보 도로가 표시됩니다.
        </p>
      </div>
    );
  }

  const colors = riskClass(zone.level);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-1 text-[12px] font-extrabold"
            style={{ background: colors.bg, color: colors.text }}
          >
            {RISK_META[zone.level].label}
          </span>
          <span className="text-[12px] font-bold text-[var(--text-subtle)]">
            영향 {zone.affectedPeople.toLocaleString()}명
          </span>
        </div>
        <h3 className="mt-2 text-[18px] font-extrabold leading-snug">{zone.name}</h3>
      </div>

      <DetailSection icon={AlertTriangle} title="위험요인">
        {zone.reasons.length > 0 ? (
          <ul className="space-y-1">
            {zone.reasons.map((reason) => (
              <li key={reason} className="text-[13px] text-[var(--text-muted)]">
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyDetail>현재 확인된 위험요인 없음</EmptyDetail>
        )}
      </DetailSection>

      <DetailSection icon={MapPinned} title="영향 대피소">
        {zone.impactShelters.length > 0 ? (
          <ul className="space-y-2">
            {zone.impactShelters.map((shelter) => (
              <li key={shelter.id}>
                <div className="text-[13px] font-bold">{shelter.name}</div>
                <div className="text-[12px] text-[var(--text-subtle)] tnum">
                  수용 {shelter.capacity.toLocaleString()}명 · {shelter.status}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyDetail>영향 대피소 없음</EmptyDetail>
        )}
      </DetailSection>

      <DetailSection icon={Route} title="통제 후보 도로">
        {zone.controlRoads.length > 0 ? (
          <ul className="space-y-1">
            {zone.controlRoads.map((road) => (
              <li key={road} className="text-[13px] text-[var(--text-muted)]">
                {road}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyDetail>현재 통제 도로 없음</EmptyDetail>
        )}
      </DetailSection>
    </div>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-[var(--text-subtle)]">{children}</p>;
}

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof AlertTriangle;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-[var(--border-soft)] bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-extrabold">
        <Icon size={15} className="text-[var(--primary)]" aria-hidden />
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}
