const supabaseUrl = "https://qlaeegqbopzwqdcbjbxc.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzdXhwbGRid3pxbm9tdnRtdHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzg4MjAsImV4cCI6MjA5Njc1NDgyMH0.suOVMvArW0Pn_R0jonfdL30k3QSIwI6aEhmFXBt-BBI";

async function testGemini() {
  const input = {
    question: "이 경로로 대피해도 안전할까요?",
    riskLevel: "CRITICAL",
    recommendedRouteId: "route_1",
    recommendedShelterId: "shelter_1",
    shelterName: "수내초등학교",
    distanceMeters: 500,
    routeReasons: ["침수 위험이 있는 지하차도를 통과합니다."],
    dataTimestamp: new Date().toISOString(),
    allowedProperNouns: ["수내초등학교"],
  };

  console.log("Testing gemini-chat...");
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/gemini-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(input),
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
  } catch (err) {
    console.log("Fetch error:", err.message);
  }
}

testGemini();
