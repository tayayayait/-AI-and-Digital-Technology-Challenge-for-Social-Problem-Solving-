import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";
import { normalizeKmaWeather, toKmaForecastBase } from "../_shared/kma.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseGridRequest = (value: unknown) => {
  if (!isRecord(value)) throw new Error("Invalid request body");
  const { nx, ny, baseDate, baseTime } = value;
  if (typeof nx !== "number" || !Number.isInteger(nx) || nx < 1) throw new Error("Invalid nx");
  if (typeof ny !== "number" || !Number.isInteger(ny) || ny < 1) throw new Error("Invalid ny");
  if (typeof baseDate !== "string" || !/^\d{8}$/.test(baseDate))
    throw new Error("Invalid baseDate");
  if (typeof baseTime !== "string" || !/^\d{4}$/.test(baseTime))
    throw new Error("Invalid baseTime");
  return { nx, ny, baseDate, baseTime };
};

const extractItems = (upstream: unknown) => {
  if (!isRecord(upstream)) return [];
  const response = upstream.response;
  if (!isRecord(response)) return [];

  // KMA API는 HTTP 200이지만 resultCode로 에러를 전달
  const header = response.header;
  if (isRecord(header)) {
    const resultCode = header.resultCode;
    const resultMsg = header.resultMsg;
    if (resultCode && resultCode !== "00") {
      throw new Error(`KMA API error: [${resultCode}] ${resultMsg}`);
    }
  }

  const body = response.body;
  if (!isRecord(body)) return [];
  const items = body.items;
  if (!isRecord(items) || !Array.isArray(items.item)) return [];
  return items.item;
};

const buildKmaUrl = ({
  endpoint,
  serviceKey,
  baseDate,
  baseTime,
  nx,
  ny,
}: {
  endpoint: "getUltraSrtNcst" | "getVilageFcst";
  serviceKey: string;
  baseDate: string;
  baseTime: string;
  nx: number;
  ny: number;
}) => {
  const url = new URL(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/${endpoint}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));
  return url;
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);
      const { nx, ny, baseDate, baseTime } = parseGridRequest(await parseJsonBody(request));
      const serviceKey = requireEnv("KMA_SERVICE_KEY");

      const forecastBase = toKmaForecastBase(baseDate, baseTime);
      const [nowcast, forecast] = await Promise.all([
        fetchJson(
          buildKmaUrl({
            endpoint: "getUltraSrtNcst",
            serviceKey,
            baseDate,
            baseTime,
            nx,
            ny,
          }),
        ),
        fetchJson(
          buildKmaUrl({
            endpoint: "getVilageFcst",
            serviceKey,
            baseDate: forecastBase.baseDate,
            baseTime: forecastBase.baseTime,
            nx,
            ny,
          }),
        ),
      ]);

      return jsonOk({
        ...normalizeKmaWeather({
          baseDate,
          baseTime,
          nowcastItems: extractItems(nowcast),
          forecastItems: extractItems(forecast),
        }),
      });
    } catch (error) {
      return edgeError(error);
    }
  }),
);
