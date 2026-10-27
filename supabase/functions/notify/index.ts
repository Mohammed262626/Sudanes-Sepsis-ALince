// Sends Arabic transactional emails via Resend when a row is inserted.
// Triggered by public.notify_email() (see Supabase migrations); authenticated
// with the x-webhook-secret header, compared against the value in Supabase Vault.

const FROM = "التحالف السوداني للإنتان <no-reply@sudansepsisalince.sd>";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function getSecret(name: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  const res = await fetch(url + "/rest/v1/rpc/get_app_secret", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_name: name }),
  });
  if (!res.ok) return null;
  const value = await res.json();
  return typeof value === "string" ? value : null;
}

const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );

function layout(body: string) {
  return (
    '<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f7f5f0;color:#15130f;font-family:Tahoma,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 24px"><div style="height:4px;background:#c0392b;margin-bottom:28px"></div>' +
    body +
    '<p style="margin-top:32px;font-size:13px;color:#6f6a62">التحالف السوداني للإنتان</p></div></body></html>'
  );
}

type Record_ = Record<string, string>;

function compose(
  table: string,
  r: Record_
): { to: string; subject: string; html: string } | null {
  const name = esc(r.name ?? "");
  if (table === "conference_registrations") {
    return {
      to: r.email,
      subject: "تم تسجيلك في مؤتمر كسلا للإنتان",
      html: layout(
        '<h1 style="font-size:22px;margin:0 0 16px">تم تسجيلك</h1>' +
          "<p>أهلاً " + name + "،</p>" +
          "<p>تأكدنا من تسجيلك في <strong>مؤتمر كسلا للإنتان</strong>:</p>" +
          '<p style="margin:16px 0;padding:16px;border:1px solid #ddd8cf">' +
          "الاثنين 16 نوفمبر 2026<br>9:00 صباحاً بتوقيت الخرطوم<br>كسلا</p>" +
          "<p>سنرسل لك تفاصيل الموقع الدقيق والبرنامج قبل الموعد.</p>"
      ),
    };
  }
  if (table === "contact_messages") {
    return {
      to: r.email,
      subject: "استلمنا رسالتك",
      html: layout(
        '<h1 style="font-size:22px;margin:0 0 16px">استلمنا رسالتك</h1>' +
          "<p>أهلاً " + name + "،</p>" +
          "<p>شكراً لتواصلك مع التحالف السوداني للإنتان. سنعود إليك في أقرب وقت.</p>"
      ),
    };
  }
  if (table === "donation_interests") {
    return {
      to: r.email,
      subject: "شكراً لاهتمامك بدعم التحالف",
      html: layout(
        '<h1 style="font-size:22px;margin:0 0 16px">شكراً لاهتمامك</h1>' +
          "<p>أهلاً " + name + "،</p>" +
          "<p>سجّلنا اهتمامك بدعم التحالف السوداني للإنتان، وسنرسل لك تفاصيل الدعم فور جاهزيتها.</p>"
      ),
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const expected = await getSecret("webhook_secret");
  if (!expected || req.headers.get("x-webhook-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const payload = await req.json().catch(() => null);
  if (!payload?.table || !payload?.record) return json({ error: "bad payload" }, 400);

  const mail = compose(payload.table, payload.record);
  if (!mail?.to) return json({ skipped: true });

  const apiKey = await getSecret("resend_api_key");
  if (!apiKey) return json({ error: "missing resend key" }, 500);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
    }),
  });

  const out = await res.text();
  console.log("resend", payload.table, res.status, out);
  return json({ sent: res.ok, status: res.status });
});
