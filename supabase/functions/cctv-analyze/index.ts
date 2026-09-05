import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  parseCctvAnalyzeRequest,
  readCctvAnalysisDailyLimit,
  reliableCctvAnalysis,
} from "../_shared/cctvAnalysis.ts";
import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import {
  buildInlineImagePart,
  buildVertexAiGenerateContentUrl,
  getVertexAiAccessToken,
  getVertexAiAuthConfigFromEnv,
  getVertexAiConfigFromEnv,
  hasVertexAiConfig,
} from "../_shared/vertexAi.ts";

const CCTV_ANALYSIS_CACHE_MS = 10 * 60 * 1000;
const GEMINI_TIMEOUT_MS = 25_000;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `당신은 도로 CCTV 영상 판독 보조자입니다.
제공된 단일 프레임에 실제로 보이는 노면만 판독하세요.
보이지 않거나 야간·악천후·화질 문제로 확신할 수 없으면 confidence를 낮추세요.
추측으로 침수를 만들지 말고 flooded, depthGrade, passable, confidence, observation만 JSON으로 반환하세요.`;

const responseSchema = {
  type: "object",
  properties: {
    flooded: { type: "boolean" },
    depthGrade: {
      type: "string",
      enum: ["NONE", "SHALLOW", "DEEP", "IMPASSABLE"],
    },
    passable: { type: "boolean" },
    confidence: { type: "number" },
    observation: { type: "string" },
  },
  required: ["flooded", "depthGrade", "passable", "confidence", "observation"],
};

const firstTextPart = (response: unknown) => {
  const candidate = (
    response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  ).candidates?.[0];
  const text = candidate?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) throw new Error("Gemini CCTV analysis returned no text");
  return text;
};

const buildGenerateContentBody = (input: ReturnType<typeof parseCctvAnalyzeRequest>) => ({
  systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  contents: [
    {
      role: "user",
      parts: [
        {
          text: `카메라: ${input.camera.name}\n위치: ${input.camera.position.lat}, ${input.camera.position.lng}\n현재 프레임의 노면 침수와 통행 가능 여부를 판독하세요.`,
        },
        buildInlineImagePart(input.frame),
      ],
    },
  ],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema,
    temperature: 0,
    maxOutputTokens: 256,
    thinkingConfig: { thinkingBudget: 0 },
  },
});

const fetchGeminiAnalysis = async (input: ReturnType<typeof parseCctvAnalyzeRequest>) => {
  const body = buildGenerateContentBody(input);
  const getEnv = (name: string) => Deno.env.get(name);

  if (hasVertexAiConfig(getEnv)) {
    const vertexConfig = getVertexAiConfigFromEnv(getEnv);
    const accessToken = await getVertexAiAccessToken(getVertexAiAuthConfigFromEnv(getEnv));
    const response = await fetchJson(
      buildVertexAiGenerateContentUrl(vertexConfig),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
      { timeoutMs: GEMINI_TIMEOUT_MS, timeoutMessage: "CCTV analysis timed out" },
    );
    return { response, model: vertexConfig.model };
  }

  const apiKey = requireEnv("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_CCTV_MODEL")?.trim() || DEFAULT_GEMINI_MODEL;
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
  );
  url.searchParams.set("key", apiKey);
  const response = await fetchJson(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    { timeoutMs: GEMINI_TIMEOUT_MS, timeoutMessage: "CCTV analysis timed out" },
  );
  return { response, model };
};

const toAnalysisResponse = (row: Record<string, unknown>) => ({
  flooded: row.flooded,
  depthGrade: row.depth_grade,
  passable: row.passable,
  confidence: row.confidence,
  observation: row.observation,
  frameDataUrl: row.frame_data_url,
  analyzedAt: row.analyzed_at,
  expiresAt: row.expires_at,
  cameraId: row.camera_id,
  cameraName: row.camera_name,
  position: { lat: row.lat, lng: row.lng },
});

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const input = parseCctvAnalyzeRequest(await parseJsonBody(request));
      const supabaseAdmin = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      );
      const now = new Date();

      const { data: cached, error: cacheError } = await supabaseAdmin
        .from("cctv_analysis")
        .select("*")
        .eq("camera_id", input.camera.id)
        .gt("expires_at", now.toISOString())
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cacheError) throw new Error(cacheError.message);
      if (cached) {
        return jsonOk({ status: "OK", cached: true, analysis: toAnalysisResponse(cached) });
      }

      const dailyLimit = readCctvAnalysisDailyLimit(Deno.env.get("CCTV_ANALYSIS_DAILY_LIMIT"));
      const { data: quotaClaimed, error: quotaError } = await supabaseAdmin.rpc(
        "claim_cctv_analysis_usage",
        {
          p_camera_id: input.camera.id,
          p_daily_limit: dailyLimit,
        },
      );
      if (quotaError) throw new Error(quotaError.message);
      if (!quotaClaimed) {
        return jsonOk({
          status: "DAILY_LIMIT",
          cached: false,
          analysis: null,
          message: `일일 CCTV AI 판독 상한 ${dailyLimit}회에 도달했습니다.`,
        });
      }

      const upstream = await fetchGeminiAnalysis(input);
      const parsed = JSON.parse(firstTextPart(upstream.response)) as unknown;
      const analysis = reliableCctvAnalysis(parsed);
      if (!analysis) {
        return jsonOk({
          status: "LOW_CONFIDENCE",
          cached: false,
          analysis: null,
          message: "AI 판독 신뢰도가 70% 미만이라 결과를 폐기했습니다.",
        });
      }

      const analyzedAt = new Date();
      const expiresAt = new Date(analyzedAt.getTime() + CCTV_ANALYSIS_CACHE_MS);
      const row = {
        camera_id: input.camera.id,
        camera_name: input.camera.name,
        stream_url: input.camera.streamUrl,
        source: input.camera.source ?? null,
        lat: input.camera.position.lat,
        lng: input.camera.position.lng,
        frame_data_url: input.frame.dataUrl,
        flooded: analysis.flooded,
        depth_grade: analysis.depthGrade,
        passable: analysis.passable,
        confidence: analysis.confidence,
        observation: analysis.observation,
        model: upstream.model,
        analyzed_at: analyzedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
      const { error: insertError } = await supabaseAdmin.from("cctv_analysis").insert(row);
      if (insertError) throw new Error(insertError.message);

      return jsonOk({
        status: "OK",
        cached: false,
        analysis: toAnalysisResponse(row),
      });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
