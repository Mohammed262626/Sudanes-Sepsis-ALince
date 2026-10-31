// Sends Arabic transactional messages when a row is inserted.
// Triggered by public.notify_email() (see Supabase migrations); authenticated
// with the x-webhook-secret header, compared against the value in Supabase Vault.
// WhatsApp via Green API is the live channel (registrant confirmation + admin
// alerts); Resend email stays dormant until a verified domain exists.

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

// "0127575701" → "249127575701@c.us" (Sudan country code; other formats as typed).
function toChatId(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "249" + d.slice(1);
  return d + "@c.us";
}

async function sendWhats(chatId: string, message: string): Promise<number> {
  const id = await getSecret("green_api_instance");
  const token = await getSecret("green_api_token");
  if (!id || !token) return 0;
  const res = await fetch(`https://api.green-api.com/waInstance${id}/sendMessage/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  return res.status;
}

// Sends the ticket QR as an image; the code itself is the only data in the QR.
async function sendTicketQr(chatId: string, code: string, caption: string): Promise<number> {
  const id = await getSecret("green_api_instance");
  const token = await getSecret("green_api_token");
  if (!id || !token) return 0;
  const res = await fetch(`https://api.green-api.com/waInstance${id}/sendFileByUrl/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId,
      urlFile: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(code)}`,
      fileName: `ticket-${code}.png`,
      caption,
    }),
  });
  return res.status;
}

function compose(
  table: string,
  r: Record_
): { to: string; subject: string; html: string } | null {
  const name = esc(r.name ?? "");
  if (table === "conference_registrations") {
    return {
      to: r.email,
      subject: "استلمنا طلب تسجيلك في مؤتمر كسلا للإنتان",
      html: layout(
        '<h1 style="font-size:22px;margin:0 0 16px">استلمنا طلب تسجيلك</h1>' +
          "<p>أهلاً " + name + "،</p>" +
          "<p>طلبك لمؤتمر <strong>كسلا للإنتان</strong> وصلنا:</p>" +
          '<p style="margin:16px 0;padding:16px;border:1px solid #ddd8cf">' +
          "الاثنين 16 نوفمبر 2026<br>9:00 صباحاً بتوقيت الخرطوم<br>كسلا</p>" +
          "<p>سنتواصل معك قريباً لتأكيد القبول.</p>"
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

function confirmation(r: Record_): string {
  return (
    "أهلاً " + (r.name ?? "") + "،\n" +
    "استلمنا طلب تسجيلك في مؤتمر كسلا للإنتان ✅\n" +
    "سنتواصل معك قريباً لتأكيد القبول.\n" +
    "— التحالف السوداني للإنتان"
  );
}

function approval(r: Record_): string {
  return (
    "أهلاً " + (r.name ?? "") + "،\n" +
    "تم قبول تسجيلك في مؤتمر كسلا للإنتان ✅\n" +
    "الاثنين 16 نوفمبر 2026 — 9:00 صباحاً — كسلا\n" +
    "رمز QR المرفق هو تذكرتك — أظهره عند الدخول.\n" +
    "— التحالف السوداني للإنتان"
  );
}

function rejection(r: Record_): string {
  return (
    "أهلاً " + (r.name ?? "") + "،\n" +
    "نشكرك على اهتمامك بمؤتمر كسلا للإنتان. للأسف لم نتمكن من قبول تسجيلك في هذه الدورة.\n" +
    "نأمل أن نلتقي في فعاليات قادمة.\n" +
    "— التحالف السوداني للإنتان"
  );
}

function adminAlert(table: string, r: Record_): string | null {
  const who = (r.name ?? "") + (r.email ? " — " + r.email : "");
  if (table === "conference_registrations") {
    return "تسجيل جديد في المؤتمر: " + who + (r.phone ? " — " + r.phone : "");
  }
  if (table === "contact_messages") {
    return "رسالة جديدة من الموقع:\n" + who + "\n" + (r.message ?? "").slice(0, 300);
  }
  if (table === "donation_interests") {
    return (
      "اهتمام جديد بالدعم:\n" + who +
      (r.support_type ? "\nنوع: " + r.support_type : "") +
      (r.note ? "\n" + r.note.slice(0, 200) : "")
    );
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

  // Admin decision: approvals send the ticket QR, rejections a closing message.
  // RESEND re-sends the ticket for an already approved registration.
  if (
    payload.table === "conference_registrations" &&
    (payload.event === "UPDATE" || payload.event === "RESEND")
  ) {
    const chatId = toChatId(payload.record.phone ?? "");
    if (!payload.record.phone) return json({ skipped: true });
    const whatsapp: Record<string, number> = {};
    if (payload.record.status === "approved") {
      whatsapp.approval = await sendWhats(chatId, approval(payload.record));
      whatsapp.ticket = await sendTicketQr(
        chatId,
        payload.record.ticket_code,
        "تذكرتك — مؤتمر كسلا للإنتان"
      );
    } else if (payload.record.status === "rejected") {
      whatsapp.rejection = await sendWhats(chatId, rejection(payload.record));
    }
    return json({ whatsapp });
  }

  const adminChat = await getSecret("green_api_admin");
  const alert = adminAlert(payload.table, payload.record);
  const whatsapp: Record<string, number | string> = {};

  await Promise.all([
    (async () => {
      if (adminChat && alert) whatsapp.admin = await sendWhats(adminChat, alert);
    })(),
    (async () => {
      if (payload.table === "conference_registrations" && payload.record.phone) {
        whatsapp.confirmation = await sendWhats(
          toChatId(payload.record.phone),
          confirmation(payload.record)
        );
      }
    })(),
  ]);

  const mail = compose(payload.table, payload.record);
  if (!mail?.to) return json({ skipped: true, whatsapp });

  const apiKey = await getSecret("resend_api_key");
  if (!apiKey) return json({ error: "missing resend key", whatsapp }, 500);

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
  return json({ sent: res.ok, status: res.status, whatsapp });
});
