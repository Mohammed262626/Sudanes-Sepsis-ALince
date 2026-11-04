// Sends one web push message to every saved subscription. Admin only: the caller
// must be a Supabase user whose email is in admin_emails.
import webpush from "npm:web-push@3.6.7";

// The dashboard calls this function from the browser, so it must allow the
// preflight. The function is still admin-gated by JWT + admin_emails.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const service = { apikey: key, Authorization: "Bearer " + key };

async function getSecret(name: string): Promise<string | null> {
  const res = await fetch(url + "/rest/v1/rpc/get_app_secret", {
    method: "POST",
    headers: { ...service, "Content-Type": "application/json" },
    body: JSON.stringify({ p_name: name }),
  });
  if (!res.ok) return null;
  const value = await res.json();
  return typeof value === "string" ? value : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const who = await fetch(url + "/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer " + token },
  });
  if (!who.ok) return json({ error: "unauthorized" }, 401);
  const email = (await who.json().catch(() => null))?.email;
  const admin = await fetch(
    `${url}/rest/v1/admin_emails?select=email&email=eq.${encodeURIComponent(email ?? "")}`,
    { headers: service },
  );
  const rows = await admin.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: "forbidden" }, 403);

  const payload = await req.json().catch(() => null);
  const body = String(payload?.body ?? "").trim().slice(0, 300);
  const title = String(payload?.title ?? "التحالف السوداني للإنتان").slice(0, 60);
  if (!body) return json({ error: "bad body" }, 400);

  const privateKey = (await getSecret("vapid_private"))?.trim();
  const publicKey = (await getSecret("vapid_public"))?.trim();
  if (!privateKey || !publicKey) return json({ error: "missing vapid keys" }, 500);
  webpush.setVapidDetails(
    "mailto:no-reply@sudansepsisalince.sd",
    publicKey,
    privateKey,
  );

  const subs = await fetch(`${url}/rest/v1/push_subscriptions?select=endpoint,keys`, {
    headers: service,
  }).then((r) => r.json().catch(() => []));
  if (!Array.isArray(subs)) return json({ error: "cannot read subscriptions" }, 500);

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s: { endpoint: string; keys: unknown }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys as Record<string, string> },
          JSON.stringify({ title, body, url: "./" }),
          { TTL: 3600 },
        );
        sent++;
      } catch (err) {
        failed++;
        // 404/410: the browser threw the subscription away. Drop the row.
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint);
      }
    }),
  );

  await Promise.all(
    dead.map((endpoint) =>
      fetch(`${url}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        headers: service,
      }),
    ),
  );

  return json({ sent, failed, total: subs.length, pruned: dead.length });
});
