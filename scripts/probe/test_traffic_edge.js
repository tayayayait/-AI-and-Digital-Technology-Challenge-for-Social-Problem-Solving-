const supabaseUrl = "https://qlaeegqbopzwqdcbjbxc.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzdXhwbGRid3pxbm9tdnRtdHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzg4MjAsImV4cCI6MjA5Njc1NDgyMH0.suOVMvArW0Pn_R0jonfdL30k3QSIwI6aEhmFXBt-BBI";

const origin = { lat: 37.359708, lng: 127.1058342 };

async function testTrafficEvents() {
  console.log("Testing traffic-events edge function...");
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/traffic-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ center: origin, radiusMeters: 5000 }),
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
  } catch (err) {
    console.log("fetch error:", err.message);
  }
}

testTrafficEvents();
