import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BrainCircuit,
  Car,
  ChevronRight,
  Footprints,
  MapPin,
  Navigation,
  ShieldAlert,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useMemo } from "react";

import { useSpeech } from "@/hooks/useSpeech";
import { freshness, relativeAge } from "@/lib/api/dataTimestamp";
import { RISK_META, riskClass } from "@/lib/risk";
import type {
  AiAnswer,
  AiGuidanceItem,
  RiskLevel,
  RouteResult,
  SafetyFact,
  Shelter,
} from "@/lib/types";
import { formatDistance, formatTimestamp } from "@/lib/utils";
import { useScenario } from "@/store/scenario";

export type ApiStatus = "OK" | "STALE" | "FAILED" | "FALLBACK";

export interface AlternativeShelterView {
  shelter: Shelter;
  distanceMeters: number;
  distanceKind: "ROUTE" | "STRAIGHT_LINE";
  routeVerified: boolean;
}

export interface ActionFirstGuideProps {
  level: RiskLevel;
  riskScore?: number;
  disasterTypes?: string[];
  shelter?: Shelter;
  distanceMeters?: number;
  distanceKind?: "ROUTE" | "STRAIGHT_LINE";
  route?: RouteResult;
  timestamp: string | null;
  apiStatus?: ApiStatus;
  aiAdvice?: AiAnswer;
  isAiLoading?: boolean;
  shelterLabel?: string;
  offlineAction?: { title: string; body: string };
  facts?: SafetyFact[];
  alternativeShelters?: AlternativeShelterView[];
}

const EMPTY_FACTS: SafetyFact[] = [];
const EMPTY_DISASTER_TYPES: string[] = [];
const EMPTY_ALTERNATIVES: AlternativeShelterView[] = [];

const API_STATUS_LABEL: Record<ApiStatus, string> = {
  OK: "정상",
  STALE: "지연 데이터",
  FAILED: "연동 실패",
  FALLBACK: "대체 데이터",
};

const SHELTER_STATUS_LABEL: Record<Shelter["status"], string> = {
  OPERATING: "운영중",
  CHECK_REQUIRED: "운영 확인 필요",
  EXCLUDED: "이용 제외 권고",
};

const defaultDisasterActions = (disasterTypes: string[]): AiGuidanceItem[] => {
  const joined = disasterTypes.join(" ");
  if (joined.includes("침수") || joined.includes("호우")) {
    return [
      {
        text: "침수된 길과 지하공간에는 진입하지 말고 높은 지상 경로로 우회하세요.",
        sourceKind: "GENERAL_KNOWLEDGE",
        evidenceRefs: [],
      },
    ];
  }
  return [
    {
      text: "지자체 대피명령과 경찰·소방의 현장 통제를 가장 먼저 따르세요.",
      sourceKind: "GENERAL_KNOWLEDGE",
      evidenceRefs: [],
    },
  ];
};

function SourceBadge({
  item,
  factMap,
}: {
  item: AiGuidanceItem;
  factMap: ReadonlyMap<string, SafetyFact>;
}) {
  const referencedFacts = item.evidenceRefs
    .map((reference) => factMap.get(reference))
    .filter((fact): fact is SafetyFact => Boolean(fact));
  const sources = [...new Set(referencedFacts.map((fact) => fact.source))];
  const delayed =
    referencedFacts.length === 0 || referencedFacts.some((fact) => fact.status !== "LIVE");
  const isLive = item.sourceKind === "LIVE_DATA";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
      <span
        className={
          isLive
            ? "rounded-full bg-blue-50 px-2 py-1 text-blue-700"
            : "rounded-full bg-slate-100 px-2 py-1 text-slate-600"
        }
      >
        {isLive ? (delayed ? "지연·저장 데이터" : "실시간 데이터") : "일반 안전 지식"}
      </span>
      {sources.length > 0 ? (
        <span className="text-[var(--text-subtle)]">{sources.slice(0, 2).join(" · ")}</span>
      ) : null}
      {isLive && delayed ? <span className="text-amber-700">· 현재 상태 재확인</span> : null}
    </div>
  );
}

