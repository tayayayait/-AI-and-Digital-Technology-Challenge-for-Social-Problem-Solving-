import { describe, expect, test } from "vitest";

import {
  freshness,
  oldestSuccessfulTimestamp,
  relativeAge,
  type SourceTimestamp,
} from "./dataTimestamp";

describe("oldestSuccessfulTimestamp", () => {
  test("실패하거나 대체된 소스를 제외하고 가장 오래된 성공 시각을 반환한다", () => {
    const sources: SourceTimestamp[] = [
      { label: "기상청 단기예보", timestamp: "2026-08-31T08:10:00.000Z", status: "OK" },
      { label: "기상청 기상특보", timestamp: "2026-08-31T08:00:00.000Z", status: "OK" },
      { label: "긴급재난문자", timestamp: "2026-08-31T07:00:00.000Z", status: "FAILED" },
      { label: "ITS 돌발", timestamp: "2026-08-31T06:00:00.000Z", status: "FALLBACK" },
    ];

    expect(oldestSuccessfulTimestamp(sources)).toBe("2026-08-31T08:00:00.000Z");
  });

  test("유효한 성공 시각이 없으면 null을 반환한다", () => {
    expect(oldestSuccessfulTimestamp([])).toBeNull();
    expect(
      oldestSuccessfulTimestamp([{ label: "기상청", timestamp: "not-a-date", status: "OK" }]),
    ).toBeNull();
  });
});

describe("relativeAge", () => {
  const now = Date.parse("2026-08-31T09:00:00.000Z");

  test.each([
    ["2026-08-31T09:00:00.000Z", "방금"],
    ["2026-08-31T08:01:00.000Z", "59분 전"],
    ["2026-08-31T08:00:00.000Z", "1시간 전"],
    ["2026-08-30T10:00:00.000Z", "23시간 전"],
    ["2026-08-30T09:00:00.000Z", "1일 전"],
  ])("%s의 경과 시간을 %s로 표시한다", (timestamp, expected) => {
    expect(relativeAge(timestamp, now)).toBe(expected);
  });

  test("미래나 파싱할 수 없는 시각은 확실한 정보 없음으로 표시한다", () => {
    expect(relativeAge("2026-08-31T09:00:01.000Z", now)).toBe("확실한 정보 없음");
    expect(relativeAge("invalid", now)).toBe("확실한 정보 없음");
    expect(relativeAge(null, now)).toBe("확실한 정보 없음");
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-08-31T09:00:00.000Z");

  test.each([
    ["2026-08-31T08:50:00.000Z", "FRESH"],
    ["2026-08-31T08:49:59.000Z", "AGING"],
    ["2026-08-31T08:00:00.000Z", "AGING"],
    ["2026-08-31T07:59:59.000Z", "STALE"],
    ["2026-08-31T09:00:01.000Z", "UNKNOWN"],
    ["invalid", "UNKNOWN"],
    [null, "UNKNOWN"],
  ])("%s를 %s로 분류한다", (timestamp, expected) => {
    expect(freshness(timestamp, now)).toBe(expected);
  });
});
