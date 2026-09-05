import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function haversineMeters(pos1, pos2) {
  const R = 6371e3;
  const lat1 = (pos1.lat * Math.PI) / 180;
  const lat2 = (pos2.lat * Math.PI) / 180;
  const deltaLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
  const deltaLng = ((pos2.lng - pos1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const origin = { lat: 36.1, lng: 128.4 };
const data = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "public/data/shelters.json"), "utf8"),
);

const sorted = data
  .map((s) => ({
    s,
    d: haversineMeters(origin, s.position),
  }))
  .sort((a, b) => a.d - b.d);

console.log("Top 3 closest:");
sorted.slice(0, 3).forEach((x) => console.log(x.s.name, x.d));

console.log("\nFind �������б�:");
const gaepo = sorted.find((x) => x.s.name.includes("�������б�"));
console.log(gaepo.s.name, gaepo.d);
