// 기상청 특보구역코드 안내 xlsx -> public/data/warning-zones.json
//
// 특보구역은 기상청이 비정기적으로 개정한다. 개정본 xlsx를 받으면 이 스크립트를 다시 실행한다.
//   node scripts/sync-warning-zones.js [xlsx경로]
//
// xlsx는 zip + XML이므로 외부 의존성 없이 Node 내장 zlib으로 직접 읽는다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const SOURCE =
  process.argv[2] ??
  process.env.WARNING_ZONE_XLSX_PATH ??
  resolve(root, "기상청21_기상특보 조회서비스_오픈API활용가이드_특보구역코드안내(260601).xlsx");
const OUTPUT =
  process.env.WARNING_ZONE_OUTPUT_PATH ?? resolve(root, "public/data/warning-zones.json");

/** zip 중앙 디렉터리를 훑어 { 파일명: 원본버퍼 } 를 만든다. */
const readZipEntries = (buffer) => {
  const EOCD = 0x06054b50;
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== EOCD) eocd--;
  if (eocd < 0) throw new Error("xlsx(zip) 구조를 읽을 수 없습니다.");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const decodeXmlText = (value) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");

/** sharedStrings.xml: <si> 안의 모든 <t> 를 이어 붙인 것이 문자열 1건이다. */
const readSharedStrings = (xml) => {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXmlText(t[1])).join(""),
  );
};

const columnIndex = (address) => {
  const letters = address.match(/^[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((sum, ch) => sum * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
};

/** 워크시트 XML -> 행 배열(열 위치 보존). */
const readSheetRows = (xml, sharedStrings) =>
  [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = [];
    for (const cell of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1];
      const address = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const rawValue =
        type === "inlineStr"
          ? [...cell[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")
          : (cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      if (!address || rawValue === "") continue;
      const value =
        type === "s" ? (sharedStrings[Number(rawValue)] ?? "") : decodeXmlText(rawValue);
      cells[columnIndex(address)] = value;
    }
    return cells;
  });

/** workbook.xml + rels 로 시트 이름 -> 실제 xml 경로를 찾는다. */
const resolveSheetPath = (entries, sheetName) => {
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const sheetTag = [...workbook.matchAll(/<sheet[^>]*\/>/g)].find((tag) =>
    tag[0].includes(`name="${sheetName}"`),
  );
  if (!sheetTag) throw new Error(`시트 "${sheetName}" 을 찾을 수 없습니다.`);
  const relId = sheetTag[0].match(/r:id="([^"]+)"/)?.[1];
  const target = rels.match(new RegExp(`Id="${relId}"[^>]*Target="([^"]+)"`))?.[1];
  if (!target) throw new Error(`시트 "${sheetName}" 의 경로를 찾을 수 없습니다.`);
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
};

const HEADERS = ["# REG_ID", "TM_ST", "TM_ED", "REG_SP", "REG_UP", "REG_KO", "REG_NAME"];

const build = () => {
  const entries = readZipEntries(readFileSync(SOURCE));
  const sharedStrings = readSharedStrings(entries.get("xl/sharedStrings.xml")?.toString("utf8"));
  const sheetPath = resolveSheetPath(entries, "Sheet2");
  const rows = readSheetRows(entries.get(sheetPath).toString("utf8"), sharedStrings);

  const headerRow = rows.findIndex((row) => row[0] === HEADERS[0]);
  if (headerRow < 0) throw new Error("Sheet2 헤더(# REG_ID)를 찾을 수 없습니다.");

  const currentYear = new Date().getFullYear();
  const isActive = (endValue) => {
    const year = Number(String(endValue ?? "").slice(0, 4));
    return Number.isFinite(year) ? year >= currentYear : true;
  };

  const zones = rows
    .slice(headerRow + 1)
    .filter((row) => row[0]?.startsWith("L") && isActive(row[2]))
    .map((row) => ({
      code: row[0].trim(),
      parent: row[4] && row[4] !== "0" ? row[4].trim() : null,
      level: Number(row[3]),
      name: (row[5] ?? "").trim(),
      fullName: (row[6] ?? row[5] ?? "").trim(),
    }));

  const byCode = new Map(zones.map((zone) => [zone.code, zone]));

  // 광역 조상을 각 구역에 붙인다. 특보 통보문이 "충청남도(태안, ...)" 형태로 광역명과
  // 세부구역명을 함께 쓰기 때문에 매칭에 광역명이 필요하다.
  //
  // 레벨 번호로는 광역을 판정할 수 없다. 도는 L2, 광역시는 L102이고 태안(L113)처럼
  // 중간 단계를 건너뛰고 도에 바로 붙는 구역도 있다. 따라서 "전국(L1)의 자식"까지
  // 부모 체인을 거슬러 올라가는 방식으로 판정한다.
  const NATIONWIDE = "L1000000";
  const wideName = (zone) => {
    let cursor = zone;
    const seen = new Set();
    while (cursor && !seen.has(cursor.code)) {
      seen.add(cursor.code);
      if (!cursor.parent || cursor.parent === NATIONWIDE) {
        return cursor.code === NATIONWIDE ? null : cursor.name;
      }
      cursor = byCode.get(cursor.parent);
    }
    return null;
  };

  return {
    source: "기상청 기상특보 조회서비스 특보구역코드안내",
    generatedAt: new Date().toISOString(),
    count: zones.length,
    zones: zones.map((zone) => ({ ...zone, wide: wideName(zone) })),
  };
};

const result = build();
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf-8");

const levels = result.zones.reduce((acc, zone) => {
  acc[zone.level] = (acc[zone.level] ?? 0) + 1;
  return acc;
}, {});
console.log(`특보구역 ${result.count}건 -> ${OUTPUT}`);
console.log("레벨별 분포:", levels);
