import { describe, expect, test } from "vitest";

import {
  buildInlineImagePart,
  buildVertexAiGenerateContentUrl,
  getVertexAiAccessToken,
  getVertexAiAuthConfigFromEnv,
  getVertexAiConfigFromEnv,
  hasVertexAiConfig,
} from "./vertexAi";

describe("Vertex AI helpers", () => {
  test("detects and reads Vertex AI configuration from env", () => {
    const values: Record<string, string> = {
      VERTEX_AI_PROJECT_ID: "gen-lang-client-0563653718",
      VERTEX_AI_LOCATION: "us-central1",
      VERTEX_AI_MODEL: "gemini-2.5-flash",
      VERTEX_AI_ACCESS_TOKEN: "token",
    };
    const getEnv = (name: string) => values[name];

    expect(hasVertexAiConfig(getEnv)).toBe(true);
    expect(getVertexAiConfigFromEnv(getEnv)).toEqual({
      projectId: "gen-lang-client-0563653718",
      location: "us-central1",
      model: "gemini-2.5-flash",
    });
    expect(getVertexAiAuthConfigFromEnv(getEnv)).toEqual({ accessToken: "token" });
  });

  test("builds a regional Vertex AI generateContent URL", () => {
    const url = buildVertexAiGenerateContentUrl({
      projectId: "gen-lang-client-0563653718",
      location: "us-central1",
      model: "gemini-2.5-flash",
    });

    expect(url.origin).toBe("https://us-central1-aiplatform.googleapis.com");
    expect(url.pathname).toBe(
      "/v1/projects/gen-lang-client-0563653718/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
  });

  test("uses a provided access token before service account exchange", async () => {
    await expect(
      getVertexAiAccessToken({
        accessToken: "direct-token",
        serviceAccountJson: "not-json",
      }),
    ).resolves.toBe("direct-token");
  });

  test("builds a Gemini inline image part from a validated frame", () => {
    expect(buildInlineImagePart({ mimeType: "image/jpeg", data: "YWJj" })).toEqual({
      inlineData: { mimeType: "image/jpeg", data: "YWJj" },
    });
  });
});
