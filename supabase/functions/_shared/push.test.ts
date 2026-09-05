import { describe, expect, test } from "vitest";

import {
  parsePushNotificationRequest,
  parsePushSubscriptionRequest,
  pushFailureAction,
} from "./push";

describe("parsePushSubscriptionRequest", () => {
  test("구독 요청을 검증하고 좌표를 3자리로 낮춘다", () => {
    expect(
      parsePushSubscriptionRequest({
        action: "subscribe",
        subscription: {
          endpoint: "https://push.example.test/device",
          keys: { p256dh: "p256dh-value", auth: "auth-value" },
        },
        region: { lat: 37.12349, lng: 127.98765 },
        alertThreshold: "CRITICAL",
      }),
    ).toEqual({
      action: "subscribe",
      subscription: {
        endpoint: "https://push.example.test/device",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
      },
      region: { lat: 37.123, lng: 127.988 },
      alertThreshold: "CRITICAL",
    });
  });

  test("HTTPS가 아닌 endpoint는 거부한다", () => {
    expect(() =>
      parsePushSubscriptionRequest({
        action: "subscribe",
        subscription: {
          endpoint: "http://push.example.test/device",
          keys: { p256dh: "p256dh-value", auth: "auth-value" },
        },
      }),
    ).toThrow("Invalid push endpoint");
  });

  test("구독 해제에는 endpoint와 auth를 모두 요구한다", () => {
    expect(
      parsePushSubscriptionRequest({
        action: "unsubscribe",
        endpoint: "https://push.example.test/device",
        auth: "auth-value",
      }),
    ).toEqual({
      action: "unsubscribe",
      endpoint: "https://push.example.test/device",
      auth: "auth-value",
    });
  });
});

describe("parsePushNotificationRequest", () => {
  test("발송 대상과 사용자 표시 알림을 길이 제한 안에서 파싱한다", () => {
    expect(
      parsePushNotificationRequest({
        subscriptionId: "00000000-0000-4000-8000-000000000001",
        title: " 침수 위험 경계 ",
        body: "안전한 대피 경로를 확인하세요.",
        data: { url: "/routes" },
      }),
    ).toEqual({
      subscriptionId: "00000000-0000-4000-8000-000000000001",
      title: "침수 위험 경계",
      body: "안전한 대피 경로를 확인하세요.",
      data: { url: "/routes" },
    });
  });

  test("410과 404는 삭제, 나머지 실패는 횟수 증가로 분류한다", () => {
    expect(pushFailureAction(410)).toBe("DELETE");
    expect(pushFailureAction(404)).toBe("DELETE");
    expect(pushFailureAction(503)).toBe("INCREMENT_FAILURE");
    expect(pushFailureAction(undefined)).toBe("INCREMENT_FAILURE");
  });
});
