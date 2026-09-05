import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useReverseGeocode } from "./useReverseGeocode";

describe("useReverseGeocode regional fallback", () => {
  test("uses and refreshes coordinate-based text when the map SDK is unavailable", () => {
    const { result, rerender } = renderHook(({ origin }) => useReverseGeocode(origin), {
      initialProps: { origin: { lat: 35.1631, lng: 129.1635 } },
    });

    expect(result.current).toBe("선택 위치 35.1631, 129.1635");

    rerender({ origin: { lat: 35.1796, lng: 129.0756 } });
    expect(result.current).toBe("선택 위치 35.1796, 129.0756");
    expect(result.current).not.toMatch(/서울|강남|역삼|탄천/);
  });
});
