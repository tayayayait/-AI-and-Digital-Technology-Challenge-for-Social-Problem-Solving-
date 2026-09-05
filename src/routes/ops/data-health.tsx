import { createFileRoute } from "@tanstack/react-router";
import { Activity, AlertCircle, Database } from "lucide-react";

import { ApiStatusCard } from "@/components/ops/ApiStatusCard";
import { ApiStatusTable } from "@/components/ops/ApiStatusTable";
import { OpsLayout } from "@/components/ops/OpsLayout";
import {
  API_STATUS_META,
  summarizeApiHealth,
  useApiHealthHistory,
  useMeasuredApiHealthItems,
} from "@/hooks/useApiStatus";
import { calculateApiObservability } from "@/lib/ops/monitoring";

export const Route = createFileRoute("/ops/data-health")({
  head: () => ({
    meta: [{ title: "데이터 상태 — 현장정보" }],
  }),
  component: DataHealthPage,
});

function DataHealthPage() {
  const items = useMeasuredApiHealthItems();
  const history = useApiHealthHistory();
  const summary = summarizeApiHealth(items);
  const observability = calculateApiObservability(items);

  return (
    <OpsLayout
      title="데이터 상태"
      description="최근 실제 호출 결과 · 5분 간격 자동 기록 · 24시간 추이"
      detail={<DataHealthDetail summary={summary} observability={observability} />}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 3).map((item) => (
          <ApiStatusCard key={item.name} item={item} />
        ))}
      </div>
      <section className="mt-4">
        <div className="mb-2">
          <h3 className="text-[16px] font-extrabold">API별 최신 상태</h3>
          <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
            아직 호출되지 않은 API는 “미조회”로 표시합니다.
          </p>
        </div>
        <ApiStatusTable items={items} historyBySource={history.grouped} />
        <p className="mt-3 text-[12px] text-[var(--text-subtle)]" aria-live="polite">
          {history.isLoading
            ? "24시간 추이를 불러오고 있습니다."
            : history.error
              ? history.error
              : "실제 호출 결과는 소스별 5분에 한 번 자동 기록됩니다."}
        </p>
      </section>
    </OpsLayout>
  );
}

function DataHealthDetail({
  summary,
  observability,
}: {
  summary: ReturnType<typeof summarizeApiHealth>;
  observability: ReturnType<typeof calculateApiObservability>;
}) {
  const meta = API_STATUS_META[summary.worst];

  return (
    <div className="space-y-4">
      <div>
        <div
          className="inline-flex rounded px-2 py-1 text-[12px] font-extrabold"
          style={{ background: meta.bg, color: meta.text }}
        >
          종합 {meta.label}
        </div>
        <h3 className="mt-2 text-[18px] font-extrabold">데이터 헬스 요약</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SummaryBox icon={Database} label="전체" value={`${summary.total}개`} />
        <SummaryBox icon={Activity} label="정상" value={`${summary.ok}개`} />
        <SummaryBox icon={AlertCircle} label="대체/지연" value={`${summary.degraded}개`} />
        <SummaryBox icon={AlertCircle} label="실패" value={`${summary.failed}개`} />
        <SummaryBox icon={Database} label="미조회" value={`${summary.unqueried}개`} />
        <SummaryBox
          icon={Activity}
          label="Fallback 비율"
          value={`${observability.fallbackRatePercent}%`}
        />
        <SummaryBox
          icon={Activity}
          label="평균 응답"
          value={
            observability.averageResponseTimeMs == null
              ? "확실한 정보 없음"
              : `${observability.averageResponseTimeMs}ms`
          }
        />
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
        API key가 없는 항목과 대체 데이터 사용 여부도 실제 호출 결과 그대로 표시합니다.
      </p>
    </div>
  );
}

function SummaryBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] bg-[var(--surface-alt)] p-3">
      <Icon size={15} className="text-[var(--primary)]" aria-hidden />
      <div className="mt-2 text-[11px] font-bold text-[var(--text-subtle)]">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold tnum">{value}</div>
    </div>
  );
}
