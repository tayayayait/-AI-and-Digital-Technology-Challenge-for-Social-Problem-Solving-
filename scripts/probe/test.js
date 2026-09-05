async function fetchAll() {
  const url =
    "https://apis.data.go.kr/1741000/civil_defense_shelter_info/info?serviceKey=Tm9U4A4bvXGp8V3BL5wMFSc3vKZqECQ95p6DaEcNh9Hm00HIe0wpxkz3f11Vsgvx8sB6sCN6sg7izcBesPFP3Q%3D%3D&returnType=json&numOfRows=1000&pageNo=";
  let allItems = [];

  // just fetch first 5 pages to test limit
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(url + i);
    const json = await res.json();
    const items = json.response.body.items.item;
    if (items) {
      allItems.push(...items);
    }
  }
  console.log("Fetched:", allItems.length);
}
fetchAll();
