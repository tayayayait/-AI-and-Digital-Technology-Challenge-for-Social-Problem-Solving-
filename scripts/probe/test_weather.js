const supabaseUrl = "https://qlaeegqbopzwqdcbjbxc.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzdXhwbGRid3pxbm9tdnRtdHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzg4MjAsImV4cCI6MjA5Njc1NDgyMH0.suOVMvArW0Pn_R0jonfdL30k3QSIwI6aEhmFXBt-BBI";

async function testWeather(baseTime) {
  console.log("Testing weather edge function for baseTime:", baseTime);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/weather`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        nx: 60,
        ny: 127,
        baseDate: "20260615",
        baseTime: baseTime,
      }),
    });
    const text = await res.text();
    console.log(`Status for ${baseTime}:`, res.status);
    console.log(`Body for ${baseTime}:`, text);
  } catch (err) {
    console.log("Fetch error:", err.message);
  }
}

async function run() {
  await testWeather("1600");
  await testWeather("1700");
  await testWeather("0000"); // what if baseTime is 0000?
  await testWeather("0100");
}

run();
