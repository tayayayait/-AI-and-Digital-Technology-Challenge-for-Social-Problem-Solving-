const supabaseUrl = "https://qlaeegqbopzwqdcbjbxc.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzdXhwbGRid3pxbm9tdnRtdHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzg4MjAsImV4cCI6MjA5Njc1NDgyMH0.suOVMvArW0Pn_R0jonfdL30k3QSIwI6aEhmFXBt-BBI";

const origin = { lat: 37.359708, lng: 127.1058342 };
const destination = { lat: 37.3601525, lng: 127.1068466 };

async function testEdgeFunctions() {
  console.log("Testing naver-directions edge function...");
  try {
    const naverRes = await fetch(`${supabaseUrl}/functions/v1/naver-directions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ origin, destination }),
    });
    const naverText = await naverRes.text();
    console.log("Naver Status:", naverRes.status);
    console.log("Naver Body:", naverText);
  } catch (err) {
    console.log("Naver fetch error:", err.message);
  }

  console.log("\nTesting tmap-pedestrian edge function...");
  try {
    const tmapRes = await fetch(`${supabaseUrl}/functions/v1/tmap-pedestrian`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ origin, destination }),
    });
    const tmapText = await tmapRes.text();
    console.log("Tmap Status:", tmapRes.status);
    console.log("Tmap Body:", tmapText);
  } catch (err) {
    console.log("Tmap fetch error:", err.message);
  }
}

testEdgeFunctions();
