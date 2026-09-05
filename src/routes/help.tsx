import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useScenario } from "@/store/scenario";
import { DATA_SOURCES } from "@/mocks/data";
import { useRiskAssessment } from "@/hooks/useRiskAssessment";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { useRoutes } from "@/hooks/useRoutes";
import { useShelters } from "@/hooks/useShelters";
import { useTrafficEvents } from "@/hooks/useTrafficEvents";
import { oldestSuccessfulTimestamp } from "@/lib/api/dataTimestamp";
import { formatTimestamp, haversineMeters } from "@/lib/utils";
import type { AiAnswer } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";
import { AI_NOTICE, explainRouteWithGemini } from "@/lib/api/gemini";
import { NotificationConsentCard } from "@/components/notifications/NotificationConsentCard";
import { SpeechSettingsCard } from "@/components/settings/SpeechSettingsCard";
import { AccessibilitySettingsCard } from "@/components/settings/AccessibilitySettingsCard";

const QUICK_Q = [
  "지금 나가도 되나요?",
  "도보와 차량 중 무엇이 안전한가요?",
  "가족에게 보낼 문구를 만들어주세요.",
  "대피소까지 위험한 구간이 있나요?",
  "담당자에게 신고할 내용을 정리해주세요.",
];

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "AI 도움 — 침수퇴로 AI" },
      {
        name: "description",
        content: "재난 상황에서 AI가 즉시 판단을 돕습니다. 공식 안내를 우선하세요.",
      },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  const riskLevel = useScenario((state) => state.riskLevel);
  const origin = useScenario((state) => state.origin);
  const locationStatus = useScenario((state) => state.locationStatus);
  const { dataSources, weather, floodWarningLevel } = useRiskAssessment(origin);
  const dataTimestamp = oldestSuccessfulTimestamp(dataSources) ?? "확실한 정보 없음";
  const region = useReverseGeocode(origin, "");
  const { shelters, isLoading: isSheltersLoading } = useShelters(origin);
  const { events: trafficEvents } = useTrafficEvents(origin);
  const hasSelectedLocation = locationStatus === "GRANTED";
  const routeState = useRoutes({
    origin,
    shelters,
    trafficEvents,
    rainfallMmPerHour: weather?.rainfallMmPerHour,
    floodWarningLevel,
    enabled: hasSelectedLocation && shelters.length > 0,
  });
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState<string | null>(null);

  const nearest = useMemo(
    () =>
      [...shelters]
        .filter((shelter) => shelter.status !== "EXCLUDED")
        .map((shelter) => ({ s: shelter, d: haversineMeters(origin, shelter.position) }))
        .sort((a, b) => a.d - b.d)[0],
    [origin, shelters],
  );
  const recommendedRoute = routeState.routes.find((route) => route.status === "RECOMMENDED");
  const routeShelter = shelters.find((shelter) => shelter.id === recommendedRoute?.shelterId);
  const questionsDisabled =
    loading || !hasSelectedLocation || isSheltersLoading || shelters.length === 0;

  async function handleAsk(q: string) {
    if (questionsDisabled) return;

    setCurrentQ(q);
    setLoading(true);
    setAnswer(null);
    const shelter = routeShelter ?? nearest?.s;
    const routeReasons = recommendedRoute?.riskReasons ?? [];
    const res = await explainRouteWithGemini({
      question: q,
      riskLevel,
      recommendedRouteId: recommendedRoute?.id,
      recommendedShelterId: shelter?.id,
      shelterName: shelter?.name ?? "가장 가까운 대피소",
      distanceMeters: recommendedRoute?.distanceMeters ?? nearest?.d,
      routeReasons,
      dataTimestamp,
      allowedProperNouns: [
        recommendedRoute?.name ?? "",
        shelter?.name ?? "",
        shelter?.address ?? "",
        region,
        ...routeReasons,
      ].filter(Boolean),
    });
    setAnswer(res);
    setLoading(false);
  }

  return (
    <div className="flex flex-col flex-1 px-4 py-3">
      <h2 className="text-[20px] font-extrabold">무엇을 도와드릴까요?</h2>
      <p className="text-[13px] text-[var(--text-muted)] mt-1">
        재난 상황에서는 아래 추천 질문을 우선 사용하세요.
      </p>

      <div className="mt-4">
        <NotificationConsentCard />
      </div>

      <div className="mt-3">
        <SpeechSettingsCard />
      </div>

      <div className="mt-3">
        <AccessibilitySettingsCard />
      </div>

      {!hasSelectedLocation ? (
        <div
          role="alert"
          className="mt-3 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900"
        >
          현재 위치 또는 주소를 먼저 설정해야 실제 주변 대피 정보를 안내할 수 있습니다.{" "}
          <Link to="/" className="font-extrabold underline underline-offset-2">
            홈에서 위치 설정
          </Link>
        </div>
      ) : isSheltersLoading ? (
        <p className="mt-3 text-[13px] text-[var(--text-muted)]" role="status">
          주변 대피소를 확인하고 있습니다…
        </p>
      ) : shelters.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--text-muted)]" role="status">
          현재 위치 주변의 대피소를 확인할 수 없습니다.
        </p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-2">
        {QUICK_Q.map((q) => (
          <li key={q}>
            <button
              onClick={() => handleAsk(q)}
              disabled={questionsDisabled}
              aria-label={q}
              className="w-full text-left rounded-[10px] border border-[var(--border)] bg-white px-4 font-bold text-[14px] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ minHeight: 44, padding: "10px 14px" }}
            >
              {q}
            </button>
          </li>
        ))}
      </ul>

      {loading && (
        <div className="mt-5 flex items-center gap-2 text-[var(--text-muted)] text-[13px]">
          <Loader2 className="animate-spin" size={16} />
          AI가 판단 중입니다…
        </div>
      )}

      {answer && !loading && <AnswerCard q={currentQ ?? ""} a={answer} />}

      <section className="mt-6 pt-4 border-t border-[var(--border-soft)]">
        <h3 className="text-[14px] font-bold mb-2">사용 데이터 출처</h3>
        <ul className="text-[12px] text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-1">
          {DATA_SOURCES.map((d) => (
            <li key={d}>· {d}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AnswerCard({ q, a }: { q: string; a: AiAnswer }) {
  return (
    <article
      className="mt-5 bg-white border rounded-[12px] p-4"
      style={{ borderColor: "var(--border-soft)" }}
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5 text-[var(--primary)]">
        <Sparkles size={14} />
        <span className="text-[12px] font-extrabold">
          {a.verified ? "AI 판단" : "AI 답변 미생성 — 규칙 기반"}
        </span>
      </div>
      <h3 className="text-[16px] font-extrabold mt-1">{q}</h3>
      <div className="mt-3">
        <div className="text-[12px] text-[var(--text-subtle)]">판단</div>
        <div className="text-[15px] font-extrabold mt-0.5">{a.judgementLabel}</div>
      </div>
      <div className="mt-3">
        <div className="text-[12px] text-[var(--text-subtle)]">이유</div>
        <ul className="mt-1 list-disc pl-5 text-[14px] text-[var(--text)] space-y-1">
          {a.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {a.basis.map((b) => (
          <span
            key={b}
            className="text-[11px] rounded px-2 py-0.5"
            style={{ background: "var(--surface-alt)", color: "var(--text-muted)" }}
          >
            {b}
          </span>
        ))}
      </div>
      <div className="mt-3 text-[12px] text-[var(--text-subtle)] tnum">
        기준 {formatTimestamp(a.timestamp)}
      </div>
      <p className="mt-3 pt-3 border-t border-[var(--border-soft)] text-[12px] text-[var(--text-subtle)] leading-relaxed">
        {AI_NOTICE}
      </p>
    </article>
  );
}
