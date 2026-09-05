import { DEMO_CENTER } from "@/mocks/data";
import type { LatLng } from "./types";

export interface GeocodeResult {
  id: string;
  label: string;
  address: string;
  position: LatLng;
  source: "NAVER" | "FALLBACK";
}

export type AddressQueryValidation = { ok: true; value: string } | { ok: false; error: string };

export const validateAddressQuery = (query: string): AddressQueryValidation => {
  const value = query.trim();
  if (value.length < 2) {
    return {
      ok: false,
      error: "주소 또는 장소명을 2글자 이상 입력하세요.",
    };
  }
  if (value.length > 80) {
    return {
      ok: false,
      error: "주소 또는 장소명은 80글자 이하로 입력하세요.",
    };
  }
  return { ok: true, value };
};

const fallbackResult = (query: string): GeocodeResult[] => [
  {
    id: "fallback-demo-center",
    label: query,
    address: "확실한 정보 없음",
    position: DEMO_CENTER,
    source: "FALLBACK",
  },
];

type NaverGeocodeAddress = NonNullable<
  NonNullable<NaverMapsGeocodeResponse["v2"]>["addresses"]
>[number];

const parseNaverAddress = (
  query: string,
  address: NaverGeocodeAddress,
  index: number,
): GeocodeResult | null => {
  const lat = Number(address.y);
  const lng = Number(address.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const resolvedAddress =
    address.roadAddress || address.jibunAddress || address.englishAddress || query;

  return {
    id: `naver-${index}`,
    label: resolvedAddress,
    address: resolvedAddress,
    position: { lat, lng },
    source: "NAVER",
  };
};

import { supabase } from "@/integrations/supabase/client";
import { loadNaverMapsSDK } from "@/lib/map/naverMaps";

export const geocodeAddress = async (query: string): Promise<GeocodeResult[]> => {
  const validation = validateAddressQuery(query);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  try {
    await loadNaverMapsSDK();
  } catch (err) {
    console.warn("Failed to load Naver Maps SDK for geocoding", err);
  }

  const service = window.naver?.maps?.Service;
  if (!service?.geocode) {
    return fallbackResult(validation.value);
  }

  return new Promise((resolve) => {
    service.geocode({ query: validation.value }, async (status, response) => {
      const okStatus = service.Status?.OK ?? "OK";

      let results: GeocodeResult[] = [];

      if (status === okStatus) {
        const addresses = response.v2?.addresses ?? [];
        results = addresses
          .map((address, index) => parseNaverAddress(validation.value, address, index))
          .filter((result): result is GeocodeResult => result !== null);
      }

      // If geocoding failed or returned no results, try local search for POIs
      if (results.length === 0) {
        try {
          const { data, error } = await supabase.functions.invoke("naver-local-search", {
            body: { query: validation.value },
          });

          if (!error && data?.items && Array.isArray(data.items)) {
            results = data.items.flatMap((item: unknown, index: number) => {
              if (!item || typeof item !== "object") return [];
              const localItem = item as Record<string, unknown>;
              // Naver Local API returns mapx/mapy as WGS84 * 10^7 (e.g. 1269723429)
              const lng = Number(localItem.mapx) / 10000000;
              const lat = Number(localItem.mapy) / 10000000;
              const title =
                typeof localItem.title === "string"
                  ? localItem.title.replace(/<[^>]+>/g, "")
                  : validation.value;
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
              const address =
                (typeof localItem.roadAddress === "string" && localItem.roadAddress) ||
                (typeof localItem.address === "string" && localItem.address) ||
                "확실한 정보 없음";

              return [
                {
                  id: `naver-local-${index}`,
                  label: title,
                  address,
                  position: { lat, lng },
                  source: "NAVER" as const,
                },
              ];
            });
          }
        } catch (err) {
          console.warn("Naver Local Search fallback failed", err);
        }
      }

      resolve(results.length > 0 ? results : fallbackResult(validation.value));
    });
  });
};
