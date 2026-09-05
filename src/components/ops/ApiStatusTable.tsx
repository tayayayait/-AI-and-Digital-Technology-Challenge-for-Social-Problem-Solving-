import {
  API_STATUS_META,
  type ApiHealthMetricPoint,
  type ApiHealthStatus,
} from "@/hooks/useApiStatus";
import { ApiHealthSparkline } from "./ApiHealthSparkline";

export function ApiStatusTable({
  items,
  historyBySource = {},
}: {
  items: ApiHealthStatus[];
  historyBySource?: Record<string, ApiHealthMetricPoint[]>;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[var(--border-soft)] bg-white">
      <div className="max-h-[460px] overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-[var(--surface-alt)] text-[12px] text-[var(--text-muted)]">
            <tr className="h-11">
              <th className="px-4 text-left font-extrabold">API</th>
              <th className="px-3 text-left font-extrabold">상태</th>
              <th className="px-3 text-left font-extrabold">최근 확인 / 성공</th>
              <th className="px-3 text-right font-extrabold">응답시간</th>
              <th className="px-3 text-left font-extrabold">24시간 추이</th>
              <th className="px-4 text-left font-extrabold">실패 사유</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const meta = API_STATUS_META[item.status];
              return (
                <tr
                  key={item.name}
                  className="h-11 border-t border-[var(--border-soft)] hover:bg-[#F8FAFC]"
                >
                  <td className="px-4 font-bold">{item.name}</td>
                  <td className="px-3">
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-extrabold"
                      style={{ background: meta.bg, color: meta.text }}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 tnum">
                    <div>{item.lastChecked || "확실한 정보 없음"}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
                      성공 {item.lastSuccess || "확실한 정보 없음"}
                    </div>
                  </td>
                  <td className="px-3 text-right tnum">
                    {item.responseTime == null ? "확실한 정보 없음" : `${item.responseTime}ms`}
                  </td>
                  <td className="px-3">
                    <ApiHealthSparkline
                      name={item.name}
                      metrics={historyBySource[item.name] ?? []}
                    />
                  </td>
                  <td className="max-w-[320px] truncate px-4 text-[var(--text-muted)]">
                    {item.lastError || "확실한 정보 없음"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
