export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

export const handleCorsPreflight = (request: Request) => {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const jsonOk = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...init.headers,
    },
  });

export const jsonError = (message: string, status = 500) => jsonOk({ error: message }, { status });

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const addDurationMs = (body: unknown, durationMs: number) => {
  if (Array.isArray(body)) return { data: body, durationMs };
  if (typeof body === "object" && body !== null) {
    return { ...(body as Record<string, unknown>), durationMs };
  }
  return { data: body, durationMs };
};

/** JSON 응답에 Edge Function 내부 처리 시간을 추가한다. */
export const withJsonDuration =
  (handler: EdgeHandler, now: () => number = () => performance.now()): EdgeHandler =>
  async (request) => {
    const startedAt = now();
    const response = await handler(request);
    if (!response.headers.get("content-type")?.includes("application/json")) return response;

    const body = await response
      .clone()
      .json()
      .catch(() => undefined);
    if (body === undefined) return response;

    const durationMs = Math.max(0, Math.round(now() - startedAt));
    return new Response(JSON.stringify(addDurationMs(body, durationMs)), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
