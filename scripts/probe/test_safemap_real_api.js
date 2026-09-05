import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Read serviceKey from .env or apikey.json (if exists)
let serviceKey = "";
try {
  const envText = fs.readFileSync(path.join(projectRoot, ".env"), "utf8");
  const match = envText.match(/SAFEMAP_SERVICE_KEY=(.*)/);
  if (match) serviceKey = match[1].trim();
} catch (e) {}

if (!serviceKey) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(projectRoot, "apikey.json"), "utf8"));
    serviceKey = json.SAFEMAP_SERVICE_KEY || json.safemap;
  } catch (e) {}
}

if (!serviceKey) {
  console.log("No service key found");
  process.exit(1);
}

// 대구 염색단지/서대구 부근 좌표
const centerLat = 35.882;
const centerLng = 128.538;

// WmsBounds (radius ~ 500m)
const latDelta = 500 / 111320;
const lngDelta = 500 / (111320 * Math.cos(centerLat * (Math.PI / 180)));
const bounds = {
  south: centerLat - latDelta,
  north: centerLat + latDelta,
  west: centerLng - lngDelta,
  east: centerLng + lngDelta,
};

const formatBbox = (b) => [b.west, b.south, b.east, b.north].map((v) => v.toFixed(6)).join(",");
const bbox = formatBbox(bounds);

const url = `https://www.safemap.go.kr/openapi2/IF_0092_WMS?serviceKey=${serviceKey}&service=WMS&request=GetFeatureInfo&version=1.1.1&layers=A2SM_FLUDMARKS&query_layers=A2SM_FLUDMARKS&styles=&srs=EPSG:4326&bbox=${bbox}&format=image/png&width=256&height=256&info_format=application/json&feature_count=10&x=128&y=128`;

console.log("Requesting: " + url);

https
  .get(url, (res) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => {
      console.log("--- RESPONSE START ---");
      console.log(data);
      console.log("--- RESPONSE END ---");

      // Test our parsing logic
      const text = data;
      if (
        text.includes("gml:featureMember") ||
        text.includes("<FIELDS ") ||
        text.includes("A2SM_FLUDMARKS") ||
        text.includes("A2SM_FLOODFOVRRISK1")
      ) {
        console.log("SUCCESS: Fallback parser WILL detect features here.");
      } else {
        console.log("FAILED: Fallback parser WILL NOT detect features here.");
      }
    });
  })
  .on("error", (err) => {
    console.log("Error: " + err.message);
  });
