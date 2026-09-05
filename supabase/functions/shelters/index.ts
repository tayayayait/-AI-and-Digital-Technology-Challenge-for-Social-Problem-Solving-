import { handleCorsPreflight, jsonOk, withJsonDuration } from "../_shared/cors.ts";
import { assertAllowedMethod } from "../_shared/validation.ts";
import { edgeError } from "../_shared/upstream.ts";

export interface ShelterInfo {
  id: string;
  name: string;
  address: string;
  position: { lat: number; lng: number };
  capacity: number;
  status: "OPERATING" | "CHECK_REQUIRED" | "EXCLUDED";
  underground: boolean;
  type: string;
}

const WARNING =
  "Temporary housing regional summary data has no facility address or coordinates. Facility-level temporary housing data is required before returning route-guidance shelters.";

Deno.serve(
  withJsonDuration(async (request) => {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    try {
      assertAllowedMethod(request.method, ["POST", "GET"]);

      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.set("Cache-Control", "no-store");
      headers.set("X-Shelter-Data-Warning", WARNING);

      return jsonOk([], headers);
    } catch (error) {
      return edgeError(error);
    }
  }),
);
