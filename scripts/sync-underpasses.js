// 국토교통부 전국도로터널정보표준데이터 CSV -> 앱 정적 데이터 + Supabase 선택적 upsert
//
// 기본값은 공공데이터포털의 현재 원본 CSV다. 내려받은 파일을 재현 입력으로 쓸 수도 있다.
//   node scripts/sync-underpasses.js [CSV 경로 또는 URL]
//
// SUPABASE_URL(또는 VITE_SUPABASE_URL)과 SUPABASE_SERVICE_ROLE_KEY가 모두 있으면
// 정적 파일 생성 후 public.underpasses에도 같은 레코드를 upsert한다.
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import csv from "csv-parser";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

export const UNDERPASS_SOURCE_NAME = "국토교통부 전국도로터널정보표준데이터";
export const UNDERPASS_SOURCE_PAGE = "https://www.data.go.kr/data/15025445/standard.do";
export const DEFAULT_UNDERPASS_SOURCE =
  "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003647346&fileDetailSn=1&insertDataPrcus=N";

const DEFAULT_TS_OUTPUT = resolve(root, "src/data/underpasses.generated.ts");
const DEFAULT_JSON_OUTPUT = resolve(root, "public/data/underpasses.json");

const REQUIRED_COLUMNS = [
  "터널명",
  "터널종류",
  "시도명",
  "시군구명",
  "터널시작점위도",
  "터널시작점경도",
  "터널종료점위도",
  "터널종료점경도",
  "데이터기준일자",
];

const clean = (value) => String(value ?? "").trim();

