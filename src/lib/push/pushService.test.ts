import { describe, expect, test, vi } from "vitest";

import { createPushService, type PushServiceRuntime, urlBase64ToUint8Array } from "./pushService";

const makeSubscription = () => ({
  endpoint: "https://push.example.test/device-1",
  toJSON: () => ({
    endpoint: "https://push.example.test/device-1",
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
});

const makeRuntime = (overrides: Partial<PushServiceRuntime> = {}) => {
  const subscription = makeSubscription();
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  const runtime: PushServiceRuntime = {
    capability: () => "SUPPORTED",
    vapidPublicKey: () => "AQID",
    notificationPermission: () => "granted",
    requestPermission: vi.fn().mockResolvedValue("granted"),
    serviceWorkerReady: vi.fn().mockResolvedValue({ pushManager }),
    invoke: vi.fn().mockResolvedValue({ data: { status: "SUBSCRIBED" }, error: null }),
    ...overrides,
  };

  return { runtime, pushManager, subscription };
};

describe("urlBase64ToUint8Array", () => {
  test("VAPID base64url 값을 정확한 바이트 배열로 변환한다", () => {
    expect([...urlBase64ToUint8Array("AQID-_8")]).toEqual([1, 2, 3, 251, 255]);
  });
});

describe("createPushService", () => {
  test("사용자 동의 후 userVisibleOnly 구독을 만들고 좌표를 3자리로 낮춰 저장한다", async () => {
    const { runtime, pushManager } = makeRuntime();
    const service = createPushService(runtime);

    const result = await service.init({
      region: { lat: 37.12349, lng: 127.98765 },
      alertThreshold: "WARNING",
    });

    expect(result.status).toBe("SUBSCRIBED");
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(runtime.invoke).toHaveBeenCalledWith("push-subscribe", {
      body: {
        action: "subscribe",
        subscription: {
          endpoint: "https://push.example.test/device-1",
          keys: { p256dh: "p256dh-key", auth: "auth-key" },
        },
        region: { lat: 37.123, lng: 127.988 },
        alertThreshold: "WARNING",
      },
    });
  });

  test("이미 거부된 권한은 반복 요청하지 않는다", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    const serviceWorkerReady = vi.fn();
    const { runtime } = makeRuntime({
      notificationPermission: () => "denied",
      requestPermission,
      serviceWorkerReady,
    });

    const result = await createPushService(runtime).init();

    expect(result.status).toBe("DENIED");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(serviceWorkerReady).not.toHaveBeenCalled();
  });

  test("iOS에서 홈 화면 설치 전이면 설치 안내를 반환한다", async () => {
    const requestPermission = vi.fn();
    const { runtime } = makeRuntime({
      capability: () => "INSTALL_REQUIRED",
      requestPermission,
    });

    const result = await createPushService(runtime).init();

    expect(result.status).toBe("INSTALL_REQUIRED");
    expect(result.message).toContain("홈 화면에 추가");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test("구독 해제 시 서버 행을 지운 뒤 브라우저 구독도 해제한다", async () => {
    const subscription = makeSubscription();
    const invoke = vi.fn().mockResolvedValue({ data: { status: "UNSUBSCRIBED" }, error: null });
    const { runtime } = makeRuntime({
      serviceWorkerReady: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
      }),
      invoke,
    });

    const result = await createPushService(runtime).unsubscribe();

    expect(result.status).toBe("UNSUBSCRIBED");
    expect(invoke).toHaveBeenCalledWith("push-subscribe", {
      body: {
        action: "unsubscribe",
        endpoint: subscription.endpoint,
        auth: "auth-key",
      },
    });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });
});
