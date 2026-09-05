import { useState, useEffect } from "react";
import { loadNaverMapsSDK } from "@/lib/map/naverMaps";
import type { LatLng } from "@/lib/types";

const readReverseGeocodeAddress = (response: NaverMapsReverseGeocodeResponse) => {
  const address = response.v2?.address;
  return address?.roadAddress || address?.jibunAddress || address?.englishAddress || null;
};

const coordinateRegion = (origin: LatLng) =>
  `선택 위치 ${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;

export function useReverseGeocode(origin: LatLng, fallback?: string) {
  const fallbackRegion = fallback ?? coordinateRegion(origin);
  const [region, setRegion] = useState(fallbackRegion);

  useEffect(() => {
    setRegion(fallbackRegion);
    const maps = window.naver?.maps;
    const service = maps?.Service;
    if (!maps || !service?.reverseGeocode) return;

    service.reverseGeocode(
      {
        coords: new maps.LatLng(origin.lat, origin.lng),
      },
      (status, response) => {
        const okStatus = service.Status?.OK ?? "OK";
        if (status === okStatus) {
          const item = response.v2?.address;
          if (item?.jibunAddress) {
            const parts = item.jibunAddress.split(" ");
            if (parts.length >= 2) {
              setRegion(`${parts[0]} ${parts[1]}`);
            }
          }
        }
      },
    );
  }, [fallbackRegion, origin.lat, origin.lng]);

  return region;
}

export function useReverseGeocodeAddress(origin: LatLng, fallback = "확실한 정보 없음") {
  const [address, setAddress] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    setAddress(fallback);

    const resolveAddress = async () => {
      try {
        await loadNaverMapsSDK();
      } catch (error) {
        console.warn("Failed to load Naver Maps SDK for reverse geocoding", error);
      }

      if (cancelled) return;
      const service = window.naver?.maps?.Service;
      if (!service?.reverseGeocode) return;

      service.reverseGeocode(
        {
          coords: new window.naver!.maps.LatLng(origin.lat, origin.lng),
        },
        (status, response) => {
          if (cancelled) return;
          const okStatus = service.Status?.OK ?? "OK";
          const resolved = status === okStatus ? readReverseGeocodeAddress(response) : null;
          setAddress(resolved ?? fallback);
        },
      );
    };

    void resolveAddress();

    return () => {
      cancelled = true;
    };
  }, [fallback, origin.lat, origin.lng]);

  return address;
}
