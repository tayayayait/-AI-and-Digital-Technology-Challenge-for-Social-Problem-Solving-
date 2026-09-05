const isRecord = (value) => typeof value === "object" && value !== null;

const parseFeatures = (text) => {
  if (!text || text.includes("<ServiceException")) return [];
  try {
    const json = JSON.parse(text);
    if (isRecord(json) && Array.isArray(json.features)) return json.features;
  } catch {
    // Ignore JSON parse error, proceed to XML fallback
  }

  // Fallback for XML/GML response
  // SafeMap WMS may ignore info_format=application/json and return GML/XML instead.
  if (
    text.includes("gml:featureMember") ||
    text.includes("<FIELDS ") ||
    text.includes("A2SM_FLUDMARKS") ||
    text.includes("A2SM_FLOODFOVRRISK1")
  ) {
    // Return a dummy feature to indicate overlap > 0
    return [{ type: "Feature", properties: { _xml_fallback: true } }];
  }

  return [];
};

console.log("Test 1 - JSON array:");
console.dir(parseFeatures('{"features": [{"type":"Feature"}]}'));

console.log("\nTest 2 - Empty XML:");
console.dir(
  parseFeatures(
    '<?xml version="1.0" encoding="UTF-8"?><FeatureInfoResponse></FeatureInfoResponse>',
  ),
);

console.log("\nTest 3 - XML with gml:featureMember:");
console.dir(
  parseFeatures(
    '<?xml version="1.0"?><gml:featureMember><A2SM_FLUDMARKS></A2SM_FLUDMARKS></gml:featureMember>',
  ),
);

console.log("\nTest 4 - XML with A2SM_FLUDMARKS directly:");
console.dir(parseFeatures('<layer name="A2SM_FLUDMARKS"><feature></feature></layer>'));

console.log("\nTest 5 - ServiceException:");
console.dir(parseFeatures("<ServiceException>Error</ServiceException>"));
