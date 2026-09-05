export type PushThreshold = "WATCH" | "WARNING" | "CRITICAL";

export interface SubscribePushRequest {
  action: "subscribe";
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  region: { lat: number; lng: number } | null;
  alertThreshold: PushThreshold;
}

export interface UnsubscribePushRequest {
  action: "unsubscribe";
  endpoint: string;
  auth: string;
}

export interface PushNotificationRequest {
  subscriptionId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

const THRESHOLDS = new Set<PushThreshold>(["WATCH", "WARNING", "CRITICAL"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const boundedText = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== "string") throw new Error(`Invalid ${name}`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new Error(`Invalid ${name}`);
  }
  return text;
};

const pushEndpoint = (value: unknown) => {
  const endpoint = boundedText(value, "push endpoint", 10, 4_096);
  try {
    if (new URL(endpoint).protocol !== "https:") {
      throw new Error("Invalid push endpoint");
    }
  } catch {
    throw new Error("Invalid push endpoint");
  }
  return endpoint;
};

const coordinate = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}`);
  }
  return Math.round(value * 1_000) / 1_000;
};

export const parsePushSubscriptionRequest = (
  value: unknown,
): SubscribePushRequest | UnsubscribePushRequest => {
  if (!isRecord(value)) throw new Error("Invalid request body");

  if (value.action === "unsubscribe") {
    return {
      action: "unsubscribe",
      endpoint: pushEndpoint(value.endpoint),
      auth: boundedText(value.auth, "auth", 8, 1_024),
    };
  }

  if (value.action !== "subscribe" || !isRecord(value.subscription)) {
    throw new Error("Invalid push action");
  }
  const keys = value.subscription.keys;
  if (!isRecord(keys)) throw new Error("Invalid push keys");

  let region: SubscribePushRequest["region"] = null;
  if (value.region != null) {
    if (!isRecord(value.region)) throw new Error("Invalid region");
    region = {
      lat: coordinate(value.region.lat, "region latitude", -90, 90),
      lng: coordinate(value.region.lng, "region longitude", -180, 180),
    };
  }

  const threshold = value.alertThreshold ?? "WARNING";
  if (typeof threshold !== "string" || !THRESHOLDS.has(threshold as PushThreshold)) {
    throw new Error("Invalid alert threshold");
  }

  return {
    action: "subscribe",
    subscription: {
      endpoint: pushEndpoint(value.subscription.endpoint),
      keys: {
        p256dh: boundedText(keys.p256dh, "p256dh", 8, 1_024),
        auth: boundedText(keys.auth, "auth", 8, 1_024),
      },
    },
    region,
    alertThreshold: threshold as PushThreshold,
  };
};

export const parsePushNotificationRequest = (value: unknown): PushNotificationRequest => {
  if (!isRecord(value)) throw new Error("Invalid request body");
  const subscriptionId = boundedText(value.subscriptionId, "subscriptionId", 36, 36);
  if (!UUID.test(subscriptionId)) throw new Error("Invalid subscriptionId");

  const data = value.data == null ? {} : value.data;
  if (!isRecord(data) || JSON.stringify(data).length > 3_000) {
    throw new Error("Invalid push data");
  }

  return {
    subscriptionId,
    title: boundedText(value.title, "title", 1, 80),
    body: boundedText(value.body, "body", 1, 240),
    data,
  };
};

export const pushFailureAction = (statusCode?: number) =>
  statusCode === 404 || statusCode === 410 ? "DELETE" : "INCREMENT_FAILURE";
