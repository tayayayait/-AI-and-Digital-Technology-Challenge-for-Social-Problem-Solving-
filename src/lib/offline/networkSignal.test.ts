import { describe, expect, it, vi } from "vitest";
import { classifyQueryNetworkResult, createQueryNetworkSignal } from "./networkSignal";

describe("createQueryNetworkSignal", () => {
  it("marks the connection unavailable only after two consecutive query failures", () => {
    const signal = createQueryNetworkSignal(2);
    const listener = vi.fn();
    signal.subscribe(listener);

    signal.reportFailure();
    expect(signal.isReachable()).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    signal.reportFailure();
    expect(signal.isReachable()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it("resets the failure streak after a successful query", () => {
    const signal = createQueryNetworkSignal(2);
    signal.reportFailure();
    signal.reportSuccess();
    signal.reportFailure();

    expect(signal.isReachable()).toBe(true);
  });

  it("stops notifying an unsubscribed listener", () => {
    const signal = createQueryNetworkSignal(1);
    const listener = vi.fn();
    const unsubscribe = signal.subscribe(listener);
    unsubscribe();
    signal.reportFailure();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("classifyQueryNetworkResult", () => {
  it("treats remote API fallbacks as failures instead of successful connectivity", () => {
    expect(
      classifyQueryNetworkResult(["traffic-events", "37.4980", "127.0280"], {
        data: [],
        status: "FALLBACK",
        timestamp: "2026-08-31T08:00:00.000Z",
        source: "ITS traffic-events",
        error: "Failed to send a request to the Edge Function",
      }),
    ).toBe("FAILURE");
  });

  it("does not confuse an upstream pending-access fallback with lost connectivity", () => {
    expect(
      classifyQueryNetworkResult(["weather-warning", "서울 강남구"], {
        data: null,
        status: "FALLBACK",
        timestamp: "2026-08-31T08:00:00.000Z",
        source: "kma-weather-warning",
        error: "공공데이터 활용신청 승인 대기",
      }),
    ).toBe("IGNORE");
  });

  it("accepts an OK remote API result as connectivity evidence", () => {
    expect(
      classifyQueryNetworkResult(["weather", 61, 125], {
        data: { rainfallMmPerHour: 0 },
        status: "OK",
        timestamp: "2026-08-31T08:00:00.000Z",
        source: "kma-weather",
      }),
    ).toBe("SUCCESS");
  });

  it("ignores local or mixed-source query successes that can be served offline", () => {
    expect(classifyQueryNetworkResult(["shelters", "37.498", "127.028"], [])).toBe("IGNORE");
  });

  it("treats rejected network requests as connectivity failures", () => {
    expect(
      classifyQueryNetworkResult(["disaster-messages"], new TypeError("Failed to fetch"), true),
    ).toBe("FAILURE");
  });

  it.each(["FALLBACK", "FAILED"])(
    "does not treat %s API timeouts as lost connectivity",
    (status) => {
      for (const error of [
        "API Timeout",
        "Upstream request timed out",
        "Network connection timeout",
      ]) {
        expect(classifyQueryNetworkResult(["traffic-events"], { status, error })).toBe("IGNORE");
      }
    },
  );

  it.each(["FALLBACK", "FAILED"])("ignores %s HTTP and validation errors", (status) => {
    for (const error of [
      "Edge Function returned a non-2xx status code",
      "Invalid response",
      undefined,
    ]) {
      expect(classifyQueryNetworkResult(["weather"], { status, error })).toBe("IGNORE");
    }
  });

  it("does not treat query exceptions alone as proof of lost connectivity", () => {
    for (const error of [new Error("API Timeout"), new Error("Invalid response"), undefined]) {
      expect(classifyQueryNetworkResult(["weather"], error, true)).toBe("IGNORE");
    }
  });
});
