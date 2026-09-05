import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBounds(name, minX, maxX, minY, maxY) {
  console.log(`\n--- Testing ${name} ---`);
  console.log(`Bounds: Lng(${minX} to ${maxX}), Lat(${minY} to ${maxY})`);

  const { data, error } = await supabase.functions.invoke("cctv-info", {
    body: {
      bounds: { minX, maxX, minY, maxY },
      limit: 5000,
      roadType: "all",
    },
  });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  const cameras = data.cameras || [];
  console.log(`Total cameras returned: ${cameras.length}`);

  if (cameras.length === 0) return;

  let inside = 0;
  let outside = 0;
  for (const c of cameras) {
    if (
      c.position.lng >= minX &&
      c.position.lng <= maxX &&
      c.position.lat >= minY &&
      c.position.lat <= maxY
    ) {
      inside++;
    } else {
      outside++;
    }
  }

  console.log(`Inside bounds: ${inside}`);
  console.log(`Outside bounds: ${outside}`);

  if (outside > 0) {
    console.log("Example outside camera:");
    const outCam = cameras.find(
      (c) =>
        !(
          c.position.lng >= minX &&
          c.position.lng <= maxX &&
          c.position.lat >= minY &&
          c.position.lat <= maxY
        ),
    );
    console.log(`Name: ${outCam.name}, Lng: ${outCam.position.lng}, Lat: ${outCam.position.lat}`);
  }
}

async function run() {
  await testBounds("Gwangju (Zoom 11)", 126.6, 127.1, 35.0, 35.3);
  await testBounds("Gangwon (Zoom 10)", 127.7, 128.6, 37.4, 38.2);
  await testBounds("Seoul (Zoom 11)", 126.8, 127.1, 37.4, 37.7);
}

run();
