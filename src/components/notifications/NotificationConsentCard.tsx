import { useState } from "react";
import { Bell, BellOff, MapPinOff } from "lucide-react";

import { useNotificationConsent } from "@/hooks/useNotificationConsent";
import { initPushNotifications, unsubscribePushNotifications } from "@/lib/push/pushService";
import { useScenario } from "@/store/scenario";

export function NotificationConsentCard() {
  const { state, message, enablePush, revokePush } = useNotificationConsent();
  const { origin, locationStatus } = useScenario();
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const enabled = state.pushConsent && state.browserPermission === "granted";

  const handleEnablePush = async () => {
    setIsWorking(true);
    setPushMessage(null);
    try {
      const result = await initPushNotifications({
        region: locationStatus === "GRANTED" ? origin : null,
        alertThreshold: state.alertThreshold,
      });
      enablePush(result.permission ?? "unsupported");
      setPushMessage(result.message);
    } finally {
      setIsWorking(false);
    }
  };

  const handleRevokePush = async () => {
    setIsWorking(true);
    try {
      const result = await unsubscribePushNotifications();
      revokePush();
      setPushMessage(result.message);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section className="rounded-[8px] border border-[var(--border-soft)] bg-white p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: enabled ? "#dcfce7" : "var(--surface-alt)" }}
        >
          {enabled ? (
            <Bell size={18} className="text-[#166534]" aria-hidden />
          ) : (
            <BellOff size={18} className="text-[var(--text-subtle)]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-extrabold">위험 알림 설정</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
            푸시 알림은 사용자가 버튼으로 동의한 뒤에만 브라우저 권한을 요청합니다.
          </p>
          <div className="mt-3 grid gap-2 text-[12px] text-[var(--text-subtle)] sm:grid-cols-2">
            <Status label="푸시 동의" value={state.pushConsent ? "동의" : "미동의"} />
            <Status label="브라우저 권한" value={state.browserPermission} />
            <Status label="알림 기준" value={state.alertThreshold} />
            <Status
              label="백그라운드 위치"
              value={state.backgroundLocationEnabled ? "활성" : "비활성"}
            />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--text-subtle)]">
            <MapPinOff size={14} aria-hidden />
            위치 상시 추적은 MVP 범위 밖이며 기본값은 항상 비활성입니다.
          </p>
          <p className="mt-2 text-[12px] text-[var(--text-muted)]" aria-live="polite">
            {pushMessage ?? message}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleEnablePush}
          disabled={isWorking}
          className="inline-flex min-h-11 items-center rounded-[8px] bg-[var(--primary)] px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          푸시 알림 동의
        </button>
        <button
          type="button"
          onClick={handleRevokePush}
          disabled={!state.pushConsent || isWorking}
          className="inline-flex min-h-11 items-center rounded-[8px] border border-[var(--border)] bg-white px-4 text-[13px] font-bold disabled:opacity-50"
        >
          동의 철회
        </button>
      </div>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-[var(--surface-alt)] px-3 py-2">
      <div className="font-bold text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 font-extrabold text-[var(--text)]">{value}</div>
    </div>
  );
}
