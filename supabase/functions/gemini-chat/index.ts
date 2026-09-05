import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import {
  assertAllowedMethod,
  parseJsonBody,
  validateGeminiPromptRequest,
} from "../_shared/validation.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";
import {
  buildVertexAiGenerateContentUrl,
  getVertexAiAccessToken,
  getVertexAiAuthConfigFromEnv,
  getVertexAiConfigFromEnv,
  hasVertexAiConfig,
} from "../_shared/vertexAi.ts";
import {
  buildGeminiGuidancePrompt,
  GEMINI_GUIDANCE_RESPONSE_SCHEMA,
  GEMINI_GUIDANCE_SYSTEM,
} from "../_shared/geminiGuidance.ts";

const firstTextPart = (response: unknown) => {
  const candidate = (
    response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  ).candidates?.[0];
  const text = candidate?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    console.error("[gemini-chat] Unexpected Gemini response:", JSON.stringify(response));
    return "{}";
  }
  return text;
};

const buildGenerateContentBody = (
  input: ReturnType<typeof validateGeminiPromptRequest>,
  model: string,
) => ({
  systemInstruction: { parts: [{ text: GEMINI_GUIDANCE_SYSTEM }] },
  contents: [{ role: "user", parts: [{ text: buildGeminiGuidancePrompt(input) }] }],
  generationConfig: {
    temperature: 0.15,
    maxOutputTokens: 4096,
    responseMimeType: "application/json",
    responseSchema: GEMINI_GUIDANCE_RESPONSE_SCHEMA,
    // The app supplies the risk decision; Flash only formats evidence-backed guidance.
    // Dynamic thinking otherwise competes with the 20-second request deadline.
    ...(["gemini-2.5-flash", "gemini-2.5-flash-lite"].includes(model)
      ? { thinkingConfig: { thinkingBudget: 0 } }
      : {}),
  },
});

const fetchGeminiContent = async (input: ReturnType<typeof validateGeminiPromptRequest>) => {
  const getEnv = (name: string) => Deno.env.get(name);

  if (hasVertexAiConfig(getEnv)) {
    const vertexConfig = getVertexAiConfigFromEnv(getEnv);
    const accessToken = await getVertexAiAccessToken(getVertexAiAuthConfigFromEnv(getEnv));
    return fetchJson(
      buildVertexAiGenerateContentUrl(vertexConfig),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildGenerateContentBody(input, vertexConfig.model)),
      },
      { timeoutMs: 20000, timeoutMessage: "Vertex AI request timed out" },
    );
  }

  const apiKey = requireEnv("GEMINI_API_KEY");
  const url = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash-preview:generateContent",
  );
  url.searchParams.set("key", apiKey);

  return fetchJson(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildGenerateContentBody(input, "gemini-3.0-flash-preview")),
    },
    { timeoutMs: 20000, timeoutMessage: "Gemini API request timed out" },
  );
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const input = validateGeminiPromptRequest(await parseJsonBody(request));
      const upstream = await fetchGeminiContent(input);

      const parsed = JSON.parse(firstTextPart(upstream)) as Record<string, unknown>;
      return jsonOk({
        ...parsed,
        timestamp: input.dataTimestamp,
      });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
