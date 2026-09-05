import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";
import {
  buildVertexAiGenerateContentUrl,
  getVertexAiAccessToken,
  getVertexAiAuthConfigFromEnv,
  getVertexAiConfigFromEnv,
  hasVertexAiConfig,
} from "../_shared/vertexAi.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseNoticeRequest = (value: unknown) => {
  if (!isRecord(value)) throw new Error("Invalid request body");
  const region = typeof value.region === "string" ? value.region.trim().slice(0, 80) : "";
  const riskLevel = typeof value.riskLevel === "string" ? value.riskLevel.trim().slice(0, 20) : "";
  const riskFactors = Array.isArray(value.riskFactors)
    ? value.riskFactors
        .filter((factor): factor is string => typeof factor === "string")
        .map((factor) => factor.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const recommendedAction =
    typeof value.recommendedAction === "string" ? value.recommendedAction.trim().slice(0, 120) : "";
  const dataTimestamp =
    typeof value.dataTimestamp === "string" ? value.dataTimestamp.trim().slice(0, 80) : "";
  const allowedProperNouns = Array.isArray(value.allowedProperNouns)
    ? value.allowedProperNouns
        .filter((term): term is string => typeof term === "string")
        .map((term) => term.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (!region) throw new Error("Invalid region");
  if (!riskLevel) throw new Error("Invalid riskLevel");
  if (!recommendedAction) throw new Error("Invalid recommendedAction");
  if (!dataTimestamp) throw new Error("Invalid dataTimestamp");
  return { region, riskLevel, riskFactors, recommendedAction, dataTimestamp, allowedProperNouns };
};

const firstTextPart = (response: unknown) => {
  const candidate = (
    response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  ).candidates?.[0];
  return candidate?.content?.parts?.find((part) => typeof part.text === "string")?.text ?? "";
};

const buildGenerateContentBody = (input: ReturnType<typeof parseNoticeRequest>) => ({
  contents: [
    {
      role: "user",
      parts: [
        {
          text: `주민 안내문을 한국어로 작성하세요.
필수 포함:
- 지역명: ${input.region}
- 위험도: ${input.riskLevel}
- 위험요인: ${input.riskFactors.join(", ") || "확실한 정보 없음"}
- 행동요령: ${input.recommendedAction}
- 기준시각: ${input.dataTimestamp}
허용 고유명사: ${input.allowedProperNouns.join(", ") || input.region}

출력은 JSON 한 객체만 사용하세요. 키는 summary 하나입니다. summary에는 지역명, 행동요령, 기준시각을 그대로 포함하세요.`,
        },
      ],
    },
  ],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
});

const fetchGeminiContent = async (input: ReturnType<typeof parseNoticeRequest>) => {
  const body = buildGenerateContentBody(input);
  const getEnv = (name: string) => Deno.env.get(name);

  if (hasVertexAiConfig(getEnv)) {
    const vertexConfig = getVertexAiConfigFromEnv(getEnv);
    const accessToken = await getVertexAiAccessToken(getVertexAiAuthConfigFromEnv(getEnv));
    return fetchJson(buildVertexAiGenerateContentUrl(vertexConfig), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  const apiKey = requireEnv("GEMINI_API_KEY");
  const url = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  url.searchParams.set("key", apiKey);

  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const input = parseNoticeRequest(await parseJsonBody(request));
      const upstream = await fetchGeminiContent(input);

      const parsed = JSON.parse(firstTextPart(upstream) || "{}") as { summary?: string };
      return jsonOk({
        summary: String(parsed.summary ?? "").trim(),
        timestamp: input.dataTimestamp,
        verified: true,
      });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
