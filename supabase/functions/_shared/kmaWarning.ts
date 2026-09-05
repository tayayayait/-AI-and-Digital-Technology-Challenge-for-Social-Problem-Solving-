// 기상청 기상특보 조회서비스(WthrWrnInfoService) getPwnStatus 응답 정규화.
//
// getPwnStatus는 전국 특보 현황을 구조화된 필드가 아니라 자연어 텍스트 한 덩어리로 준다.
//
//   t6: "o 호우주의보 : 충청남도(태안, 서산, 보령(도서제외), 홍성서부), 경상북도(안동북부)
//        o 폭염경보 : 전라남도(광양, 영암), 광주, 대구"
//
// 광역명 뒤 괄호가 세부 구역 목록이고, 그 안에 "보령(도서제외)"처럼 괄호가 한 겹 더
// 들어간다. 따라서 단순 split(",")이나 정규식으로는 끊을 수 없고 괄호 깊이를 세야 한다.

export type WarningLevel = "WATCH" | "WARNING" | "CRITICAL";

export interface ParsedWarning {
  /** 현상명. 호우, 강풍, 폭염, 태풍 등 */
  phenomenon: string;
  /** 등급 원문. 주의보, 경보, 예비특보 */
  grade: string;
  level: WarningLevel;
  /** 광역 구역명. 충청남도, 서울, 부산 등 */
  wide: string;
  /** 세부 구역명 목록. 비어 있으면 광역 전역 발효를 뜻한다. */
  zones: string[];
  /** 침수 위험도 산정에 반영할 현상인지 여부 */
  floodRelevant: boolean;
}

/** 침수·범람 위험과 직접 연결되는 현상만 위험도에 가산한다. */
const FLOOD_RELEVANT_PHENOMENA = ["호우", "태풍", "홍수", "해일"];

const GRADE_LEVEL: Array<[string, WarningLevel]> = [
  ["경보", "CRITICAL"],
  ["주의보", "WARNING"],
  ["예비특보", "WATCH"],
];

/**
 * 기상청 서울 특보구역은 자치구가 아니라 4개 권역이다.
 * 역지오코딩이 돌려주는 자치구명을 권역명으로 옮기기 위한 표.
 */
const SEOUL_DISTRICT_ZONES: Record<string, string> = {
  강남: "동남권",
  서초: "동남권",
  송파: "동남권",
  강동: "동남권",
  성동: "동북권",
  광진: "동북권",
  동대문: "동북권",
  중랑: "동북권",
  성북: "동북권",
  강북: "동북권",
  도봉: "동북권",
  노원: "동북권",
  양천: "서남권",
  강서: "서남권",
  구로: "서남권",
  금천: "서남권",
  영등포: "서남권",
  동작: "서남권",
  관악: "서남권",
  종로: "서북권",
  중: "서북권",
  용산: "서북권",
  은평: "서북권",
  서대문: "서북권",
  마포: "서북권",
};

/** 괄호 깊이를 세면서 최상위 구분자에서만 자른다. */
export const splitTopLevel = (value: string, separator = ",") => {
  const parts: string[] = [];
  let depth = 0;
  let buffer = "";

  for (const char of value) {
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);

    if (char === separator && depth === 0) {
      parts.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += char;
  }

  parts.push(buffer.trim());
  return parts.filter((part) => part.length > 0);
};

/** "충청남도(태안, 보령(도서제외))" -> { wide, zones } */
export const parseZoneToken = (token: string): { wide: string; zones: string[] } => {
  const open = token.indexOf("(");
  if (open < 0) return { wide: token.trim(), zones: [] };

  const close = token.lastIndexOf(")");
  const wide = token.slice(0, open).trim();
  const inner = token.slice(open + 1, close < open ? token.length : close);
  return { wide, zones: splitTopLevel(inner) };
};

const gradeOf = (headline: string) => {
  for (const [grade, level] of GRADE_LEVEL) {
    if (headline.endsWith(grade)) {
      return { grade, level, phenomenon: headline.slice(0, -grade.length).trim() };
    }
  }
  return null;
};

/**
 * t6(특보발효현황) 본문을 특보 목록으로 변환한다.
 * "o 없음" 처럼 발효 중인 특보가 없으면 빈 배열을 돌려준다.
 */
export const parseWarningText = (text: string | undefined | null): ParsedWarning[] => {
  if (!text) return [];

  const warnings: ParsedWarning[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^o\s*/, "");
    if (!line || line === "없음") continue;

    const separator = line.indexOf(":");
    if (separator < 0) continue;

    const headline = line.slice(0, separator).trim();
    const body = line.slice(separator + 1).trim();
    if (!body || body === "없음") continue;

    const parsed = gradeOf(headline);
    if (!parsed) continue;

    const floodRelevant = FLOOD_RELEVANT_PHENOMENA.some((name) => parsed.phenomenon.includes(name));

    for (const token of splitTopLevel(body)) {
      const { wide, zones } = parseZoneToken(token);
      if (!wide) continue;
      warnings.push({ ...parsed, wide, zones, floodRelevant });
    }
  }

  return warnings;
};

/**
 * 비교를 위해 광역 접미사와 공백·구분점만 걷어낸다.
 *
 * 단일 글자 접미사(시·군·구·도)는 여기서 지우지 않는다. 특보구역에는 "흑산도.홍도",
 * "보령도서"처럼 행정구역 접미사가 아닌 글자로 끝나는 이름이 섞여 있어서, 마지막
 * 한 글자를 무조건 떼면 섬 이름이 훼손된다. 시군구 접미사 제거는 행정구역명이라고
 * 확신할 수 있는 자리에서만 stripDistrictSuffix로 따로 처리한다.
 */
