/* global self */

const DEFAULT_URL = "/";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }

  const title = payload.title || "침수퇴로 AI 위험 알림";
  const options = {
    body: payload.body || "현재 위치 주변의 침수 위험 정보를 확인하세요.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.data?.tag || "flood-risk",
    renotify: true,
    data: { url: payload.data?.url || DEFAULT_URL, ...payload.data },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = DEFAULT_URL;
  try {
    const candidate = new URL(event.notification.data?.url || DEFAULT_URL, self.location.origin);
    if (candidate.origin === self.location.origin)
      target = `${candidate.pathname}${candidate.search}`;
  } catch {
    target = DEFAULT_URL;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        if ("navigate" in existing) await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