const coordinate = (value, min, max) => {
  const normalized = clean(value);
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const roundCoordinate = (value) => Number(value.toFixed(6));

const stableId = (row) => {
  const key = [
    clean(row["시군구코드"]),
    clean(row["터널명"]),
    clean(row["도로노선방향"]),
    clean(row["터널시작점위도"]),
    clean(row["터널시작점경도"]),
  ].join("|");
  return `molit-underpass-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
};

export const normalizeUnderpassRow = (row) => {
  if (clean(row["터널종류"]) !== "지하차도") return null;

  const startLat = coordinate(row["터널시작점위도"], -90, 90);
  const startLng = coordinate(row["터널시작점경도"], -180, 180);
  const endLat = coordinate(row["터널종료점위도"], -90, 90);
  const endLng = coordinate(row["터널종료점경도"], -180, 180);
  if (startLat === null || startLng === null || endLat === null || endLng === null) return null;

  const province = clean(row["시도명"]);
  const district = clean(row["시군구명"]);
  const lengthMeters = Number(clean(row["터널연장"]));

  return {
    id: stableId(row),
    name: clean(row["터널명"]) || "이름 없는 지하차도",
    position: {
      lat: roundCoordinate((startLat + endLat) / 2),
      lng: roundCoordinate((startLng + endLng) / 2),
    },
    startPosition: { lat: startLat, lng: startLng },
    endPosition: { lat: endLat, lng: endLng },
    region: [province, district].filter(Boolean).join(" ") || "지역 정보 없음",
    province: province || null,
    district: district || null,
    address: clean(row["소재지지번주소"]) || null,
    roadName: clean(row["도로노선명"]) || null,
    direction: clean(row["도로노선방향"]) || null,
    lengthMeters: Number.isFinite(lengthMeters) ? lengthMeters : null,
    managementAgency: clean(row["관리기관명"]) || null,
    source: UNDERPASS_SOURCE_NAME,
    sourceUpdatedAt: clean(row["데이터기준일자"]) || null,
  };
};

const maxDate = (values) =>
  values
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? ""))
    .sort()
    .at(-1) ?? null;

export const buildUnderpassDataset = (rows, generatedAt = new Date().toISOString()) => {
  const underpasses = rows
    .map((row) => normalizeUnderpassRow(row))
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.region.localeCompare(b.region, "ko") ||
        a.name.localeCompare(b.name, "ko") ||
        a.id.localeCompare(b.id),
    );
  const dataDate = maxDate(underpasses.map((underpass) => underpass.sourceUpdatedAt));

  return {
    source: UNDERPASS_SOURCE_NAME,
    sourceUrl: UNDERPASS_SOURCE_PAGE,
    license: "이용허락범위 제한 없음",
    generatedAt,
    dataDate,
    count: underpasses.length,
    coverage: {
      scope: "NATIONWIDE_REGISTERED",
      label: "전국 등록 지하차도",
      note: "국토교통부 도로 교량 및 터널 현황정보시스템에 등록된 차량용 지하차도",
    },
    underpasses,
  };
};

const clientModule = (dataset) => {
  const rows = dataset.underpasses.map((underpass) => [
    underpass.id,
    underpass.name,
    underpass.position.lat,
    underpass.position.lng,
    underpass.startPosition.lat,
    underpass.startPosition.lng,
    underpass.endPosition.lat,
    underpass.endPosition.lng,
    underpass.region,
    underpass.sourceUpdatedAt,
  ]);

  return `// scripts/sync-underpasses.js가 생성한 파일입니다. 직접 수정하지 마세요.
import type { Underpass } from "../lib/types";

type UnderpassRow = [string, string, number, number, number, number, number, number, string, string | null];

const SOURCE = ${JSON.stringify(dataset.source)};
const ROWS: UnderpassRow[] = ${JSON.stringify(rows)};

export const UNDERPASS_DATASET: {
  source: string;
  sourceUrl: string;
  license: string;
  generatedAt: string;
  dataDate: string | null;
  count: number;
  coverage: { scope: "NATIONWIDE_REGISTERED"; label: string; note: string };
  underpasses: Underpass[];
} = {
  source: SOURCE,
  sourceUrl: ${JSON.stringify(dataset.sourceUrl)},
  license: ${JSON.stringify(dataset.license)},
  generatedAt: ${JSON.stringify(dataset.generatedAt)},
  dataDate: ${JSON.stringify(dataset.dataDate)},
  count: ${dataset.count},
  coverage: ${JSON.stringify(dataset.coverage)},
  underpasses: ROWS.map(([id, name, lat, lng, startLat, startLng, endLat, endLng, region, sourceUpdatedAt]) => ({
    id,
    name,
    position: { lat, lng },
    startPosition: { lat: startLat, lng: startLng },
    endPosition: { lat: endLat, lng: endLng },
    region,
    source: SOURCE,
    sourceUpdatedAt,
  })),
};
`;
};

const validateColumns = (row) => {
  const missing = REQUIRED_COLUMNS.filter((column) => !(column in row));
  if (missing.length > 0) {
    throw new Error(`전국도로터널 CSV 필수 열이 없습니다: ${missing.join(", ")}`);
  }
};

const sourceStream = async (source) => {
  if (!/^https?:\/\//i.test(source)) return createReadStream(source);

  const response = await fetch(source, { redirect: "follow" });
  if (!response.ok) throw new Error(`전국도로터널 CSV 다운로드 실패: HTTP ${response.status}`);
  return Readable.from([Buffer.from(await response.arrayBuffer())]);
};

export const loadUnderpassRows = async (source = DEFAULT_UNDERPASS_SOURCE) => {
  const input = await sourceStream(source);
  return new Promise((resolveRows, rejectRows) => {
    const rows = [];
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      rejectRows(error);
    };

    input
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim(),
        }),
      )
      .on("data", (row) => {
        try {
          if (rows.length === 0) validateColumns(row);
          rows.push(row);
        } catch (error) {
          fail(error);
        }
      })
      .on("error", fail)
      .on("end", () => {
        if (settled) return;
        settled = true;
        resolveRows(rows);
      });
  });
};

const toDatabaseRow = (underpass) => ({
  id: underpass.id,
  name: underpass.name,
  region: underpass.region,
  province: underpass.province,
  district: underpass.district,
  address: underpass.address,
  lat: underpass.position.lat,
  lng: underpass.position.lng,
  start_lat: underpass.startPosition.lat,
  start_lng: underpass.startPosition.lng,
  end_lat: underpass.endPosition.lat,
  end_lng: underpass.endPosition.lng,
  road_name: underpass.roadName,
  road_direction: underpass.direction,
  length_meters: underpass.lengthMeters,
  management_agency: underpass.managementAgency,
  source: underpass.source,
  source_url: UNDERPASS_SOURCE_PAGE,
  source_updated_at: underpass.sourceUpdatedAt,
  synced_at: new Date().toISOString(),
});

const upsertUnderpasses = async (underpasses) => {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl && !serviceRoleKey) return 0;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 적재에는 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 모두 필요합니다.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let synced = 0;
  for (let index = 0; index < underpasses.length; index += 400) {
    const batch = underpasses.slice(index, index + 400).map(toDatabaseRow);
    const { error } = await supabase.from("underpasses").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`underpasses upsert 실패: ${error.message}`);
    synced += batch.length;
  }
  return synced;
};

export const syncUnderpasses = async ({
  source = process.argv[2] ?? process.env.UNDERPASS_CSV_PATH ?? DEFAULT_UNDERPASS_SOURCE,
  tsOutput = process.env.UNDERPASS_TS_OUTPUT_PATH ?? DEFAULT_TS_OUTPUT,
  jsonOutput = process.env.UNDERPASS_JSON_OUTPUT_PATH ?? DEFAULT_JSON_OUTPUT,
} = {}) => {
  const rows = await loadUnderpassRows(source);
  const dataset = buildUnderpassDataset(rows);
  if (dataset.count === 0) throw new Error("좌표가 있는 지하차도 레코드를 찾지 못했습니다.");

  mkdirSync(dirname(tsOutput), { recursive: true });
  mkdirSync(dirname(jsonOutput), { recursive: true });
  writeFileSync(tsOutput, clientModule(dataset), "utf8");
  writeFileSync(jsonOutput, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

  const syncedRows = await upsertUnderpasses(dataset.underpasses);
  return { dataset, tsOutput, jsonOutput, syncedRows };
};

const isDirectRun = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  syncUnderpasses()
    .then(({ dataset, tsOutput, jsonOutput, syncedRows }) => {
      console.log(`지하차도 ${dataset.count}건 -> ${tsOutput}`);
      console.log(`공개 데이터 사본 -> ${jsonOutput}`);
      console.log(
        syncedRows > 0
          ? `Supabase underpasses ${syncedRows}건 upsert 완료`
          : "Supabase 환경변수가 없어 원격 upsert는 건너뛰었습니다.",
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
