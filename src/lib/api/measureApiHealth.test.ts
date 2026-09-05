import { describe, expect, test, vi } from "vitest";

import type { ApiResult } from "./types";
import { measureApiHealth } from "./measureApiHealth";

describe("measureApiHealth", () => {
  test("클라이언트 경과시간과 ApiResult를 실측 스토어에 보고한다", async () => {
    const report = vi.fn();
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(235.6);
    const apiResult: ApiResult<string> = {
      data: "ok",
      status: "OK",
      timestamp: "2026-09-03T04:00:00.000Z",
      source: "unit",
    };

    const returned = await measureApiHealth({
      name: "기상청 초단기실황/단기예보",
      source: "unit",
      run: () => Promise.resolve(apiResult),
      report,
      now,
    });

    expect(returned).toBe(apiResult);
    expect(report).toHaveBeenCalledWith("기상청 초단기실황/단기예보", apiResult, 135.6);
  });

  test("호출 예외도 FAILED 실측으로 보고한 뒤 원래 오류를 다시 던진다", async () => {
    const report = vi.fn();
    const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(42);
    const error = new Error("network offline");

    await expect(
      measureApiHealth({
        name: "행정안전부 긴급재난문자",
        source: "MOIS-DSSP-IF-00247",
        run: () => Promise.reject(error),
        report,
        now,
        wallNow: () => new Date("2026-09-03T04:00:00.000Z"),
      }),
    ).rejects.toBe(error);

    expect(report).toHaveBeenCalledWith(
      "행정안전부 긴급재난문자",
      {
        data: null,
        status: "FAILED",
        timestamp: "2026-09-03T04:00:00.000Z",
        source: "MOIS-DSSP-IF-00247",
        error: "network offline",
      },
      32,
    );
  });
});
