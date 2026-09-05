import { describe, expect, test } from "vitest";

import {
  buildWarningSnapshot,
  normalizeRegionName,
  parseWarningText,
  parseWarningTimestamp,
  parseZoneToken,
  splitTopLevel,
  stripDistrictSuffix,
  toRegionQuery,
  toWeatherAlerts,
  warningAppliesToRegion,
} from "./kmaWarning";

// 2026-08-31 17:00 발표 getPwnStatus 실제 응답 본문.
// 중첩 괄호("보령(도서제외)")와 괄호 없는 광역시("광주, 대구, 부산, 울산")가 함께 들어 있다.
const REAL_T6 = [
  "o 강풍주의보 : 전라남도(흑산도.홍도), 경상북도(안동북부, 안동동남부, 안동서부)",
  "o 호우주의보 : 충청남도(태안, 서산, 서천, 보령(도서제외), 보령도서, 홍성서부), 경상북도(안동북부)",
  "o 폭염경보 : 전라남도(광양, 영암, 흑산도.홍도, 해남남부, 완도(여서도 제외))",
  "o 폭염주의보 : 경상남도, 제주도(제주시서부, 서귀포시남부), 광주, 대구, 부산, 울산",
].join("\r\n");

describe("splitTopLevel", () => {
  test("괄호 안의 쉼표는 자르지 않는다", () => {
    expect(splitTopLevel("충청남도(태안, 서산), 경상북도(안동북부)")).toEqual([
      "충청남도(태안, 서산)",
      "경상북도(안동북부)",
    ]);
  });

  test("중첩 괄호에서도 깊이를 유지한다", () => {
    expect(splitTopLevel("태안, 보령(도서제외), 보령도서")).toEqual([
      "태안",
      "보령(도서제외)",
      "보령도서",
    ]);
  });

  test("빈 토큰은 버린다", () => {
    expect(splitTopLevel("가,, 나, ")).toEqual(["가", "나"]);
  });
});

describe("parseZoneToken", () => {
  test("괄호가 없으면 광역 전역으로 본다", () => {
    expect(parseZoneToken("경상남도")).toEqual({ wide: "경상남도", zones: [] });
  });

  test("세부 구역을 분리한다", () => {
    expect(parseZoneToken("충청남도(태안, 서산, 보령(도서제외))")).toEqual({
      wide: "충청남도",
      zones: ["태안", "서산", "보령(도서제외)"],
    });
  });
});

describe("parseWarningText", () => {
  const warnings = parseWarningText(REAL_T6);

  test("현상과 등급을 분리한다", () => {
    const heavyRain = warnings.filter((warning) => warning.phenomenon === "호우");
    expect(heavyRain).toHaveLength(2);
    expect(heavyRain[0].grade).toBe("주의보");
    expect(heavyRain[0].level).toBe("WARNING");
    expect(heavyRain[0].wide).toBe("충청남도");
    expect(heavyRain[0].zones).toContain("보령(도서제외)");
  });

  test("경보는 CRITICAL로 올린다", () => {
    const heat = warnings.find((warning) => warning.grade === "경보");
    expect(heat?.phenomenon).toBe("폭염");
    expect(heat?.level).toBe("CRITICAL");
  });

  test("침수 관련 현상만 floodRelevant로 표시한다", () => {
    expect(
      warnings.filter((warning) => warning.floodRelevant).every((w) => w.phenomenon === "호우"),
    ).toBe(true);
    expect(warnings.some((warning) => warning.phenomenon === "폭염" && warning.floodRelevant)).toBe(
      false,
    );
  });

  test("괄호 없는 광역시를 개별 항목으로 읽는다", () => {
    const heatWatch = warnings.filter(
      (warning) => warning.grade === "주의보" && warning.phenomenon === "폭염",
    );
    expect(heatWatch.map((warning) => warning.wide)).toEqual(
      expect.arrayContaining(["경상남도", "제주도", "광주", "대구", "부산", "울산"]),
    );
  });

  test("발효 특보가 없으면 빈 배열", () => {
    expect(parseWarningText("o 없음\r\n\r\n")).toEqual([]);
    expect(parseWarningText("")).toEqual([]);
    expect(parseWarningText(undefined)).toEqual([]);
  });
});

describe("normalizeRegionName", () => {
  test("광역 접미사와 구분점만 제거한다", () => {
    expect(normalizeRegionName("서울특별시")).toBe("서울");
    expect(normalizeRegionName("부산광역시")).toBe("부산");
    expect(normalizeRegionName("제주특별자치도")).toBe("제주");
    expect(normalizeRegionName("충청남도")).toBe("충청남도");
  });

  test("섬 이름의 끝 글자를 행정구역 접미사로 오인하지 않는다", () => {
    expect(normalizeRegionName("흑산도.홍도")).toBe("흑산도홍도");
    expect(normalizeRegionName("보령도서")).toBe("보령도서");
  });
});

