import { useApiHealthStore } from "@/store/apiHealth";
import type { ApiResult } from "./types";

type ApiHealthReporter = (name: string, result: ApiResult<unknown>, durationMs?: number) => void;

interface MeasureApiHealthOptions<T> {
  name: string;
  source: string;
  run: () => Promise<ApiResult<T>>;
  report?: ApiHealthReporter;
  now?: () => number;
  wallNow?: () => Date;
}

const clientNow = () =>
  typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();

const defaultReporter: ApiHealthReporter = (name, result, durationMs) => {
  useApiHealthStore.getState().report(name, result, durationMs);
};

export const measureApiHealth = async <T>({
  name,
  source,
  run,
  report = defaultReporter,
  now = clientNow,
  wallNow = () => new Date(),
}: MeasureApiHealthOptions<T>): Promise<ApiResult<T>> => {
  const startedAt = now();
  try {
    const result = await run();
    report(name, result, Math.max(0, now() - startedAt));
    return result;
  } catch (error) {
    const failedResult: ApiResult<T> = {
      data: null,
      status: "FAILED",
      timestamp: wallNow().toISOString(),
      source,
      error: error instanceof Error ? error.message : "API request failed",
    };
    report(name, failedResult, Math.max(0, now() - startedAt));
    throw error;
  }
};
