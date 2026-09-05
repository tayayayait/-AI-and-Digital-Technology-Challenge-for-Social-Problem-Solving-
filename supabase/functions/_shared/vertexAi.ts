export interface VertexAiConfig {
  projectId: string;
  location: string;
  model: string;
}

export interface VertexAiAuthConfig {
  accessToken?: string;
  serviceAccountJson?: string;
}

export type EnvGetter = (name: string) => string | undefined;

export const buildInlineImagePart = (frame: { mimeType: string; data: string }) => ({
  inlineData: {
    mimeType: frame.mimeType,
    data: frame.data,
  },
});

const DEFAULT_VERTEX_LOCATION = "us-central1";
const DEFAULT_VERTEX_MODEL = "gemini-2.5-flash";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

const trimEnv = (value: string | undefined) => value?.trim().replace(/^"|"$/g, "") ?? "";

export const hasVertexAiConfig = (getEnv: EnvGetter) =>
  Boolean(trimEnv(getEnv("VERTEX_AI_PROJECT_ID")));

export const getVertexAiConfigFromEnv = (getEnv: EnvGetter): VertexAiConfig => {
  const projectId = trimEnv(getEnv("VERTEX_AI_PROJECT_ID"));
  if (!projectId) throw new Error("Missing environment variable: VERTEX_AI_PROJECT_ID");

  return {
    projectId,
    location: trimEnv(getEnv("VERTEX_AI_LOCATION")) || DEFAULT_VERTEX_LOCATION,
    model: trimEnv(getEnv("VERTEX_AI_MODEL")) || DEFAULT_VERTEX_MODEL,
  };
};

export const getVertexAiAuthConfigFromEnv = (getEnv: EnvGetter): VertexAiAuthConfig => ({
  accessToken: trimEnv(getEnv("VERTEX_AI_ACCESS_TOKEN")) || undefined,
  serviceAccountJson:
    trimEnv(getEnv("GOOGLE_SERVICE_ACCOUNT_JSON")) ||
    trimEnv(getEnv("VERTEX_AI_SERVICE_ACCOUNT_JSON")) ||
    undefined,
});

export const buildVertexAiGenerateContentUrl = ({ projectId, location, model }: VertexAiConfig) => {
  const host =
    location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return new URL(
    `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(
      location,
    )}/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
  );
};

const base64UrlFromBytes = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const base64UrlFromJson = (value: unknown) =>
  base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)));

const privateKeyBytesFromPem = (pem: string) => {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const signJwt = async (privateKeyPem: string, signingInput: string) => {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytesFromPem(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return base64UrlFromBytes(new Uint8Array(signature));
};

interface ServiceAccountCredentials {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
}

export const createServiceAccountJwt = async (
  serviceAccountJson: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  const credentials = JSON.parse(serviceAccountJson) as ServiceAccountCredentials;
  const clientEmail = credentials.client_email?.trim();
  const privateKey = credentials.private_key?.trim();
  const tokenUri = credentials.token_uri?.trim() || DEFAULT_TOKEN_URI;

  if (!clientEmail || !privateKey) {
    throw new Error("Invalid Google service account JSON");
  }

  const header = base64UrlFromJson({ alg: "RS256", typ: "JWT" });
  const claim = base64UrlFromJson({
    iss: clientEmail,
    scope: CLOUD_PLATFORM_SCOPE,
    aud: tokenUri,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  });
  const signingInput = `${header}.${claim}`;
  const signature = await signJwt(privateKey, signingInput);

  return { assertion: `${signingInput}.${signature}`, tokenUri };
};

export const getVertexAiAccessToken = async (
  auth: VertexAiAuthConfig,
  fetchImpl: typeof fetch = fetch,
) => {
  if (auth.accessToken) return auth.accessToken;
  if (!auth.serviceAccountJson) {
    throw new Error(
      "Missing Vertex AI credentials: set VERTEX_AI_ACCESS_TOKEN or GOOGLE_SERVICE_ACCOUNT_JSON",
    );
  }

  const { assertion, tokenUri } = await createServiceAccountJwt(auth.serviceAccountJson);
  const tokenResponse = await fetchImpl(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };

  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error(`Vertex AI token exchange failed: ${tokenBody.error ?? tokenResponse.status}`);
  }

  return tokenBody.access_token;
};
