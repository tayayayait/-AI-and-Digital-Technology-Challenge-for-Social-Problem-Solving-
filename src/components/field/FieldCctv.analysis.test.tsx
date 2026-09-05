import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CctvFeed } from "@/lib/api/cctvInfo";
import { FieldCctv } from "./FieldCctv";

vi.mock("@/lib/cctv/config", () => ({ CCTV_ENABLED: true }));

const mocks = vi.hoisted(() => ({
  refreshCameras: vi.fn(),
  useCctvAnalysis: vi.fn(),
}));

const camera: CctvFeed = {
  id: "cctv-gumi-1",
  cctvType: "4",
  streamUrl: "https://cctv.example.test/gumi.m3u8",
  position: { lat: 36.1195, lng: 128.3446 },
  format: "HLS",
  name: "구미대교 CCTV",
  source: "ITS cctvInfo",
};

vi.mock("@/components/map/ClientMap", () => ({
  ClientMap: () => <div data-testid="field-cctv-map" />,
}));

vi.mock("@/components/ops/OpsLayout", () => ({
  OpsLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/hooks/useCctvFeeds", () => ({
  useCctvFeeds: () => ({
    cameras: [camera],
    result: {
      data: [camera],
      status: "OK",
      timestamp: "2026-09-03T05:00:00.000Z",
      source: "ITS cctvInfo",
    },
    isLoading: false,
    refreshCameras: mocks.refreshCameras,
  }),
}));

vi.mock("@/hooks/useCctvAnalysis", () => ({
  useCctvAnalysis: (options: unknown) => mocks.useCctvAnalysis(options),
}));

describe("FieldCctv actions", () => {
  beforeEach(() => {
    mocks.refreshCameras.mockReset().mockResolvedValue([camera]);
    mocks.useCctvAnalysis.mockReset().mockReturnValue({
      analysisByCamera: {},
      pendingCameraId: null,
      messageByCamera: {},
      analyze: vi.fn(),
    });
  });

  test("영상 열기만 제공하고 AI 판독 요청 기능은 노출하지 않는다", () => {
    render(<FieldCctv />);

    expect(screen.getByRole("link", { name: "영상 열기" })).toHaveAttribute(
      "href",
      camera.streamUrl,
    );
    expect(screen.queryByRole("button", { name: /AI 판독/ })).not.toBeInTheDocument();
    expect(mocks.useCctvAnalysis).not.toHaveBeenCalled();
  });
});
