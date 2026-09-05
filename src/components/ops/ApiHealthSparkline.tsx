import { API_STATUS_META, type ApiHealthMetricPoint } from "@/hooks/useApiStatus";

const WIDTH = 96;
const HEIGHT = 28;
const PADDING = 2;

export function ApiHealthSparkline({
  name,
  metrics,
}: {
  name: string;
  metrics: ApiHealthMetricPoint[];
}) {
  const points = metrics.filter(
    (metric): metric is ApiHealthMetricPoint & { response_time_ms: number } =>
      typeof metric.response_time_ms === "number" && Number.isFinite(metric.response_time_ms),
  );
  if (points.length < 2) {
    return <span className="text-[11px] text-[var(--text-subtle)]">수집 중</span>;
  }

  const values = points.map((metric) => metric.response_time_ms);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const path = points
    .map((metric, index) => {
      const x = PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
      const y =
        HEIGHT - PADDING - ((metric.response_time_ms - min) / range) * (HEIGHT - PADDING * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const latest = points.at(-1)!;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-7 w-24"
      role="img"
      aria-label={`${name} 24시간 응답시간 추이`}
    >
      <title>{`${name} 응답시간 ${min}~${max}ms`}</title>
      <path
        d={path}
        fill="none"
        stroke={API_STATUS_META[latest.status].text}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
