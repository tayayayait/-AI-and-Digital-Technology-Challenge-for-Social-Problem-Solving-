import { describe, expect, test, vi } from "vitest";

import {
  createControlMarkerIcon,
  createCurrentLocationMarkerIcon,
  createRiskZoneMarkerIcon,
  createShelterMarkerIcon,
} from "./markers";
import type { Shelter } from "@/lib/types";

const createMapsMock = () => {
  const Size = vi.fn(function Size(
    this: { width: number; height: number },
    width: number,
    height: number,
  ) {
    this.width = width;
    this.height = height;
  });
  const Point = vi.fn(function Point(this: { x: number; y: number }, x: number, y: number) {
    this.x = x;
    this.y = y;
  });

  return { Size, Point } as unknown as NaverMapsNamespace["maps"];
};

const shelter: Shelter = {
  id: "s-01",
  name: "역삼초등학교 체육관",
  address: "서울 강남구 역삼로 153",
  position: { lat: 37.5005, lng: 127.0354 },
  capacity: 420,
  status: "OPERATING",
  underground: false,
  type: "민방위 대피시설",
};

describe("map marker icons", () => {
  test("builds the current-location marker at the required size", () => {
    const maps = createMapsMock();
    const icon = createCurrentLocationMarkerIcon(maps);

    expect(icon.content).toContain("현재 위치");
    expect(icon.content).toContain("width:18px");
    expect(maps.Size).toHaveBeenCalledWith(18, 18);
    expect(maps.Point).toHaveBeenCalledWith(9, 9);
  });

  test("builds a shelter marker with a non-color status label", () => {
    const maps = createMapsMock();
    const icon = createShelterMarkerIcon(maps, shelter);

    expect(icon.content).toContain("대피소: 역삼초등학교 체육관");
    expect(icon.content).toContain("운영중");
    expect(icon.content).toContain('data-shelter-id="s-01"');
    expect(icon.content).toContain("width:28px");
    expect(maps.Size).toHaveBeenCalledWith(28, 28);
    expect(maps.Point).toHaveBeenCalledWith(14, 14);
  });

  test("builds a risk-zone diamond marker", () => {
    const maps = createMapsMock();
    const icon = createRiskZoneMarkerIcon(maps, "CRITICAL", "강남역 저지대");

    expect(icon.content).toContain("위험지점: 강남역 저지대");
    expect(icon.content).toContain("transform:rotate(45deg)");
    expect(icon.content).toContain("#991b1b");
    expect(maps.Size).toHaveBeenCalledWith(32, 32);
    expect(maps.Point).toHaveBeenCalledWith(16, 16);
  });

  test("builds a red control marker", () => {
    const maps = createMapsMock();
    const icon = createControlMarkerIcon(maps, "차량 통제");

    expect(icon.content).toContain("통제 정보: 차량 통제");
    expect(icon.content).toContain("#dc2626");
    expect(maps.Size).toHaveBeenCalledWith(28, 28);
    expect(maps.Point).toHaveBeenCalledWith(14, 14);
  });
});
