const supabaseUrl = "https://qlaeegqbopzwqdcbjbxc.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzdXhwbGRid3pxbm9tdnRtdHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzg4MjAsImV4cCI6MjA5Njc1NDgyMH0.suOVMvArW0Pn_R0jonfdL30k3QSIwI6aEhmFXBt-BBI";

import { createClient } from "@supabase/supabase-js";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testShelters() {
  const origin = { lat: 37.359708, lng: 127.1058342 };
  const latDelta = 5000 / 111320;
  const lngDelta = 5000 / (111320 * Math.cos(origin.lat * (Math.PI / 180)));

  const { data, error } = await supabase
    .from("shelter_operations")
    .select("*")
    .gte("lat", origin.lat - latDelta)
    .lte("lat", origin.lat + latDelta)
    .gte("lng", origin.lng - lngDelta)
    .lte("lng", origin.lng + lngDelta)
    .limit(100);

  if (error) {
    console.log("DB Error:", error.message);
    return;
  }

  console.log("Returned rows:", data.length);

  const floodSafe = data.filter((row) => {
    const type = row.facility_type ?? "이재민 임시주거시설";
    const status = row.status;
    const underground = row.underground ?? false;
    return !type.includes("민방위") && status !== "EXCLUDED" && !underground;
  });

  console.log("Flood safe candidates:", floodSafe.length);
}

testShelters();
