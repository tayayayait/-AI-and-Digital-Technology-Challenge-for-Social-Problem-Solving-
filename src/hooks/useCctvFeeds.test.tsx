import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CctvFeed } from "@/lib/api/cctvInfo";
import { DEFAULT_CCTV_RADIUS_METERS, useCctvFeeds } from "./useCctvFeeds";

const fetchCctvFeedsMock = vi.hoisted(() => vi.fn());
const cctvConfig = vi.hoisted(() => ({ CCTV_ENABLED: true }));

vi.mock("@/lib/cctv/config", () => cctvConfig);

vi.mock("@/lib/api/cctvInfo", () => ({
  fetchCctvFeeds: fetchCctvFeedsMock,
}));

const wrapper = ({ children }: PropsWithChildren) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe("useCctvFeeds", () => {
  beforeEach(() => {
    cctvConfig.CCTV_ENABLED = true;
    fetchCctvFeedsMock.mockReset();
    fetchCctvFeedsMock.mockResolvedValue([]);
  });

  test("CCTV를 끄면 저장된 카메라를 숨기고 지도 변경과 수동 새로고침도 조회하지 않는다", async () => {
    const camera: CctvFeed = {
      id: "cached-camera",
      name: "저장된 CCTV",
      cctvType: "4",
      streamUrl: "https://example.com/cached.m3u8",
      position: { lat: 37.498, lng: 127.028 },
      format: "HLS",
      source: "ITS cctvInfo",
    };
    fetchCctvFeedsMock.mockResolvedValue([camera]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ center }) => useCctvFeeds({ center, enabled: true }),
      {
        initialProps: { center: camera.position },
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.cameras).toEqual([camera]));
    fetchCctvFeedsMock.mockClear();

    cctvConfig.CCTV_ENABLED = false;
    rerender({ center: camera.position });
    expect(result.current.cameras).toEqual([]);
    expect(result.current.result.data).toEqual([]);
    expect(result.current.isLoading).toBe(false);

    rerender({ center: { lat: 37.51, lng: 127.03 } });
    await act(async () => {
      expect(await result.current.refreshCameras()).toEqual([]);
      await queryClient.invalidateQueries({ queryKey: ["cctv-info"] });
    });
    expect(fetchCctvFeedsMock).not.toHaveBeenCalled();
  });

  test("requests the stable expressway CCTV source for center-based lookup", async () => {
    const center = { lat: 35.16539, lng: 126.90928 };

    renderHook(() => useCctvFeeds({ center }), { wrapper });

    await waitFor(() => expect(fetchCctvFeedsMock).toHaveBeenCalledTimes(1));
    expect(fetchCctvFeedsMock).toHaveBeenCalledWith({
      center,
      radiusMeters: DEFAULT_CCTV_RADIUS_METERS,
      roadType: "ex",
      cctvType: "4",
    });
  });

  test("requests the stable expressway CCTV source for map bounds lookup", async () => {
    const bounds = { minX: 126.85, maxX: 126.96, minY: 35.12, maxY: 35.21 };

    renderHook(() => useCctvFeeds({ bounds }), { wrapper });

    await waitFor(() => expect(fetchCctvFeedsMock).toHaveBeenCalledTimes(1));
    expect(fetchCctvFeedsMock).toHaveBeenCalledWith({
      bounds,
      roadType: "ex",
      cctvType: "4",
    });
  });

  test("passes all-road nationwide options when explicitly requested", async () => {
    const bounds = { minX: 124, maxX: 132, minY: 33, maxY: 39.6 };

    renderHook(() => useCctvFeeds({ bounds, roadType: "all", limit: 5000 }), { wrapper });

    await waitFor(() => expect(fetchCctvFeedsMock).toHaveBeenCalledTimes(1));
    expect(fetchCctvFeedsMock).toHaveBeenCalledWith({
      bounds,
      limit: 5000,
      roadType: "all",
      cctvType: "4",
    });
  });

  test("keeps the last successful cameras when a later lookup fails", async () => {
    const firstCamera: CctvFeed = {
      id: "cctv-1",
      roadSectionId: "road-1",
      fileCreatedAt: "2026-06-15T09:00:00+09:00",
      cctvType: "4",
      streamUrl: "https://example.com/cctv-1.m3u8",
      resolution: "1280x720",
      position: { lat: 37.4979, lng: 127.0276 },
      format: "HLS",
      name: "Gangnam CCTV",
      source: "ITS cctvInfo",
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchCctvFeedsMock.mockResolvedValueOnce([firstCamera]);
    fetchCctvFeedsMock.mockRejectedValueOnce(new Error("API Timeout"));

    const { result, rerender } = renderHook(({ center }) => useCctvFeeds({ center }), {
      initialProps: { center: { lat: 37.4979, lng: 127.0276 } },
      wrapper,
    });

    await waitFor(() => expect(result.current.cameras).toEqual([firstCamera]));

    rerender({ center: { lat: 37.501, lng: 127.031 } });

    await waitFor(() => expect(fetchCctvFeedsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.result.error).toBe("API Timeout"));
    expect(result.current.cameras).toEqual([firstCamera]);

    warnSpy.mockRestore();
  });

  test("HLS 토큰 갱신을 위해 현재 조건의 CCTV를 즉시 재조회한다", async () => {
    const bounds = { minX: 126.85, maxX: 126.96, minY: 35.12, maxY: 35.21 };
    const initial: CctvFeed = {
      id: "cctv-1",
      cctvType: "4",
      streamUrl: "https://example.com/expired.m3u8",
      position: { lat: 35.16, lng: 126.91 },
      format: "HLS",
      name: "광주 CCTV",
      source: "ITS cctvInfo",
    };
    const refreshed = { ...initial, streamUrl: "https://example.com/refreshed.m3u8" };
    fetchCctvFeedsMock.mockResolvedValueOnce([initial]).mockResolvedValueOnce([refreshed]);
    const { result } = renderHook(() => useCctvFeeds({ bounds }), { wrapper });
    await waitFor(() => expect(result.current.cameras).toEqual([initial]));

    let refreshedCameras: CctvFeed[] = [];
    await act(async () => {
      refreshedCameras = await result.current.refreshCameras();
    });

    expect(fetchCctvFeedsMock).toHaveBeenCalledTimes(2);
    expect(refreshedCameras).toEqual([refreshed]);
    await waitFor(() => expect(result.current.cameras).toEqual([refreshed]));
  });
});
