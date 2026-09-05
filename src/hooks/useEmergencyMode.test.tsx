import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { RiskLevel } from "@/lib/types";
import { EMERGENCY_EXIT_DELAY_MS, useEmergencyMode } from "./useEmergencyMode";

describe("useEmergencyMode", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("CRITICAL에는 즉시 진입하고 하향 등급이 30초 유지된 뒤 해제한다", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ level }: { level: RiskLevel }) => useEmergencyMode(level),
      { initialProps: { level: "WARNING" as RiskLevel } },
    );

    expect(result.current).toBe(false);

    rerender({ level: "CRITICAL" });
    expect(result.current).toBe(true);

    rerender({ level: "WARNING" });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(EMERGENCY_EXIT_DELAY_MS - 1);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  test("30초 안에 CRITICAL로 돌아오면 해제를 취소한다", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ level }: { level: RiskLevel }) => useEmergencyMode(level),
      { initialProps: { level: "CRITICAL" as RiskLevel } },
    );

    rerender({ level: "WARNING" });
    act(() => {
      vi.advanceTimersByTime(EMERGENCY_EXIT_DELAY_MS - 1_000);
    });
    rerender({ level: "CRITICAL" });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current).toBe(true);
  });
});
