import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyQueryNetworkResult, queryNetworkSignal } from "@/lib/offline/networkSignal";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOnlineStatus", () => {
  beforeEach(() => {
    queryNetworkSignal.reset();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  it("reacts to browser offline and online events", () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);

    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("treats two consecutive query failures as offline", () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => queryNetworkSignal.reportFailure());
    expect(result.current).toBe(true);
    act(() => queryNetworkSignal.reportFailure());
    expect(result.current).toBe(false);
    act(() => queryNetworkSignal.reportSuccess());
    expect(result.current).toBe(true);
  });

  it("registers and removes browser event listeners", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useOnlineStatus());

    const onlineHandler = addEventListener.mock.calls.find(([name]) => name === "online")?.[1];
    const offlineHandler = addEventListener.mock.calls.find(([name]) => name === "offline")?.[1];
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("online", onlineHandler);
    expect(removeEventListener).toHaveBeenCalledWith("offline", offlineHandler);
  });

  it("stays online when traffic and CCTV time out after a successful weather request", () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      queryNetworkSignal.reportSuccess();
      for (const key of ["traffic-events", "cctv-info"]) {
        const outcome = classifyQueryNetworkResult([key], {
          status: "FALLBACK",
          error: "API Timeout",
        });
        if (outcome === "FAILURE") queryNetworkSignal.reportFailure();
      }
    });

    expect(navigator.onLine).toBe(true);
    expect(result.current).toBe(true);
  });
});
