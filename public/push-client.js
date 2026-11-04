// Registers this browser for web push once notification permission is granted.
// The VAPID public key is public by design, so it lives here instead of the env.
(() => {
  const VAPID =
    "BPWeeUovlnJrCWBw6Prs3_Hf-zEynZEPXi1yrbg-wefdIh2zSuB_4iuLviVnU7Rc62NelrUluzqbOZvaLNao_rk";
  // Resolved from this script's own URL, so the worker lands beside it whatever
  // the site base is (GitHub Pages "/Sudanes-Sepsis-ALince/" included).
  const swUrl = new URL("sw.js", document.currentScript?.src ?? document.baseURI);

  const decode = (value) => {
    const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  };

  async function subscribe() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.register(swUrl);
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decode(VAPID),
        }));

      const url = document.querySelector('meta[name="supabase-url"]')?.content;
      const key = document.querySelector('meta[name="supabase-key"]')?.content;
      if (!url || !key) return false;

      const saved = await fetch(`${url.replace(/\/$/, "")}/rest/v1/push_subscriptions`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
      });
      // 409: this browser is already saved. Anything else failing is the caller's
      // problem to show, not to swallow.
      return saved.ok || saved.status === 409;
    } catch (err) {
      console.warn("push subscribe failed", err);
      return false;
    }
  }

  window.sepPush = subscribe;
})();
