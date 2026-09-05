import { Copy, Download, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import type { ApiResult } from "@/lib/api/types";
import { RISK_META } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

interface NoticeGeneratorProps {
  region: string;
  riskLevel: RiskLevel;
  riskFactors: string[];
  recommendedAction: string;
  dataTimestamp: string;
  allowedProperNouns: string[];
  onGenerated?: (notice: string, verified: boolean) => void;
}

const noticeResponseSchema = z.object({
  summary: z.string().min(20).max(800),
  timestamp: z.string().min(1),
  verified: z.boolean(),
});

const PROPER_NOUN_PATTERN =
  /[가-힣A-Za-z0-9]+(?:초등학교|중학교|고등학교|주민센터|구민회관|병원|대피소|지하차도|역|구|동|시청|구청|소방서|경찰서)/g;

const COMMON_ALLOWED_TERMS = ["대피소", "지하차도", "주민센터", "이동"];

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      globalThis.setTimeout(() => reject(new Error("notice timeout")), ms);
    }),
  ]);

const hasUnknownProperNoun = (text: string, allowedTerms: string[]) => {
  const allowList = [...allowedTerms, ...COMMON_ALLOWED_TERMS];
  const matches = text.match(PROPER_NOUN_PATTERN) ?? [];
  return matches.some((match) => !allowList.some((term) => term.includes(match)));
};

const buildFallbackNotice = ({
  region,
  riskLevel,
  riskFactors,
  recommendedAction,
  dataTimestamp,
}: Pick<
  NoticeGeneratorProps,
  "region" | "riskLevel" | "riskFactors" | "recommendedAction" | "dataTimestamp"
>) => {
  const factors = riskFactors.length ? riskFactors.join(", ") : "확실한 정보 없음";
  return `[${region} 주민 안내]
현재 위험도는 ${RISK_META[riskLevel].label}입니다. 확인된 위험요인은 ${factors}입니다.
행동요령: ${recommendedAction}
기준시각: ${dataTimestamp}
지자체 대피명령과 현장 통제를 우선하세요.`;
};

const validateNoticeText = ({
  text,
  region,
  recommendedAction,
  dataTimestamp,
  allowedProperNouns,
}: {
  text: string;
  region: string;
  recommendedAction: string;
  dataTimestamp: string;
  allowedProperNouns: string[];
}) => {
  if (!text.includes(region)) return "생성 결과에 지역명이 없습니다.";
  if (!text.includes(recommendedAction)) return "생성 결과에 행동요령이 없습니다.";
  if (!text.includes(dataTimestamp)) return "생성 결과에 기준시각이 없습니다.";
  if (hasUnknownProperNoun(text, allowedProperNouns)) {
    return "허용되지 않은 지역명 또는 기관명이 포함되었습니다.";
  }
  return null;
};

export function NoticeGenerator(props: NoticeGeneratorProps) {
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("안내문을 생성하세요.");

  const fallback = useMemo(
    () => buildFallbackNotice(props),
    [
      props.region,
      props.riskLevel,
      props.riskFactors,
      props.recommendedAction,
      props.dataTimestamp,
    ],
  );

  const generateNotice = async () => {
    setLoading(true);
    setStatus("Gemini notice function 호출 중");

    try {
      const measured = await measureApiHealth({
        name: API_HEALTH_SOURCE_NAMES.geminiNotice,
        source: "gemini-notice",
        run: async (): Promise<ApiResult<z.infer<typeof noticeResponseSchema>>> => {
          const response = await withTimeout(
            supabase.functions.invoke("gemini-notice", {
              body: {
                region: props.region,
                riskLevel: props.riskLevel,
                riskFactors: props.riskFactors,
                recommendedAction: props.recommendedAction,
                dataTimestamp: props.dataTimestamp,
                allowedProperNouns: props.allowedProperNouns,
              },
            }),
            8000,
          );

          if (response.error) throw new Error(response.error.message);
          const parsed = noticeResponseSchema.safeParse(response.data);
          if (!parsed.success) throw new Error("notice schema mismatch");

          const validationError = validateNoticeText({
            text: parsed.data.summary,
            region: props.region,
            recommendedAction: props.recommendedAction,
            dataTimestamp: props.dataTimestamp,
            allowedProperNouns: props.allowedProperNouns,
          });
          if (validationError) throw new Error(validationError);

          return {
            data: parsed.data,
            status: "OK",
            timestamp: new Date().toISOString(),
            source: "gemini-notice",
          };
        },
      });
      if (!measured.data) throw new Error("notice response missing");

      setNotice(measured.data.summary);
      setStatus("Gemini 안내문 생성 완료");
      props.onGenerated?.(measured.data.summary, true);
    } catch (error) {
      const fallbackNotice = fallback;
      setNotice(fallbackNotice);
      setStatus(
        error instanceof Error
          ? `검증 실패 또는 지연: ${error.message}. 규칙 기반 안내문을 사용합니다.`
          : "검증 실패 또는 지연: 규칙 기반 안내문을 사용합니다.",
      );
      props.onGenerated?.(fallbackNotice, false);
    } finally {
      setLoading(false);
    }
  };

  const copyNotice = async () => {
    if (!notice) return;
    await navigator.clipboard.writeText(notice);
    setStatus("클립보드에 복사했습니다.");
  };

  const downloadNotice = () => {
    if (!notice) return;
    const blob = new Blob([notice], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${props.region}-주민안내문.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("txt 파일을 생성했습니다.");
  };

  return (
    <section className="rounded-[8px] border border-[var(--border-soft)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-extrabold">주민 안내문 생성</h3>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            지역명, 위험도, 위험요인, 행동요령, 기준시각을 포함합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={generateNotice}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-[var(--primary)] px-4 text-[13px] font-extrabold text-white disabled:opacity-60"
        >
          <Wand2 size={16} aria-hidden />
          안내문 생성
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoItem label="지역" value={props.region} />
        <InfoItem label="위험도" value={RISK_META[props.riskLevel].label} />
        <InfoItem label="행동요령" value={props.recommendedAction} />
        <InfoItem label="기준시각" value={props.dataTimestamp} />
      </div>

      <label className="mt-4 block">
        <span className="text-[13px] font-bold">생성 결과</span>
        <textarea
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          placeholder="안내문 생성 버튼을 누르면 초안이 표시됩니다."
          className="mt-2 min-h-[220px] w-full resize-y rounded-[8px] border border-[var(--border)] bg-white p-3 text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-[var(--focus)]"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-[var(--text-subtle)]">{status}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyNotice}
            disabled={!notice}
            className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] font-bold disabled:opacity-50"
          >
            <Copy size={15} aria-hidden />
            복사
          </button>
          <button
            type="button"
            onClick={downloadNotice}
            disabled={!notice}
            className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] font-bold disabled:opacity-50"
          >
            <Download size={15} aria-hidden />
            다운로드
          </button>
        </div>
      </div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-[var(--surface-alt)] px-3 py-2">
      <div className="text-[11px] font-bold text-[var(--text-subtle)]">{label}</div>
      <div className="mt-0.5 text-[13px] font-extrabold">{value}</div>
    </div>
  );
}