function GuidanceList({
  items,
  factMap,
  accent = false,
}: {
  items: AiGuidanceItem[];
  factMap: ReadonlyMap<string, SafetyFact>;
  accent?: boolean;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li
          key={`${item.sourceKind}-${item.text}-${index}`}
          className={
            accent
              ? "rounded-[10px] border border-blue-200 bg-blue-50/70 px-3.5 py-3"
              : "rounded-[10px] border border-[var(--border-soft)] bg-[var(--surface-alt)] px-3.5 py-3"
          }
        >
          <p className="text-[14px] font-bold leading-relaxed text-[var(--text)]">{item.text}</p>
          <SourceBadge item={item} factMap={factMap} />
        </li>
      ))}
    </ul>
  );
}

function SectionTitle({
  icon,
  step,
  title,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
        {icon}
      </span>
      <div>
        <div className="text-[10px] font-black tracking-[0.12em] text-[var(--text-subtle)]">
          {step}
        </div>
        <h2 className="text-[17px] font-black leading-tight text-[var(--text)]">{title}</h2>
      </div>
    </div>
  );
}

export function ActionFirstGuide({
  level,
  riskScore,
  disasterTypes = EMPTY_DISASTER_TYPES,
  shelter,
  distanceMeters,
  distanceKind = "STRAIGHT_LINE",
  route,
  timestamp,
  apiStatus = "FALLBACK",
  aiAdvice,
  isAiLoading = false,
  shelterLabel = "추천 대피소",
  offlineAction,
  facts = EMPTY_FACTS,
  alternativeShelters = EMPTY_ALTERNATIVES,
}: ActionFirstGuideProps) {
  const meta = RISK_META[level];
  const colors = riskClass(level);
  const isCritical = level === "CRITICAL";
  const speechEnabled = useScenario((state) => state.speechEnabled);
  const timestampFreshness = freshness(timestamp);
  const timestampLabel = timestamp
    ? formatTimestamp(timestamp) + " (" + relativeAge(timestamp) + ")"
    : "확실한 정보 없음";

  const factMap = useMemo(() => {
    const mapped = new Map(facts.map((fact) => [fact.id, fact]));
    const derivedStatus: SafetyFact["status"] =
      apiStatus === "OK" ? "LIVE" : apiStatus === "STALE" ? "DELAYED" : "FALLBACK";

    if (![...mapped.values()].some((fact) => fact.kind === "RISK")) {
      mapped.set("risk-current", {
        id: "risk-current",
        kind: "RISK",
        text:
          "현재 위험도 " +
          meta.label +
          (riskScore == null ? "" : ", " + Math.round(riskScore) + "점"),
        source: "재난·기상·지도 API 종합",
        observedAt: timestamp,
        status: derivedStatus,
      });
    }

    if (shelter && ![...mapped.values()].some((fact) => fact.kind === "SHELTER")) {
      mapped.set("shelter-current", {
        id: "shelter-current",
        kind: "SHELTER",
        text: shelter.name + " · " + SHELTER_STATUS_LABEL[shelter.status],
        source: "대피소 API",
        observedAt: timestamp,
        status: derivedStatus,
      });
    }

    if (route && ![...mapped.values()].some((fact) => fact.kind === "ROUTE")) {
      mapped.set("route-current", {
        id: "route-current",
        kind: "ROUTE",
        text: route.name + " · 안전점수 " + route.safetyScore + "점",
        source: route.mode === "WALK" ? "TMAP 보행 경로" : "NAVER 차량 경로",
        observedAt: timestamp,
        status: derivedStatus,
      });
    }

    if (offlineAction) {
      mapped.set("offline-action", {
        id: "offline-action",
        kind: "RISK",
        text: offlineAction.title + " · " + offlineAction.body,
        source: "저장된 마지막 안내",
        observedAt: timestamp,
        status: "FALLBACK",
      });
    }

    return mapped;
  }, [apiStatus, facts, meta.label, offlineAction, riskScore, route, shelter, timestamp]);

  const riskFact = [...factMap.values()].find((fact) => fact.kind === "RISK");
  const routeFact = [...factMap.values()].find((fact) => fact.kind === "ROUTE");
  const shelterFact = [...factMap.values()].find((fact) => fact.kind === "SHELTER");

  const riskSummary: AiGuidanceItem =
    aiAdvice?.riskSummary ??
    ({
      text:
        "재난·기상·지도 데이터를 종합한 현재 위험도는 " +
        meta.label +
        (riskScore == null ? " 단계입니다." : " " + Math.round(riskScore) + "점입니다."),
      sourceKind: "LIVE_DATA",
      evidenceRefs: riskFact ? [riskFact.id] : [],
    } satisfies AiGuidanceItem);

  const immediateActions: AiGuidanceItem[] = offlineAction
    ? [
        {
          text: offlineAction.body,
          sourceKind: "LIVE_DATA",
          evidenceRefs: ["offline-action"],
        },
      ]
    : aiAdvice?.immediateActions?.length
      ? aiAdvice.immediateActions
      : [
          {
            text: meta.actionBody,
            sourceKind: "GENERAL_KNOWLEDGE",
            evidenceRefs: [],
          },
        ];

  const tailoredDisasterActions = aiAdvice?.disasterActions?.length
    ? aiAdvice.disasterActions
    : defaultDisasterActions(disasterTypes);

  const movementWarnings: AiGuidanceItem[] = aiAdvice?.movementWarnings?.length
    ? aiAdvice.movementWarnings
    : [
        {
          text: "하천변·지하차도·지하공간·저지대는 물이 보이지 않아도 피하고, 통제선이 있으면 우회하세요.",
          sourceKind: "GENERAL_KNOWLEDGE",
          evidenceRefs: [],
        },
      ];

  const recommendedShelterReason: AiGuidanceItem =
    aiAdvice?.recommendedShelterReason ??
    (route && routeFact
      ? {
          text:
            "현재 확인된 " +
            (route.mode === "WALK" ? "보행" : "차량") +
            " 경로와 연결되며 경로 위험요소를 함께 비교할 수 있습니다.",
          sourceKind: "LIVE_DATA",
          evidenceRefs: [routeFact.id],
        }
      : shelterFact
        ? {
            text: "대피소 API에서 확인된 후보입니다. 출발 전 운영 여부와 실제 이동 경로를 다시 확인하세요.",
            sourceKind: "LIVE_DATA",
            evidenceRefs: [shelterFact.id],
          }
        : {
            text: "현재 위치에서 가까운 지상 대피시설 후보이며, 출발 전 운영 여부와 실제 경로를 확인해야 합니다.",
            sourceKind: "GENERAL_KNOWLEDGE",
            evidenceRefs: [],
          });

  const displayedMovementWarnings =
    route && routeFact && route.riskReasons.length > 0
      ? [
          ...movementWarnings,
          ...route.riskReasons
            .filter((reason) => !movementWarnings.some((item) => item.text.includes(reason)))
            .slice(0, 2)
            .map(
              (reason): AiGuidanceItem => ({
                text: reason,
                sourceKind: "LIVE_DATA",
                evidenceRefs: [routeFact.id],
              }),
            ),
        ]
      : movementWarnings;
  const alternativeReasonByShelterId = new Map(
    (aiAdvice?.alternativeShelterReasons ?? []).map((item) => [item.shelterId, item.reason]),
  );

  const actionTitle = offlineAction
    ? offlineAction.title
    : aiAdvice && (aiAdvice.verified !== false || aiAdvice.immediateActions?.length)
      ? aiAdvice.judgementLabel
      : meta.actionTitle;
  const actionBody = immediateActions.map((item) => item.text).join(" ");
  const titleSeparator = /[.!?。]$/.test(actionTitle.trim()) ? " " : ". ";
  const speechText = (actionTitle + titleSeparator + actionBody).trim();
  const { supported: speechSupported, speakNow } = useSpeech({
    text: speechText,
    level,
    autoEnabled: speechEnabled,
  });

  return (
    <section
      aria-label={isCritical ? "긴급 추천 행동" : "추천 행동"}
      className="overflow-hidden rounded-t-[18px] border-x border-t bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)]"
      style={{
        borderColor: isCritical ? "#dc2626" : "var(--border-soft)",
        borderTopWidth: isCritical ? 4 : 1,
      }}
    >
      <section
        aria-label="현재 위험도"
        className="px-4 pb-4 pt-4"
        style={{ background: isCritical ? "#fff7f7" : colors.bg }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div
              className="text-[10px] font-black tracking-[0.12em]"
              style={{ color: colors.text }}
            >
              STEP 1 · 현재 위험도
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-[26px] font-black leading-none" style={{ color: colors.text }}>
                {meta.label}
              </h2>
              {riskScore != null ? (
                <span className="tnum text-[15px] font-extrabold" style={{ color: colors.text }}>
                  {Math.round(riskScore)}점
                </span>
              ) : null}
            </div>
          </div>
          <span
            className="rounded-full border bg-white/80 px-2.5 py-1 text-[11px] font-black"
            style={{ borderColor: colors.text, color: colors.text }}
          >
            데이터 {API_STATUS_LABEL[apiStatus]}
          </span>
        </div>

        {disasterTypes.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="관련 재난 유형">
            {disasterTypes.map((disasterType) => (
              <span
                key={disasterType}
                className="rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-extrabold text-[var(--text-muted)]"
              >
                {disasterType}
              </span>
            ))}
          </div>
        ) : null}

        <p className="text-[15px] font-extrabold leading-relaxed text-[var(--text)]">
          {riskSummary.text}
        </p>
        <SourceBadge item={riskSummary} factMap={factMap} />
        <div className="mt-3 text-[11px] text-[var(--text-subtle)] tnum">
          데이터 기준 {timestampLabel}
          {timestampFreshness === "STALE" ? (
            <span className="ml-2 rounded bg-white/80 px-1.5 py-0.5 font-bold text-slate-600">
              데이터 지연
            </span>
          ) : null}
        </div>
      </section>

      <section
        aria-label="지금 해야 할 행동"
        className="border-t border-[var(--border-soft)] px-4 py-5"
      >
        <div className="flex items-start justify-between gap-3">
          <SectionTitle
            icon={<ShieldAlert size={17} aria-hidden />}
            step="STEP 2"
            title="지금 해야 할 행동"
          />
          {speechSupported && speechText ? (
            <button
              type="button"
              aria-label="추천 행동 음성으로 듣기"
              onClick={speakNow}
              className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-white px-3 text-[12px] font-extrabold text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            >
              <Volume2 size={16} aria-hidden />
              음성 듣기
            </button>
          ) : null}
        </div>

        <div
          className={
            isCritical
              ? "mb-3 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3"
              : "mb-3 rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3"
          }
        >
          <h3 className="text-[19px] font-black leading-snug text-[var(--text)]">{actionTitle}</h3>
        </div>

        <GuidanceList items={immediateActions} factMap={factMap} accent />

        {isAiLoading ? (
          <div
            role="status"
            className="mt-3 flex items-center gap-2 rounded-[10px] bg-violet-50 px-3 py-2.5 text-[12px] font-bold text-violet-700"
          >
            <BrainCircuit size={16} className="animate-pulse" aria-hidden />
            Gemini가 세부 근거를 분석 중입니다. 위 기본 행동은 즉시 따르세요.
          </div>
        ) : aiAdvice?.verified ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-violet-700">
            <Sparkles size={14} aria-hidden />
            Gemini 해석 · 입력 근거 연결 확인
          </div>
        ) : aiAdvice ? (
          <div className="mt-3 rounded-[10px] bg-slate-100 px-3 py-2.5 text-[12px] font-bold text-slate-600">
            Gemini 응답을 검증할 수 없어 규칙 기반 안전 안내를 표시합니다.
          </div>
        ) : null}

        <div className="mt-4 border-t border-dashed border-[var(--border)] pt-4">
          <h3 className="mb-2 text-[13px] font-black text-[var(--text)]">
            {disasterTypes.length > 0
              ? disasterTypes.join(" · ") + " 맞춤 행동요령"
              : "재난 맞춤 행동요령"}
          </h3>
          <GuidanceList items={tailoredDisasterActions} factMap={factMap} />
        </div>
      </section>

      <section aria-label="추천 대피소" className="border-t border-[var(--border-soft)] px-4 py-5">
        <SectionTitle icon={<MapPin size={17} aria-hidden />} step="STEP 3" title="추천 대피소" />

        {shelter ? (
          <>
            <div className="rounded-[14px] border-2 border-blue-500 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-black text-blue-700">{shelterLabel}</span>
                <span
                  className={
                    shelter.status === "OPERATING"
                      ? "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700"
                      : "rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700"
                  }
                >
                  {SHELTER_STATUS_LABEL[shelter.status]}
                </span>
              </div>
              <h3 className="text-[18px] font-black leading-snug text-[var(--text)]">
                {shelter.name}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                {shelter.address}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-extrabold">
                {distanceMeters != null ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 tnum">
                    {distanceKind === "ROUTE"
                      ? "경로 거리 " + formatDistance(distanceMeters)
                      : "직선거리 " + formatDistance(distanceMeters) + " · 경로 미확인"}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    거리 확인 필요
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {shelter.underground ? "지하 시설" : "지상 시설"}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {shelter.type}
                </span>
              </div>

              {route ? (
                <div className="mt-3 rounded-[10px] bg-slate-50 px-3 py-2.5 text-[12px] text-slate-700">
                  <div className="flex items-center justify-between gap-2 font-black">
                    <span>{route.mode === "WALK" ? "도보 경로" : "차량 경로"}</span>
                    <span className="tnum">
                      {routeFact?.status === "LIVE" &&
                      !route.riskReasons.some((reason) => /실패|부족|미확인/.test(reason))
                        ? "안전점수 " + route.safetyScore + "점"
                        : "안전성 확인 제한"}
                      {" · 약 " + Math.max(1, Math.round(route.durationSeconds / 60)) + "분"}
                    </span>
                  </div>
                  {route.riskReasons.length > 0 ? (
                    <p className="mt-1.5 leading-relaxed text-[var(--text-muted)]">
                      경로 확인: {route.riskReasons.slice(0, 2).join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-amber-50 px-3 py-2.5 text-[12px] font-bold leading-relaxed text-amber-800">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                  아직 실제 경로가 확인되지 않았습니다. 출발 전에 경로 위험요소를 확인하세요.
                </div>
              )}
            </div>

            <div className="mt-3">
              <h3 className="mb-2 text-[13px] font-black text-[var(--text)]">
                이곳을 추천하는 이유
              </h3>
              <GuidanceList items={[recommendedShelterReason]} factMap={factMap} />
            </div>

            {!isCritical ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  to="/routes"
                  search={{ mode: "WALK" }}
                  className="flex min-h-[52px] items-center justify-center gap-2 rounded-[11px] bg-[var(--primary)] px-2 text-center text-[14px] font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                >
                  <Footprints size={18} aria-hidden />
                  {meta.ctaLabel}
                </Link>
                <Link
                  to="/routes"
                  search={{ mode: "DRIVE" }}
                  className="flex min-h-[52px] items-center justify-center gap-2 rounded-[11px] border border-[var(--border)] bg-white px-2 text-center text-[14px] font-black text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                >
                  <Car size={18} aria-hidden />
                  차량 경로
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-[14px] font-black text-amber-900">확인된 추천 대피소가 없습니다.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
              가까운 지상 안전장소로 이동하고 지자체 또는 119의 안내를 확인하세요.
            </p>
          </div>
        )}
      </section>

      <section
        aria-label="이동 시 주의사항"
        className="border-t border-[var(--border-soft)] bg-amber-50/40 px-4 py-5"
      >
        <SectionTitle
          icon={<AlertTriangle size={17} aria-hidden />}
          step="STEP 4"
          title="이동 시 주의사항"
        />
        <GuidanceList items={displayedMovementWarnings} factMap={factMap} />
        <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-amber-200 bg-white px-3 py-2.5 text-[12px] font-bold leading-relaxed text-amber-900">
          <Navigation size={15} className="mt-0.5 shrink-0" aria-hidden />
          지도 경로보다 현장 통제선·경찰·소방·지자체 대피 안내를 우선하세요.
        </div>
      </section>

      <section aria-label="대체 대피소" className="border-t border-[var(--border-soft)] px-4 py-5">
        <SectionTitle
          icon={<Navigation size={17} aria-hidden />}
          step="STEP 5"
          title="대체 대피소"
        />

        {alternativeShelters.length > 0 ? (
          <ul className="space-y-2.5">
            {alternativeShelters.map((alternative) => {
              const reason =
                alternativeReasonByShelterId.get(alternative.shelter.id) ??
                ({
                  text: "주 대피소 접근이 어렵거나 운영 상태가 바뀔 때 확인할 대체 후보입니다.",
                  sourceKind: "GENERAL_KNOWLEDGE",
                  evidenceRefs: [],
                } satisfies AiGuidanceItem);

              return (
                <li
                  key={alternative.shelter.id}
                  className="rounded-[12px] border border-[var(--border-soft)] bg-white p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-black text-[var(--text)]">
                        {alternative.shelter.name}
                      </h3>
                      <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                        {alternative.shelter.address}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                      {SHELTER_STATUS_LABEL[alternative.shelter.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] font-extrabold text-slate-700 tnum">
                    {alternative.distanceKind === "ROUTE"
                      ? "경로 거리 " + formatDistance(alternative.distanceMeters)
                      : "직선거리 " +
                        formatDistance(alternative.distanceMeters) +
                        (alternative.routeVerified ? "" : " · 경로 미확인")}
                  </p>
                  <p className="mt-2 text-[12px] font-bold leading-relaxed text-[var(--text-muted)]">
                    {reason.text}
                  </p>
                  <SourceBadge item={reason} factMap={factMap} />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-[12px] bg-slate-50 p-3.5 text-[13px] font-bold text-[var(--text-muted)]">
            현재 조건에 맞는 대체 후보를 더 확인하고 있습니다.
          </div>
        )}

        <Link
          to="/shelters"
          className="mt-3 flex min-h-12 items-center justify-between rounded-[11px] border border-[var(--border)] bg-white px-4 text-[13px] font-black text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
        >
          대피소 전체 보기
          <ChevronRight size={17} aria-hidden />
        </Link>

        <div className="mt-4 rounded-[10px] bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--text-subtle)]">
          대피소·경로 정보는 API 자료, 직선거리는 좌표 계산값입니다. 데이터 기준 시각과 현장 상태는
          다를 수 있습니다. 행동과 추천 이유는 Gemini 해석 또는 일반 안전 지식이며, 각 항목의 출처
          표지를 확인하세요.
        </div>
      </section>
    </section>
  );
}
