import { afterEach, describe, expect, test, vi } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import { fetchWmsGetFeatureInfo } from "./wmsFeatureInfo";

const reportApiHealthMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock("@/store/apiHealth", () => ({
  API_HEALTH_SOURCE_NAMES: { safeMapWms: "생활안전지도 WMS" },
  useApiHealthStore: {
    getState: () => ({ report: reportApiHealthMock }),
  },
}));

const invoke = vi.mocked(supabase.functions.invoke);

describe("fetchWmsGetFeatureInfo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invoke.mockReset();
    reportApiHealthMock.mockReset();
  });

  test("routes SafeMap GetFeatureInfo through the Edge Function instead of direct browser fetch", async () => {
    const directFetch = vi.fn(() => {
      throw new Error("direct SafeMap fetch should not run in browser");
    });
    vi.stubGlobal("fetch", directFetch);
    invoke.mockResolvedValue({
      data: { overlap: 1, features: [{ id: "risk-zone" }] },
      error: null,
    });

    const result = await fetchWmsGetFeatureInfo({
      endpoint: "https://www.safemap.go.kr/openapi2/IF_0089_WMS",
      layer: "A2SM_FLOODFOVRRISK1",
      bounds: {
        west: 127.021939,
        south: 37.493408,
        east: 127.033261,
        north: 37.502392,
      },
      point: { lat: 37.4979, lng: 127.0276 },
    });

    expect(result).toEqual({ overlap: 1, features: [{ id: "risk-zone" }] });
    expect(directFetch).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("safemap-feature-info", {
      body: {
        endpoint: "https://www.safemap.go.kr/openapi2/IF_0089_WMS",
        layer: "A2SM_FLOODFOVRRISK1",
        bounds: {
          west: 127.021939,
          south: 37.493408,
          east: 127.033261,
          north: 37.502392,
        },
        point: { lat: 37.4979, lng: 127.0276 },
      },
    });
    expect(reportApiHealthMock).toHaveBeenCalledWith(
      "생활안전지도 WMS",
      expect.objectContaining({ status: "OK" }),
      expect.any(Number),
    );
  });

  test("프록시 오류를 0% 중첩과 구분할 수 있도록 실패 상태를 반환한다", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "WMS proxy unavailable" },
    });

    const result = await fetchWmsGetFeatureInfo({
      endpoint: "https://www.safemap.go.kr/openapi2/IF_0089_WMS",
      layer: "A2SM_FLOODFOVRRISK1",
      bounds: {
        west: 129.15,
        south: 35.15,
        east: 129.17,
        north: 35.17,
      },
      point: { lat: 35.16, lng: 129.16 },
    });

    expect(result).toEqual({ overlap: 0, features: [], failed: true });
    expect(reportApiHealthMock).toHaveBeenCalledWith(
      "생활안전지도 WMS",
      expect.objectContaining({ status: "FAILED", error: "WMS proxy unavailable" }),
      expect.any(Number),
    );
  });
});
