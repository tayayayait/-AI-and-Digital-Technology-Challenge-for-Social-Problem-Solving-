import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod, parseJsonBody } from "../_shared/validation.ts";
import { edgeError, fetchJson, requireEnv } from "../_shared/upstream.ts";

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST"]);

      const body = await parseJsonBody(request);
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query) {
        throw new Error("Missing or invalid 'query' field");
      }

      const clientId = requireEnv("NAVER_SEARCH_CLIENT_ID");
      const clientSecret = requireEnv("NAVER_SEARCH_CLIENT_SECRET");

      const searchUrl = new URL("https://openapi.naver.com/v1/search/local.json");
      searchUrl.searchParams.set("query", query);
      searchUrl.searchParams.set("display", "5");

      const data = await fetchJson(searchUrl, {
        method: "GET",
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      });

      return jsonOk(data);
    } catch (error) {
      return edgeError(error);
    }
  }),
);
