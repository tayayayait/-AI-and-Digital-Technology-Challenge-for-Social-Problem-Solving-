import { readRequiredEnv } from "./load-env.js";

const apiKey = readRequiredEnv("ITS_CCTV_API_KEY", "ITS_API_KEY");

async function testItsApi() {
  const urlLower = `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${apiKey}&type=ex&cctvType=1&minX=127.6&maxX=129.6&minY=34.6&maxY=35.8&getType=json`;

  try {
    const resLower = await fetch(urlLower);
    const dataLower = await resLower.json();
    const countLower = dataLower.response?.data?.length || 0;
    console.log(`Gyeongnam bounds returned: ${countLower} items`);

    if (countLower > 0) {
      let outOfBounds = 0;
      for (const item of dataLower.response.data) {
        if (
          item.coordx < 127.6 ||
          item.coordx > 129.6 ||
          item.coordy < 34.6 ||
          item.coordy > 35.8
        ) {
          outOfBounds++;
        }
      }
      console.log(`Out of bounds: ${outOfBounds} / ${countLower}`);
      if (countLower > 0) {
        console.log(
          "First item:",
          dataLower.response.data[0].coordx,
          dataLower.response.data[0].coordy,
        );
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

testItsApi();
