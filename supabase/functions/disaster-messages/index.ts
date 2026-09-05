import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";
import {
  buildDisasterMessagesUrl,
  normalizeDisasterMessagesResponse,
} from "../_shared/disasterMessages.ts";

const DEFAULT_API_URL = "https://www.safetydata.go.kr/V2/api/DSSP-IF-00247";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const kstDate = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
};

const boundedInt = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value ?? fallback);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) return fallback;
  return numeric;
};

const optionalText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const parseRequest = (value: unknown) => {
  if (!isRecord(value)) throw new Error("Invalid request body");

  const crtDt = optionalText(value.crtDt ?? value.startDate, 8) ?? kstDate();
  if (!/^\d{8}$/.test(crtDt)) throw new Error("Invalid crtDt");

  return {
    numOfRows: boundedInt(value.numOfRows, 20, 1, 100),
    pageNo: boundedInt(value.pageNo, 1, 1, 9999),
    crtDt,
    rgnNm: optionalText(value.rgnNm ?? value.region, 80),
  };
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const input = parseRequest(await parseJsonBody(request));
      const serviceKey = requireEnv("DISASTER_MSG_SERVICE_KEY");
      const apiUrl = Deno.env.get("DISASTER_MSG_API_URL")?.trim() || DEFAULT_API_URL;

      const upstream = await fetchJson(
        buildDisasterMessagesUrl({
          apiUrl,
          serviceKey,
          numOfRows: input.numOfRows,
          pageNo: input.pageNo,
          returnType: "json",
          crtDt: input.crtDt,
          rgnNm: input.rgnNm,
        }),
      );

      return jsonOk({
        messages: normalizeDisasterMessagesResponse(upstream),
        pageNo: input.pageNo,
        numOfRows: input.numOfRows,
        source: "MOIS-DSSP-IF-00247",
      });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
