// 기상청 기상특보 조회서비스(WthrWrnInfoService) getPwnStatus 프록시.
//
// getPwnStatus는 지점코드 없이 전국 특보 현황을 한 번에 준다. 사용자마다 호출할 필요가
// 없으므로 응답을 함수 인스턴스에 캐시해 두고, 지역 필터링만 요청별로 수행한다.

import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson } from "../_shared/upstream.ts";
import {
  buildWarningSnapshot,
  toWeatherAlerts,
  type PwnStatusItem,
} from "../_shared/kmaWarning.ts";

const SOURCE = "KMA WthrWrnInfoService getPwnStatus";
const ENDPOINT = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus";
const UPSTREAM_TIMEOUT_MS = 10_000;

// 특보는 발표 시각 단위로 갱신된다. 3분이면 발표 직후 반영이 늦지 않으면서
// 개발계정 일 10,000건 한도 안에서 여유가 충분하다.
const CACHE_TTL_MS = 3 * 60 * 1000;

let cache: { item: PwnStatusItem | undefined; fetchedAt: number } | null = null;

const unavailableBody = (message: string) => ({
  warnings: [],
  alerts: [],
  floodLevel: null,
  announcedAt: null,
  nationwideCount: 0,
  source: SOURCE,
  status: "PENDING_ACCESS" as const,
  message,
});

const readPwnStatusItem = (payload: unknown): PwnStatusItem | undefined => {
  const body = (payload as { response?: { header?: unknown; body?: unknown } })?.response;
  const header = body?.header as { resultCode?: unknown; resultMsg?: unknown } | undefined;

  // 성공 코드가 환경에 따라 "0", "00", 숫자 0으로 온다. 기존 연동과 같은 방식으로 모두 허용한다.
  const code = String(header?.resultCode ?? "").trim();
  if (code && code !== "0" && code !== "00") {
    throw new Error(`KMA resultCode ${code}: ${String(header?.resultMsg ?? "")}`);
  }

  const items = (body?.body as { items?: { item?: unknown } } | undefined)?.items?.item;
  if (Array.isArray(items)) return items[0] as PwnStatusItem | undefined;
  return (items as PwnStatusItem | undefined) ?? undefined;
};

const loadPwnStatus = async (serviceKey: string) => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.item;

  const url = new URL(ENDPOINT);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("dataType", "JSON");

  const payload = await fetchJson(url, undefined, {
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    timeoutMessage: "KMA getPwnStatus request timed out",
  });

  const item = readPwnStatusItem(payload);
  cache = { item, fetchedAt: Date.now() };
  return item;
};

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);

      const body = (await parseJsonBody(request)) as { region?: unknown };
      const region = typeof body?.region === "string" ? body.region.trim() : "";
      if (!region) return jsonOk(unavailableBody("region is required"));

      // 특보 전용 키가 없으면 기존 기상청 키로 넘어간다. 두 서비스 모두 기관코드가
      // 1360000이라 같은 인증키로 활용신청한 경우 하나만 등록해도 동작한다.
      const serviceKey =
        Deno.env.get("KMA_WARNING_SERVICE_KEY")?.trim() || Deno.env.get("KMA_SERVICE_KEY")?.trim();

      if (!serviceKey) {
        return jsonOk(unavailableBody("KMA_WARNING_SERVICE_KEY is not configured"));
      }

      const item = await loadPwnStatus(serviceKey);
      const snapshot = buildWarningSnapshot(item, region);

      return jsonOk({
        ...snapshot,
        alerts: toWeatherAlerts(snapshot),
        region,
        source: SOURCE,
        status: "OK" as const,
      });
    } catch (error) {
      // 특보는 보조 근거다. 수집 실패가 위험도 계산이나 대피소 추천을 막으면 안 되므로
      // 500 대신 200 + PENDING_ACCESS로 돌려주고 클라이언트가 FALLBACK으로 표시하게 한다.
      if (error instanceof Error && !error.message.startsWith("Method")) {
        return jsonOk(unavailableBody(error.message));
      }
      return edgeError(error);
    }
  }),
);
