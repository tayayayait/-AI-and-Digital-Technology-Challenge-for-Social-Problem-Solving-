import { readRequiredEnv } from "./load-env.js";

const apiKey = readRequiredEnv("ITS_CCTV_API_KEY", "ITS_API_KEY");

async function testItsApi() {
  // Test with lowercase minX
  const urlLower = `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${apiKey}&type=ex&cctvType=1&minX=126.8&maxX=127.1&minY=37.4&maxY=37.7&getType=json`;

  // Test with uppercase MinX
  const urlUpper = `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${apiKey}&type=ex&cctvType=1&MinX=126.8&MaxX=127.1&MinY=37.4&MaxY=37.7&getType=json`;

  try {
    const resLower = await fetch(urlLower);
    const dataLower = await resLower.json();
    const countLower = dataLower.response?.data?.length || 0;
    console.log(`Lowercase bounds returned: ${countLower} items`);

    const resUpper = await fetch(urlUpper);
    const dataUpper = await resUpper.json();
    const countUpper = dataUpper.response?.data?.length || 0;
    console.log(`Uppercase bounds returned: ${countUpper} items`);

    if (countLower > 0 && countUpper > 0 && countLower === countUpper) {
      console.log(
        "Both returned same count, checking if coordinates are within bounds for lowercase...",
      );
      let outOfBounds = 0;
      for (const item of dataLower.response.data) {
        if (
          item.coordx < 126.8 ||
          item.coordx > 127.1 ||
          item.coordy < 37.4 ||
          item.coordy > 37.7
        ) {
          outOfBounds++;
        }
      }
      console.log(`Out of bounds for lowercase: ${outOfBounds} / ${countLower}`);

      outOfBounds = 0;
      for (const item of dataUpper.response.data) {
        if (
          item.coordx < 126.8 ||
          item.coordx > 127.1 ||
          item.coordy < 37.4 ||
          item.coordy > 37.7
        ) {
          outOfBounds++;
        }
      }
      console.log(`Out of bounds for uppercase: ${outOfBounds} / ${countUpper}`);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

testItsApi();
