import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { LatLng } from "@/lib/types";
import {
  FieldCctv,
  NATIONAL_CCTV_BOUNDS,
  NATIONAL_CCTV_CENTER,
  NATIONAL_CCTV_LIMIT,
} from "./FieldCctv";

const clientMapMock = vi.hoisted(() => vi.fn());
const useCctvFeedsMock = vi.hoisted(() => vi.fn());
const cctvConfig = vi.hoisted(() => ({ CCTV_ENABLED: true }));

vi.mock("@/lib/cctv/config", () => cctvConfig);

vi.mock("@/components/map/ClientMap", () => ({
  ClientMap: (props: {
    center: LatLng;
    zoom?: number;
    showCenterMarker?: boolean;
    cctvs?: unknown[];
  }) => {
    clientMapMock(props);
    return <div data-testid="field-cctv-map" />;
  },
}));

vi.mock("@/components/ops/OpsLayout", () => ({
  OpsLayout: ({ children, detail }: { children: React.ReactNode; detail: React.ReactNode }) => (
    <main>
      {children}
      <aside>{detail}</aside>
    </main>
  ),
}));

vi.mock("@/hooks/useCctvFeeds", () => ({
  useCctvFeeds: (props: unknown) => useCctvFeedsMock(props),
}));

describe("FieldCctv nationwide lookup", () => {
  beforeEach(() => {
    cctvConfig.CCTV_ENABLED = true;
    clientMapMock.mockClear();
    useCctvFeedsMock.mockClear();
    useCctvFeedsMock.mockReturnValue({
      cameras: [],
      result: {
        data: [],
        status: "OK",
        timestamp: "2026-06-15T00:00:00.000Z",
        source: "ITS cctvInfo",
      },
      isLoading: false,
    });
  });

  test("CCTV가 꺼져 있으면 현장 화면에서 지도나 조회를 시작하지 않는다", () => {
    cctvConfig.CCTV_ENABLED = false;
    render(<FieldCctv />);

    expect(screen.getByText("CCTV 조회가 꺼져 있습니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("field-cctv-map")).not.toBeInTheDocument();
    expect(useCctvFeedsMock).not.toHaveBeenCalled();
  });

  test("requests nationwide CCTV bounds immediately on screen entry", () => {
    render(<FieldCctv />);

    expect(useCctvFeedsMock).toHaveBeenLastCalledWith({
      bounds: NATIONAL_CCTV_BOUNDS,
      limit: NATIONAL_CCTV_LIMIT,
      roadType: "all",
    });
    expect(clientMapMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: NATIONAL_CCTV_CENTER,
        zoom: 7,
        showCenterMarker: false,
      }),
    );
    expect(screen.queryByRole("button", { name: "조회" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CCTV 조회 반경")).not.toBeInTheDocument();
  });
});
