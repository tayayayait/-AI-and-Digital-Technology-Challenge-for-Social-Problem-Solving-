type ReachabilityListener = (reachable: boolean) => void;

export type QueryNetworkOutcome = "SUCCESS" | "FAILURE" | "IGNORE";

const CONNECTIVITY_QUERY_KEYS = new Set([
  "weather",
  "weather-warning",
  "disaster-messages",
  "traffic-events",
]);

const NETWORK_ERROR_PATTERN =
  /failed to (fetch|send a request)|network|internet|connection|offline|네트워크|연결/i;
const TIMEOUT_ERROR_PATTERN = /timeout|timed out|시간\s*초과/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isNetworkFailure = (error: unknown) => {
  const message = isRecord(error) ? error.message : error;
  // A slow upstream service does not prove that the device lost connectivity.
  return (
    typeof message === "string" &&
    !TIMEOUT_ERROR_PATTERN.test(message) &&
    NETWORK_ERROR_PATTERN.test(message)
  );
};

/**
 * Query success does not always prove connectivity: shelters can be served by the
 * service worker and several integrations deliberately resolve with FALLBACK.
 */
export const classifyQueryNetworkResult = (
  queryKey: readonly unknown[],
  data: unknown,
  rejected = false,
): QueryNetworkOutcome => {
  const rootKey = queryKey[0];
  if (typeof rootKey !== "string" || !CONNECTIVITY_QUERY_KEYS.has(rootKey)) return "IGNORE";
  if (rejected) return isNetworkFailure(data) ? "FAILURE" : "IGNORE";
  if (!isRecord(data)) return "IGNORE";

  const status = data.status;
  if (status === "OK") return "SUCCESS";
  if (status === "FAILED" || status === "FALLBACK") {
    return isNetworkFailure(data.error) ? "FAILURE" : "IGNORE";
  }
  return "IGNORE";
};

export const createQueryNetworkSignal = (failureThreshold = 2) => {
  let consecutiveFailures = 0;
  let reachable = true;
  const listeners = new Set<ReachabilityListener>();

  const setReachable = (next: boolean) => {
    if (reachable === next) return;
    reachable = next;
    listeners.forEach((listener) => listener(reachable));
  };

  return {
    isReachable: () => reachable,
    reportFailure: () => {
      consecutiveFailures += 1;
      if (consecutiveFailures >= failureThreshold) setReachable(false);
    },
    reportSuccess: () => {
      consecutiveFailures = 0;
      setReachable(true);
    },
    reset: () => {
      consecutiveFailures = 0;
      setReachable(true);
    },
    subscribe: (listener: ReachabilityListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const queryNetworkSignal = createQueryNetworkSignal(2);
