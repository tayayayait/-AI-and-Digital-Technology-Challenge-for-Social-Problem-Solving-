import { readRequiredEnv } from "./load-env.js";

const API_URL = "https://openapi.its.go.kr:9443/eventInfo";
const apiKey = readRequiredEnv("ITS_API_KEY");

// from index.ts
const center = { lat: 37.5665, lng: 126.978 }; // Seoul center
const radiusMeters = 5000;
const latDelta = radiusMeters / 111320;
const lngDelta = radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180));
const bounds = {
  minX: center.lng - lngDelta,
  maxX: center.lng + lngDelta,
  minY: center.lat - latDelta,
  maxY: center.lat + latDelta,
};

const url = new URL(API_URL);
url.searchParams.set("apiKey", apiKey);
url.searchParams.set("type", "all");
url.searchParams.set("eventType", "all");
url.searchParams.set("minX", bounds.minX.toFixed(6));
url.searchParams.set("maxX", bounds.maxX.toFixed(6));
url.searchParams.set("minY", bounds.minY.toFixed(6));
url.searchParams.set("maxY", bounds.maxY.toFixed(6));
url.searchParams.set("getType", "json");

async function test() {
  console.log("Fetching ITS eventInfo for the configured center and radius.");
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body length:", text.length);
    console.log("Parsed Body:", JSON.stringify(JSON.parse(text), null, 2).substring(0, 1000));
  } catch (err) {
    console.error(err);
  }
}
test();
