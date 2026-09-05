import { API_STATUS_META, type ApiHealthStatus } from "@/hooks/useApiStatus";

export function ApiStatusCard({ item }: { item: ApiHealthStatus }) {
  const meta = API_STATUS_META[item.status];

  return (
    <article className="rounded-[8px] border bg-white p-4" style={{ borderColor: meta.border }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-extrabold">{item.name}</div>
          <div className="mt-1 text-[12px] text-[var(--text-subtle)]">
            최근 확인 {item.lastChecked || "확실한 정보 없음"}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
            최근 성공 {item.lastSuccess || "확실한 정보 없음"}
          </div>
        </div>
        <span
          className="rounded px-2 py-1 text-[11px] font-extrabold"
          style={{ background: meta.bg, color: meta.text }}
        >
          {meta.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-[8px] bg-[var(--surface-alt)] p-2">
          <div className="font-bold text-[var(--text-subtle)]">응답시간</div>
          <div className="mt-1 font-extrabold tnum">
            {item.responseTime == null ? "확실한 정보 없음" : `${item.responseTime}ms`}
          </div>
        </div>
        <div className="rounded-[8px] bg-[var(--surface-alt)] p-2">
          <div className="font-bold text-[var(--text-subtle)]">실패 사유</div>
          <div className="mt-1 truncate font-extrabold">{item.lastError || "확실한 정보 없음"}</div>
        </div>
      </div>
    </article>
  );
}
