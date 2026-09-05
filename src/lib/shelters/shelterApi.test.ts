import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import { fetchShelters, fetchSheltersResult } from "@/lib/shelters/shelterApi";
import { DEMO_CENTER } from "@/mocks/data";
import type { Shelter } from "@/lib/types";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const origin = { lat: 36.1195, lng: 128.3446 };

const nearbyShelter: Shelter = {
  id: "gumi-1",
  name: "구미초등학교",
  address: "경상북도 구미시",
  position: { lat: 36.121, lng: 128.346 },
  capacity: 240,
  status: "OPERATING",
  underground: false,
  type: "공공용시설",
};

const farShelter: Shelter = {
  id: "seoul-1",
  name: "서울 대피시설",
  address: "서울특별시",
  position: { lat: 37.5, lng: 127.03 },
  capacity: 300,
  status: "OPERATING",
  underground: false,
  type: "공공용시설",
};

const undergroundShelter: Shelter = {
  id: "gumi-underground",
  name: "구미 지하주차장",
  address: "경상북도 구미시",
  position: { lat: 36.122, lng: 128.347 },
  capacity: 500,
  status: "OPERATING",
  underground: false,
  type: "공공용시설",
};

const mockShelterQuery = (data: unknown[] = []) => {
  const query = {
    select: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    limit: vi.fn(async () => ({ data, error: null })),
  };
  vi.mocked(supabase.from).mockReturnValue(query as never);
};

describe("fetchShelters", () => {
  beforeEach(() => {
    mockShelterQuery([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("falls back to nearby static shelters when the DB has no current-location candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [farShelter, undergroundShelter, nearbyShelter],
      })),
    );

    const shelters = await fetchShelters(origin);

    expect(shelters).toEqual([nearbyShelter]);
    expect(fetch).toHaveBeenCalledWith("/data/shelters.json");
  });

  test("uses DB shelters before static fallback", async () => {
    mockShelterQuery([
      {
        id: "db-1",
        name: "DB 대피시설",
        address: "경상북도 구미시",
        lat: origin.lat,
        lng: origin.lng,
        capacity: 100,
        status: "OPERATING",
        underground: false,
        facility_type: "이재민 임시주거시설",
      },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const shelters = await fetchShelters(origin);

    expect(shelters).toHaveLength(1);
    expect(shelters[0]?.name).toBe("DB 대피시설");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("reports DB data as OK and static data as FALLBACK", async () => {
    mockShelterQuery([
      {
        id: "db-1",
        name: "DB 대피시설",
        address: "경상북도 구미시",
        lat: origin.lat,
        lng: origin.lng,
        capacity: 100,
        status: "OPERATING",
        underground: false,
        facility_type: "이재민 임시주거시설",
      },
    ]);

    await expect(fetchSheltersResult(origin)).resolves.toMatchObject({
      status: "OK",
      source: "shelter_operations",
      data: [{ name: "DB 대피시설" }],
    });

    mockShelterQuery([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [nearbyShelter] })),
    );

    await expect(fetchSheltersResult(origin)).resolves.toMatchObject({
      status: "FALLBACK",
      source: "static-shelters",
      data: [nearbyShelter],
    });
  });

  test("does not fall back to Seoul demo shelters for a non-demo current location", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("static data unavailable");
      }),
    );

    const shelters = await fetchShelters(origin);

    expect(shelters).toEqual([]);
  });

  test("keeps demo fallback only near the demo origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("static data unavailable");
      }),
    );

    const shelters = await fetchShelters(DEMO_CENTER);

    expect(shelters.length).toBeGreaterThan(0);
    expect(shelters[0]?.address).toContain("서울");
  });

  test("queries DB with bounding box when bounds are provided", async () => {
    const bounds = { minX: 128.34, maxX: 128.36, minY: 36.11, maxY: 36.13 };
    const query = {
      select: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      limit: vi.fn(async () => ({
        data: [
          {
            id: "db-bounds-1",
            name: "바운즈 대피소",
            address: "경상북도 구미시",
            lat: 36.12,
            lng: 128.35,
            capacity: 100,
            status: "OPERATING",
            underground: false,
            facility_type: "이재민 임시주거시설",
          },
        ],
        error: null,
      })),
    };
    vi.mocked(supabase.from).mockReturnValue(query as never);

    const result = await fetchSheltersResult(origin, bounds);

    expect(query.gte).toHaveBeenCalledWith("lat", bounds.minY);
    expect(query.lte).toHaveBeenCalledWith("lat", bounds.maxY);
    expect(query.gte).toHaveBeenCalledWith("lng", bounds.minX);
    expect(query.lte).toHaveBeenCalledWith("lng", bounds.maxX);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe("바운즈 대피소");
  });

  test("filters static shelters by bounds when bounds are provided", async () => {
    const bounds = { minX: 127.02, maxX: 127.04, minY: 37.49, maxY: 37.51 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          nearbyShelter, // 구미: 36.121, 128.346 (bounds 밖)
          farShelter, // 서울: 37.5, 127.03 (bounds 안)
        ],
      })),
    );

    const shelters = await fetchShelters(origin, bounds);

    expect(shelters).toEqual([farShelter]);
  });
});
