import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CctvFeed } from "@/lib/api/cctvInfo";
import { FieldCctv } from "./FieldCctv";

vi.mock("@/lib/cctv/config", () => ({ CCTV_ENABLED: true }));

const mocks = vi.hoisted(() => ({
  getCameras: vi.fn(),
}));

vi.mock("@/components/map/ClientMap", () => ({
  ClientMap: ({
    cctvs = [],
    onBoundsChanged,
  }: {
    cctvs?: unknown[];
    onBoundsChanged?: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
  }) => (
    <div>
      <div data-testid="field-cctv-map" data-camera-count={cctvs.length} />
      <button
        type="button"
        onClick={() => onBoundsChanged?.({ minX: 126.8, maxX: 127.2, minY: 37.3, maxY: 37.8 })}
      >
        지도 영역 변경
      </button>
    </div>
  ),
}));

vi.mock("@/components/ops/OpsLayout", () => ({
  OpsLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/hooks/useCctvFeeds", () => ({
  useCctvFeeds: () => {
    const cameras = mocks.getCameras();
    return {
      cameras,
      result: {
        data: cameras,
        status: "OK",
        timestamp: "2026-09-04T00:00:00.000Z",
        source: "ITS cctvInfo",
      },
      isLoading: false,
      refreshCameras: vi.fn(),
    };
  },
}));

const makeCameras = (count: number): CctvFeed[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `cctv-${index}`,
    cctvType: "4",
    streamUrl: `https://cctv.example.test/${index}.m3u8`,
    position: { lat: 33 + index * 0.001, lng: 124 + index * 0.001 },
    format: "HLS",
    name: `CCTV ${index}`,
    source: "ITS cctvInfo",
  }));

describe("FieldCctv rendering performance", () => {
  beforeEach(() => {
    mocks.getCameras.mockReset().mockReturnValue(makeCameras(1_000));
  });

  test("initially renders only a small page of CCTV detail cards", () => {
    render(<FieldCctv />);

    expect(screen.getAllByRole("link", { name: "영상 열기" })).toHaveLength(24);
  });

  test("renders the next CCTV detail page only when requested", async () => {
    const user = userEvent.setup();
    render(<FieldCctv />);

    await user.click(screen.getByRole("button", { name: "CCTV 24개 더 보기" }));

    expect(screen.getAllByRole("link", { name: "영상 열기" })).toHaveLength(48);
  });

  test("limits the number of expensive HTML markers sent to the map", () => {
    render(<FieldCctv />);

    expect(screen.getByTestId("field-cctv-map")).toHaveAttribute("data-camera-count", "250");
  });

  test("resets the detail page size when the map moves to a new area", async () => {
    const user = userEvent.setup();
    render(<FieldCctv />);

    await user.click(screen.getByRole("button", { name: "CCTV 24개 더 보기" }));
    expect(screen.getAllByRole("link", { name: "영상 열기" })).toHaveLength(48);

    await user.click(screen.getByRole("button", { name: "지도 영역 변경" }));

    expect(screen.getAllByRole("link", { name: "영상 열기" })).toHaveLength(24);
  });
});
