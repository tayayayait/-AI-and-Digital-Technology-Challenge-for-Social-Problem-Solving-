import { describe, expect, test } from "vitest";

import { buildUnderpassDataset, normalizeUnderpassRow } from "./sync-underpasses.js";

const row = (overrides = {}) => ({
  터널명: "테스트지하차도",
  터널종류: "지하차도",
  도로노선명: "일반국도1호선",
  도로노선방향: "양방향",
  시도명: "서울특별시",
  시군구명: "강남구",
  시군구코드: "11680",
  소재지지번주소: "서울특별시 강남구 역삼동",
  터널시작점위도: "37.500000",
  터널시작점경도: "127.030000",
  터널종료점위도: "37.502000",
  터널종료점경도: "127.034000",
  터널연장: "420",
  관리기관명: "서울특별시",
  데이터기준일자: "2025-12-31",
  ...overrides,
});

describe("sync-underpasses", () => {
  test("normalizes a vehicle underpass to one midpoint coordinate", () => {
    expect(normalizeUnderpassRow(row(), 0)).toEqual(
      expect.objectContaining({
        name: "테스트지하차도",
        position: { lat: 37.501, lng: 127.032 },
        startPosition: { lat: 37.5, lng: 127.03 },
        endPosition: { lat: 37.502, lng: 127.034 },
        region: "서울특별시 강남구",
        sourceUpdatedAt: "2025-12-31",
      }),
    );
  });

  test("excludes non-underpasses and rows without complete coordinates", () => {
    expect(normalizeUnderpassRow(row({ 터널종류: "도로터널" }), 0)).toBeNull();
    expect(normalizeUnderpassRow(row({ 터널시작점위도: "" }), 1)).toBeNull();
    expect(normalizeUnderpassRow(row({ 터널종료점경도: "" }), 2)).toBeNull();
  });

  test("publishes nationwide coverage and counts only usable underpasses", () => {
    const dataset = buildUnderpassDataset([
      row(),
      row({ 터널명: "좌표없음", 터널시작점경도: "" }),
      row({ 터널명: "일반터널", 터널종류: "도로터널" }),
    ]);

    expect(dataset.count).toBe(1);
    expect(dataset.coverage.scope).toBe("NATIONWIDE_REGISTERED");
    expect(dataset.coverage.label).toContain("전국");
    expect(dataset.underpasses).toHaveLength(1);
  });
});