export const normalizeRegionName = (value: string) =>
  value
    .replace(/특별자치시|특별자치도|특별시|광역시|자치시|자치도/g, "")
    .replace(/[\s.·]/g, "")
    .trim();

/** 역지오코딩이 준 시군구명에서만 접미사를 뗀다. "도"는 대상이 아니다. */
export const stripDistrictSuffix = (value: string) =>
  value.length > 1 ? value.replace(/[시군구]$/u, "") : value;

/**
 * "서울특별시 강남구" 같은 역지오코딩 결과를 광역명과 세부 후보 목록으로 분해한다.
 * 서울은 자치구가 특보구역이 아니므로 권역명을 후보에 함께 넣는다.
 */
export const toRegionQuery = (region: string) => {
  const tokens = region.split(/\s+/).filter(Boolean);
  const wide = normalizeRegionName(tokens[0] ?? "");
  const district = stripDistrictSuffix(normalizeRegionName(tokens[1] ?? ""));

  const candidates = [district].filter(Boolean);
  if (wide.startsWith("서울") && SEOUL_DISTRICT_ZONES[district]) {
    candidates.push(SEOUL_DISTRICT_ZONES[district]);
    candidates.push(`서울${SEOUL_DISTRICT_ZONES[district]}`);
  }

  return { wide, district, candidates };
};

/** 특보 1건이 해당 지역에 발효 중인지 판정한다. */
export const warningAppliesToRegion = (warning: ParsedWarning, region: string) => {
  const { wide, candidates } = toRegionQuery(region);
  if (!wide) return false;

  const warningWide = normalizeRegionName(warning.wide);
  if (!warningWide) return false;

  // 광역명은 양쪽 표기가 어긋난다. 역지오코딩은 "제주특별자치도"를 주고 특보는
  // "제주도"라고 쓰며, "전북특별자치도"와 "전북자치도"도 마찬가지다. 접두 일치가
  // 아니라 서로 포함 관계인지로 판정해야 두 표기를 모두 잡는다.
  // 경상남도/경상북도, 충청남도/충청북도처럼 서로 포함하지 않는 이름끼리는
  // 이 방식으로도 섞이지 않는다.
  if (!warningWide.includes(wide) && !wide.includes(warningWide)) return false;

  // 세부 구역 목록이 없으면 광역 전역 발효다.
  if (warning.zones.length === 0) return true;
  if (candidates.length === 0) return false;

  return warning.zones.some((zone) => {
    const normalized = normalizeRegionName(zone);
    return candidates.some(
      (candidate) => normalized.includes(candidate) || candidate.includes(normalized),
    );
  });
};

const LEVEL_RANK: Record<WarningLevel, number> = { WATCH: 1, WARNING: 2, CRITICAL: 3 };

export interface WarningSnapshot {
  /** 해당 지역에 발효 중인 특보 */
  warnings: ParsedWarning[];
  /** 그중 침수 관련 최고 등급. 없으면 null */
  floodLevel: WarningLevel | null;
  /** 발표시각 (ISO) */
  announcedAt: string | null;
  /** 전국 발효 건수. 지역 필터 전 기준 */
  nationwideCount: number;
}

/** "202608311700" -> ISO 문자열 */
export const parseWarningTimestamp = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!/^\d{12}$/.test(raw)) return null;
  const [year, month, day, hour, minute] = [
    raw.slice(0, 4),
    raw.slice(4, 6),
    raw.slice(6, 8),
    raw.slice(8, 10),
    raw.slice(10, 12),
  ];
  // 기상청 발표시각은 KST 기준이다.
  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
};

export interface PwnStatusItem {
  t6?: unknown;
  t7?: unknown;
  tmFc?: unknown;
  tmEf?: unknown;
}

/** getPwnStatus 응답 item + 지역명 -> 해당 지역 특보 스냅샷 */
export const buildWarningSnapshot = (
  item: PwnStatusItem | undefined,
  region: string,
): WarningSnapshot => {
  const all = parseWarningText(typeof item?.t6 === "string" ? item.t6 : "");
  const warnings = all.filter((warning) => warningAppliesToRegion(warning, region));

  const floodLevel = warnings
    .filter((warning) => warning.floodRelevant)
    .reduce<WarningLevel | null>((highest, warning) => {
      if (!highest) return warning.level;
      return LEVEL_RANK[warning.level] > LEVEL_RANK[highest] ? warning.level : highest;
    }, null);

  return {
    warnings,
    floodLevel,
    announcedAt: parseWarningTimestamp(item?.tmFc),
    nationwideCount: all.length,
  };
};

/** 내부 WeatherAlert 형태로 변환한다. */
export const toWeatherAlerts = (snapshot: WarningSnapshot) =>
  snapshot.warnings.map((warning, index) => ({
    id: `kma-warn-${snapshot.announcedAt ?? "unknown"}-${index}`,
    level: warning.level,
    title: `${warning.phenomenon}${warning.grade}`,
    issuedAt: snapshot.announcedAt ?? "",
    zone: warning.zones.length > 0 ? `${warning.wide}(${warning.zones.join(", ")})` : warning.wide,
    floodRelevant: warning.floodRelevant,
  }));
