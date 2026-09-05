import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { NotificationConsentCard } from "./NotificationConsentCard";

const mocks = vi.hoisted(() => ({
  enablePush: vi.fn(),
  revokePush: vi.fn(),
  initPushNotifications: vi.fn(),
  unsubscribePushNotifications: vi.fn(),
}));

vi.mock("@/hooks/useNotificationConsent", () => ({
  useNotificationConsent: () => ({
    state: {
      pushConsent: false,
      browserPermission: "default",
      alertThreshold: "WARNING",
      backgroundLocationEnabled: false,
      consentedAt: null,
      revokedAt: null,
    },
    message: "동의 전",
    enablePush: mocks.enablePush,
    revokePush: mocks.revokePush,
  }),
}));

vi.mock("@/store/scenario", () => ({
  useScenario: () => ({
    origin: { lat: 37.4979, lng: 127.0276 },
    locationStatus: "GRANTED",
  }),
}));

vi.mock("@/lib/push/pushService", () => ({
  initPushNotifications: mocks.initPushNotifications,
  unsubscribePushNotifications: mocks.unsubscribePushNotifications,
}));

describe("NotificationConsentCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enablePush.mockReturnValue({ allowed: true, permission: "granted" });
    mocks.initPushNotifications.mockResolvedValue({
      status: "SUBSCRIBED",
      message: "위험 알림이 활성화됐습니다.",
      permission: "granted",
    });
    mocks.unsubscribePushNotifications.mockResolvedValue({
      status: "UNSUBSCRIBED",
      message: "위험 알림 구독을 해제했습니다.",
    });
  });

  test("동의 버튼에서 실제 웹푸시 구독 등록을 호출한다", async () => {
    render(<NotificationConsentCard />);

    fireEvent.click(screen.getByRole("button", { name: "푸시 알림 동의" }));

    await waitFor(() =>
      expect(mocks.initPushNotifications).toHaveBeenCalledWith({
        region: { lat: 37.4979, lng: 127.0276 },
        alertThreshold: "WARNING",
      }),
    );
    expect(mocks.enablePush).toHaveBeenCalledWith("granted");
    expect(await screen.findByText("위험 알림이 활성화됐습니다.")).toBeInTheDocument();
  });

  test("브라우저가 권한을 거부하면 거부 상태를 저장하고 크래시하지 않는다", async () => {
    mocks.initPushNotifications.mockResolvedValue({
      status: "DENIED",
      message: "알림 권한이 차단됐습니다. 브라우저 설정에서 알림 권한을 변경할 수 있습니다.",
      permission: "denied",
    });

    render(<NotificationConsentCard />);
    fireEvent.click(screen.getByRole("button", { name: "푸시 알림 동의" }));

    await waitFor(() => expect(mocks.enablePush).toHaveBeenCalledWith("denied"));
    expect(mocks.initPushNotifications).toHaveBeenCalledOnce();
    expect(await screen.findByText(/브라우저 설정에서/)).toBeInTheDocument();
  });
});
