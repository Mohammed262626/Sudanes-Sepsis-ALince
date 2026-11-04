// Receives web push messages and shows them as system notifications.
// The payload is JSON: { title, body, url }.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    // A bare push still has to show something.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "التحالف السوداني للإنتان", {
      body: data.body || "",
      data: { url: data.url },
      dir: "rtl",
      lang: "ar",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "./"));
});
