import { describe, expect, test, vi } from "vitest";

import { buildTmapPedestrianBody, requestTmapPedestrianWithFallback } from "./tmapPedestrian";

const routeRequest = {
  origin: { lat: 35.1631, lng: 129.1635 },
  destination: { lat: 35.169, lng: 129.18 },
};

describe("TMAP pedestrian accessibility option", () => {
  test("uses official searchOption 30 when stair avoidance is requested", () => {
    expect(buildTmapPedestrianBody(routeRequest, "30")).toMatchObject({
      searchOption: "30",
      startX: routeRequest.origin.lng,
      endY: routeRequest.destination.lat,
    });
  });

  test("retries the standard route and marks stair data unavailable when option 30 fails", async () => {
    const fetcher = vi
      .fn<(searchOption: "0" | "30") => Promise<{ features: unknown[] }>>()
      .mockRejectedValueOnce(new Error("searchOption unsupported"))
      .mockResolvedValueOnce({ features: [] });

    const result = await requestTmapPedestrianWithFallback(true, fetcher);

    expect(fetcher.mock.calls.map(([searchOption]) => searchOption)).toEqual(["30", "0"]);
    expect(result.stairAvoidance).toBe("UNAVAILABLE");
  });
});
