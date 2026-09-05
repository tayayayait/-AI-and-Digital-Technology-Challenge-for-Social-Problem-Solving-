import { supabase } from "@/integrations/supabase/client";
import type { LatLng } from "@/lib/types";

export type PushAlertThreshold = "WATCH" | "WARNING" | "CRITICAL";
export type PushCapability = "SUPPORTED" | "INSTALL_REQUIRED" | "UNSUPPORTED";
export type PushServiceStatus =
  | "SUBSCRIBED"
  | "UNSUBSCRIBED"
  | "DENIED"
  | "INSTALL_REQUIRED"
  | "UNSUPPORTED"
  | "PENDING_ACCESS"
  | "FAILED";

export interface PushServiceResult {
  status: PushServiceStatus;
  message: string;
  permission?: NotificationPermission | "unsupported";
}

export interface PushRegistrationOptions {
  region?: LatLng | null;
  alertThreshold?: PushAlertThreshold;
}

interface PushSubscriptionLike {
  endpoint: string;
  toJSON: () => PushSubscriptionJSON;
  unsubscribe: () => Promise<boolean>;
}

interface PushManagerLike {
  getSubscription: () => Promise<PushSubscriptionLike | null>;
  subscribe: (options: PushSubscriptionOptionsInit) => Promise<PushSubscriptionLike>;
}

interface ServiceWorkerRegistrationLike {
  pushManager: PushManagerLike;
}

interface InvokeResult {
  data: unknown;
  error: { message?: string } | null;
}

export interface PushServiceRuntime {
  capability: () => PushCapability;
  vapidPublicKey: () => string | undefined;
  notificationPermission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  serviceWorkerReady: () => Promise<ServiceWorkerRegistrationLike>;
  invoke: (name: string, options: { body: Record<string, unknown> }) => Promise<InvokeResult>;
}

const MESSAGE: Record<PushServiceStatus, string> = {
  SUBSCRIBED: "위험 알림이 활성화됐습니다.",
  UNSUBSCRIBED: "위험 알림 구독을 해제했습니다.",
  DENIED: "알림 권한이 차단됐습니다. 브라우저 설정에서 알림 권한을 변경할 수 있습니다.",
  INSTALL_REQUIRED: "iPhone·iPad에서는 홈 화면에 추가하면 알림을 받을 수 있습니다.",
  UNSUPPORTED: "이 브라우저에서는 웹 푸시 알림을 지원하지 않습니다.",
  PENDING_ACCESS: "알림 발송 설정을 준비 중입니다. 앱의 다른 기능은 정상적으로 사용할 수 있습니다.",
  FAILED: "위험 알림 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

const roundRegion = (region?: LatLng | null) =>
  region
    ? {
        lat: Math.round(region.lat * 1_000) / 1_000,
        lng: Math.round(region.lng * 1_000) / 1_000,
      }
    : null;

const isIosDevice = () => /iPad|iPhone|iPod/.test(window.navigator.userAgent);

const isStandalone = () => {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
};

export const getPushCapability = (): PushCapability => {
  if (typeof window === "undefined") return "UNSUPPORTED";
  if (isIosDevice() && !isStandalone()) return "INSTALL_REQUIRED";
  if (
    !("serviceWorker" in window.navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "UNSUPPORTED";
  }
  return "SUPPORTED";
};

export const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = globalThis.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
};

const subscriptionBody = (subscription: PushSubscriptionLike) => {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("Push subscription keys are missing");
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh, auth },
  };
};

export const createPushService = (runtime: PushServiceRuntime) => ({
  init: async (options: PushRegistrationOptions = {}): Promise<PushServiceResult> => {
    const capability = runtime.capability();
    if (capability !== "SUPPORTED") {
      return { status: capability, message: MESSAGE[capability], permission: "unsupported" };
    }

    const permission = runtime.notificationPermission();
    if (permission === "denied") {
      return { status: "DENIED", message: MESSAGE.DENIED, permission };
    }

    const resolvedPermission =
      permission === "default" ? await runtime.requestPermission() : permission;
    if (resolvedPermission !== "granted") {
      return { status: "DENIED", message: MESSAGE.DENIED, permission: resolvedPermission };
    }

    const vapidPublicKey = runtime.vapidPublicKey()?.trim();
    if (!vapidPublicKey) {
      return {
        status: "PENDING_ACCESS",
        message: MESSAGE.PENDING_ACCESS,
        permission: resolvedPermission,
      };
    }

    try {
      const registration = await runtime.serviceWorkerReady();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const { error } = await runtime.invoke("push-subscribe", {
        body: {
          action: "subscribe",
          subscription: subscriptionBody(subscription),
          region: roundRegion(options.region),
          alertThreshold: options.alertThreshold ?? "WARNING",
        },
      });
      if (error) throw new Error(error.message || "Push subscription request failed");

      return { status: "SUBSCRIBED", message: MESSAGE.SUBSCRIBED, permission: resolvedPermission };
    } catch {
      return { status: "FAILED", message: MESSAGE.FAILED, permission: resolvedPermission };
    }
  },

  unsubscribe: async (): Promise<PushServiceResult> => {
    if (runtime.capability() !== "SUPPORTED") {
      return { status: "UNSUBSCRIBED", message: MESSAGE.UNSUBSCRIBED };
    }

    try {
      const registration = await runtime.serviceWorkerReady();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return { status: "UNSUBSCRIBED", message: MESSAGE.UNSUBSCRIBED };

      const body = subscriptionBody(subscription);
      const { error } = await runtime.invoke("push-subscribe", {
        body: { action: "unsubscribe", endpoint: body.endpoint, auth: body.keys.auth },
      });
      await subscription.unsubscribe();
      if (error) throw new Error(error.message || "Push unsubscribe request failed");

      return { status: "UNSUBSCRIBED", message: MESSAGE.UNSUBSCRIBED };
    } catch {
      return {
        status: "FAILED",
        message: "브라우저 알림은 꺼졌지만 서버 정리가 지연되고 있습니다.",
      };
    }
  },
});

const browserRuntime: PushServiceRuntime = {
  capability: getPushCapability,
  vapidPublicKey: () => import.meta.env.VITE_VAPID_PUBLIC_KEY,
  notificationPermission: () => window.Notification.permission,
  requestPermission: () => window.Notification.requestPermission(),
  serviceWorkerReady: async () => navigator.serviceWorker.ready,
  invoke: async (name, options) => supabase.functions.invoke(name, options),
};

const browserPushService = createPushService(browserRuntime);

export const initPushNotifications = (options?: PushRegistrationOptions) =>
  browserPushService.init(options);

export const unsubscribePushNotifications = () => browserPushService.unsubscribe();
