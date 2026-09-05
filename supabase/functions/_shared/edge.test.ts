import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { corsHeaders, handleCorsPreflight, jsonError, jsonOk, withJsonDuration } from "./cors";
import {
  assertAllowedMethod,
  parseJsonBody,
  validateGeminiPromptRequest,
  validateLatLngRequest,
} from "./validation";

describe("edge shared CORS helpers", () => {
  test("returns a 204 response for OPTIONS preflight", () => {
    const response = handleCorsPreflight(
      new Request("https://example.test", { method: "OPTIONS" }),
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response?.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(response?.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  test("serializes ok and error JSON responses with CORS headers", async () => {
    const ok = jsonOk({ value: "ok" });
    const bad = jsonError("bad request", 400);

    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(
      corsHeaders["Access-Control-Allow-Origin"],
    );
    expect(await ok.json()).toEqual({ value: "ok" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad request" });
  });

  test("adds measured durationMs to object and array JSON responses", async () => {
    const objectTimes = [100, 112.4];
    const objectHandler = withJsonDuration(
      async () => jsonOk({ value: "ok" }),
      () => objectTimes.shift() ?? 112.4,
    );
    const arrayTimes = [50, 53.2];
    const arrayHandler = withJsonDuration(
      async () => jsonOk([{ id: "sensor-1" }]),
      () => arrayTimes.shift() ?? 53.2,
    );

    const objectResponse = await objectHandler(new Request("https://example.test"));
    const arrayResponse = await arrayHandler(new Request("https://example.test"));

    await expect(objectResponse.json()).resolves.toEqual({ value: "ok", durationMs: 12 });
    await expect(arrayResponse.json()).resolves.toEqual({
      data: [{ id: "sensor-1" }],
      durationMs: 3,
    });
  });
});

describe("edge deployment manifest", () => {
  test("wraps every Edge Function JSON response with server duration measurement", () => {
    const functionNames = readdirSync("supabase/functions", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .map((entry) => entry.name);

    for (const name of functionNames) {
      const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
      expect(source, `${name} must import the duration wrapper`).toContain("withJsonDuration");
      expect(source, `${name} must wrap its Deno handler`).toMatch(
        /Deno\.serve\(\s*withJsonDuration\(async \(request\) => \{/,
      );
    }
  });

  test("includes every Phase 3 Web Push function", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");

    for (const name of ["push-subscribe", "push-notify", "risk-monitor"]) {
      expect(config).toContain(`[functions.${name}]`);
      expect(config).toContain(`entrypoint = "./functions/${name}/index.ts"`);
      expect(deployScript).toContain(`"${name}"`);
    }
  });

  test("includes the sensors function used by the client", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");

    expect(config).toContain("[functions.sensors]");
    expect(config).toContain('entrypoint = "./functions/sensors/index.ts"');
    expect(deployScript).toMatch(/"sensors"/);
  });

  test("includes the SafeMap feature info proxy used by the client", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");

    expect(config).toContain("[functions.safemap-feature-info]");
    expect(config).toContain('entrypoint = "./functions/safemap-feature-info/index.ts"');
    expect(deployScript).toMatch(/"safemap-feature-info"/);
  });

  test("includes the ITS traffic event proxy used by route ranking", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");

    expect(config).toContain("[functions.traffic-events]");
    expect(config).toContain('entrypoint = "./functions/traffic-events/index.ts"');
    expect(deployScript).toMatch(/"traffic-events"/);
  });

  test("includes the ITS CCTV proxy used by the operator console", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");

    expect(config).toContain("[functions.cctv-info]");
    expect(config).toContain('entrypoint = "./functions/cctv-info/index.ts"');
    expect(deployScript).toMatch(/"cctv-info"/);
  });

  test("includes the CCTV multimodal analysis function", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");

    expect(config).toContain("[functions.cctv-analyze]");
    expect(config).toContain('entrypoint = "./functions/cctv-analyze/index.ts"');
    expect(deployScript).toMatch(/"cctv-analyze"/);
  });

  test("does not deploy the removed route elevation proxy", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const deployScript = readFileSync("scripts/deploy-supabase-all.ps1", "utf8");

    expect(config).not.toContain("[functions.route-elevation]");
    expect(config).not.toContain('entrypoint = "./functions/route-elevation/index.ts"');
    expect(deployScript).not.toMatch(/"route-elevation"/);
  });
});

describe("edge shared validation helpers", () => {
  test("parses JSON request bodies", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    await expect(parseJsonBody(request)).resolves.toEqual({ ok: true });
  });

  test("rejects unsupported methods", () => {
    expect(() => assertAllowedMethod("GET", ["POST"])).toThrow("Method not allowed");
  });

  test("validates route coordinate requests", () => {
    expect(
      validateLatLngRequest({
        origin: { lat: 37.4979, lng: 127.0276 },
        destination: { lat: 37.5023, lng: 127.0301 },
      }),
    ).toEqual({
      origin: { lat: 37.4979, lng: 127.0276 },
      destination: { lat: 37.5023, lng: 127.0301 },
    });

    expect(() => validateLatLngRequest({ origin: { lat: 100, lng: 0 } })).toThrow("Invalid origin");
  });

  test("validates Gemini prompt requests with bounded text fields", () => {
    expect(
      validateGeminiPromptRequest({
        question: "대피해도 되나요?",
        riskLevel: "WARNING",
        shelterName: "역삼1동주민센터",
        routeReasons: ["침수흔적 우회"],
        dataTimestamp: "2026-06-11T14:30:00+09:00",
      }).riskLevel,
    ).toBe("WARNING");

    expect(() =>
      validateGeminiPromptRequest({
        question: "",
        riskLevel: "WARNING",
        shelterName: "역삼1동주민센터",
        routeReasons: [],
        dataTimestamp: "2026-06-11T14:30:00+09:00",
      }),
    ).toThrow("Invalid question");
  });

  test("preserves bounded live facts and alternative shelter metadata for Gemini", () => {
    const result = validateGeminiPromptRequest({
      question: "현재 상황과 행동을 정리해줘.",
      riskLevel: "WARNING",
      shelterName: "역삼1동주민센터",
      routeReasons: ["침수흔적 우회"],
      dataTimestamp: "2026-09-04T06:00:00.000Z",
      mode: "SITUATION_GUIDANCE",
      disasterTypes: ["침수", "호우"],
      selectionKind: "AUTO_RECOMMENDED",
      facts: [
        {
          id: "traffic-1",
          kind: "TRAFFIC",
          text: "테헤란로 침수 통제",
          source: "ITS 돌발정보",
          observedAt: "2026-09-04T06:00:00.000Z",
          status: "LIVE",
        },
      ],
      alternatives: [
        {
          shelterId: "s-02",
          shelterName: "논현초등학교 체육관",
          distanceMeters: 930,
          distanceKind: "STRAIGHT_LINE",
          routeVerified: false,
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "SITUATION_GUIDANCE",
      disasterTypes: ["침수", "호우"],
      selectionKind: "AUTO_RECOMMENDED",
      facts: [
        expect.objectContaining({
          id: "traffic-1",
          source: "ITS 돌발정보",
          status: "LIVE",
        }),
      ],
      alternatives: [
        expect.objectContaining({
          shelterId: "s-02",
          distanceKind: "STRAIGHT_LINE",
          routeVerified: false,
        }),
      ],
    });
  });
});