describe("stripDistrictSuffix", () => {
  test("시군구 접미사를 뗀다", () => {
    expect(stripDistrictSuffix("강남구")).toBe("강남");
    expect(stripDistrictSuffix("태안군")).toBe("태안");
    expect(stripDistrictSuffix("천안시")).toBe("천안");
  });

  test("도는 떼지 않고, 한 글자 이름은 그대로 둔다", () => {
    expect(stripDistrictSuffix("홍도")).toBe("홍도");
    expect(stripDistrictSuffix("구")).toBe("구");
  });
});

describe("광역 표기 차이 흡수", () => {
  const warnings = parseWarningText("o 호우주의보 : 제주도(제주시서부), 전북자치도(고창)");

  test("제주특별자치도와 제주도를 같은 광역으로 본다", () => {
    expect(warningAppliesToRegion(warnings[0], "제주특별자치도 제주시")).toBe(true);
  });

  test("전북특별자치도와 전북자치도를 같은 광역으로 본다", () => {
    expect(warningAppliesToRegion(warnings[1], "전북특별자치도 고창군")).toBe(true);
  });

  test("남도와 북도는 섞이지 않는다", () => {
    const chungnam = parseWarningText("o 호우주의보 : 충청남도")[0];
    expect(warningAppliesToRegion(chungnam, "충청북도 청주시")).toBe(false);
  });
});

describe("warningAppliesToRegion", () => {
  const warnings = parseWarningText(REAL_T6);
  const heavyRainChungnam = warnings.find(
    (warning) => warning.phenomenon === "호우" && warning.wide === "충청남도",
  )!;

  test("세부 구역이 일치하면 발효로 본다", () => {
    expect(warningAppliesToRegion(heavyRainChungnam, "충청남도 태안군")).toBe(true);
  });

  test("같은 광역이라도 다른 시군이면 비해당", () => {
    expect(warningAppliesToRegion(heavyRainChungnam, "충청남도 천안시")).toBe(false);
  });

  test("광역이 다르면 비해당", () => {
    expect(warningAppliesToRegion(heavyRainChungnam, "서울특별시 강남구")).toBe(false);
  });

  test("세부 구역이 없으면 광역 전역 발효", () => {
    const gyeongnam = warnings.find((warning) => warning.wide === "경상남도")!;
    expect(warningAppliesToRegion(gyeongnam, "경상남도 창원시")).toBe(true);
  });

  test("괄호 없는 광역시는 도시 전역 발효", () => {
    const busan = warnings.find((warning) => warning.wide === "부산")!;
    expect(warningAppliesToRegion(busan, "부산광역시 해운대구")).toBe(true);
  });
});

describe("toRegionQuery", () => {
  test("서울 자치구를 기상청 권역으로 옮긴다", () => {
    const query = toRegionQuery("서울특별시 강남구");
    expect(query.wide).toBe("서울");
    expect(query.candidates).toEqual(expect.arrayContaining(["동남권", "서울동남권"]));
  });

  test("서울이 아니면 자치구를 그대로 후보로 쓴다", () => {
    expect(toRegionQuery("충청남도 태안군").candidates).toEqual(["태안"]);
  });
});

describe("parseWarningTimestamp", () => {
  test("KST 기준 ISO 문자열로 바꾼다", () => {
    expect(parseWarningTimestamp("202608311700")).toBe("2026-08-31T17:00:00+09:00");
    expect(parseWarningTimestamp(202608311700)).toBe("2026-08-31T17:00:00+09:00");
  });

  test("형식이 다르면 null", () => {
    expect(parseWarningTimestamp("2026083117")).toBeNull();
    expect(parseWarningTimestamp(undefined)).toBeNull();
  });
});

describe("buildWarningSnapshot", () => {
  const item = { t6: REAL_T6, tmFc: 202608311700 };

  test("호우주의보 지역은 floodLevel을 WARNING으로 올린다", () => {
    const snapshot = buildWarningSnapshot(item, "충청남도 태안군");
    expect(snapshot.floodLevel).toBe("WARNING");
    expect(snapshot.announcedAt).toBe("2026-08-31T17:00:00+09:00");
  });

  test("폭염만 발효 중인 지역은 침수 위험으로 올리지 않는다", () => {
    const snapshot = buildWarningSnapshot(item, "부산광역시 해운대구");
    expect(snapshot.warnings).not.toHaveLength(0);
    expect(snapshot.floodLevel).toBeNull();
  });

  test("특보가 없는 지역은 빈 스냅샷", () => {
    const snapshot = buildWarningSnapshot(item, "서울특별시 강남구");
    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.floodLevel).toBeNull();
    expect(snapshot.nationwideCount).toBeGreaterThan(0);
  });

  test("응답이 비어도 죽지 않는다", () => {
    expect(buildWarningSnapshot(undefined, "서울특별시 강남구").warnings).toEqual([]);
  });
});

describe("toWeatherAlerts", () => {
  test("내부 WeatherAlert 형태로 변환한다", () => {
    const snapshot = buildWarningSnapshot({ t6: REAL_T6, tmFc: 202608311700 }, "충청남도 태안군");
    const alerts = toWeatherAlerts(snapshot);
    expect(alerts[0]).toMatchObject({
      level: "WARNING",
      title: "호우주의보",
      issuedAt: "2026-08-31T17:00:00+09:00",
      floodRelevant: true,
    });
    expect(alerts[0].zone).toContain("충청남도");
  });
});
