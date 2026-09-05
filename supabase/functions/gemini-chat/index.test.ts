// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("gemini-chat generation request", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  test.each([
    ["gemini-2.5-flash", { thinkingBudget: 0 }],
    ["gemini-2.5-flash-lite", { thinkingBudget: 0 }],
    ["gemini-2.5-pro", undefined],
    ["gemini-3-flash-preview", undefined],
  ])("uses a supported thinking configuration for %s", async (model, thinkingConfig) => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const env: Record<string, string> = {
      VERTEX_AI_PROJECT_ID: "test-project",
      VERTEX_AI_MODEL: model,
      VERTEX_AI_ACCESS_TOKEN: "test-access-token",
    };
    vi.stubGlobal("Deno", {
      env: { get: (name: string) => env[name] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    });
    const guidance = {
      text: "공식 안내를 확인하세요.",
      sourceKind: "GENERAL_KNOWLEDGE",
      evidenceRefs: [],
    };
    const answer = {
      judgement: "CHECK_OFFICIAL_NOTICE",
      reasons: [guidance.text],
      basis: [],
      riskSummary: guidance,
      immediateActions: [guidance],
      disasterActions: [guidance],
      recommendedShelterReason: guidance,
      movementWarnings: [guidance],
      alternativeShelterReasons: [],
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await import("./index");
    const response = await handler!(
      new Request("http://localhost/gemini-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: "현재 안내를 알려주세요.",
          mode: "SITUATION_GUIDANCE",
          riskLevel: "SAFE",
          shelterName: "확인 가능한 대피소 없음",
          dataTimestamp: "2026-09-04T08:00:00Z",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(answer);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(requestBody.generationConfig.thinkingConfig).toEqual(thinkingConfig);
    expect(requestBody.generationConfig.responseSchema.required).toContain("riskSummary");
    expect(requestBody.generationConfig.responseMimeType).toBe("application/json");
  });
});
