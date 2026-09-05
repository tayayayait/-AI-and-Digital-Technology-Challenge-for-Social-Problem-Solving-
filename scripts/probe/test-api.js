import { readRequiredEnv } from "./load-env.js";

async function test() {
  const apiKey = readRequiredEnv("ITS_API_KEY");
  const url = `https://openapi.its.go.kr:9443/eventInfo?apiKey=${apiKey}&type=all&eventType=all&minX=126.900000&maxX=127.100000&minY=37.400000&maxY=37.600000&getType=json`;

  console.log("Fetching ITS eventInfo for the configured Seoul bounds.");
  try {
    const res = await fetch(url);
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response length:", text.length);
    console.log("Preview:", text.slice(0, 500));
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
