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

// One place that calls Green API: trims pasted secrets, logs the status and the
// error body, and never collapses "no credentials" into a silent success.
type GreenResult = { ok: boolean; status: number; chatId?: string; error?: string };

async function greenApi(method: string, body: Record<string, unknown>): Promise<GreenResult> {
  const id = (await getSecret("green_api_instance"))?.trim();
  const token = (await getSecret("green_api_token"))?.trim();
  if (!id || !token) {
    console.error("green-api: Vault secrets missing", {
      green_api_instance: !!id,
      green_api_token: !!token,
    });
    return { ok: false, status: 0, error: "missing green_api_instance / green_api_token in Vault" };
  }
  const res = await fetch(`https://api.green-api.com/waInstance${id}/${method}/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.text();
  console.log("green-api", method, body.chatId, res.status, out.slice(0, 300));
  const chatId = String(body.chatId ?? "");
  return res.ok
    ? { ok: true, status: res.status, chatId }
    : { ok: false, status: res.status, chatId, error: out.slice(0, 300) };
}

// Stores what Green API actually answered for each message of this call, so the
// admin dashboard can show it instead of a blind "sent".
async function logWhats(
  table: string,
  record: Record<string, unknown>,
  whatsapp: Record<string, GreenResult>,
) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rows = Object.entries(whatsapp).map(([kind, r]) => ({
    ref_table: table,
    ref_id: Number(record?.id) || null,
    kind,
    chat_id: r.chatId ?? "",
    ok: r.ok,
    status: r.status,
    error: r.error ?? null,
  }));
  if (!url || !key || rows.length === 0) return;
  const res = await fetch(url + "/rest/v1/notify_log", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error("notify_log insert", res.status, (await res.text()).slice(0, 200));
  }
}

const sendWhats = (chatId: string, message: string) =>
  greenApi("sendMessage", { chatId, message });

// The QR points at the guest's own check-in page. The pass (checkin_token) is
// what opens it; the readable code rides along for the door scanner.
const SITE = "https://mohammed262626.github.io/Sudanes-Sepsis-ALince";

const checkinUrl = (code: string, pass: string) =>
  `${SITE}/checkin/?${pass ? "k=" + encodeURIComponent(pass) + "&" : ""}t=${encodeURIComponent(code)}`;

// The assessment link carries a hash of the door token, never the token itself.
const assessmentUrl = (hash: string, stage: "pre" | "post") =>
  `${SITE}/assessment/?t=${encodeURIComponent(hash)}&s=${stage}`;

// Which window is open right now. The button is only attached when it leads
// somewhere, so a guest never lands on a dead "closed" page at the door.
async function assessmentOpen(stage: "pre" | "post"): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  const res = await fetch(
    `${url}/rest/v1/event_config?id=eq.1&select=assessment_pre_open,assessment_post_open`,
    { headers: { apikey: key, Authorization: "Bearer " + key } },
  );
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  const c = Array.isArray(rows) ? rows[0] : null;
  return stage === "pre" ? !!c?.assessment_pre_open : !!c?.assessment_post_open;
}

const qrImageUrl = (target: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=20&color=8B0000&bgcolor=FFFFFF&format=png&data=${encodeURIComponent(target)}`;

// Sends the ticket QR as an image.
// Brand colours: dark red on white keeps scanner contrast high.
const sendTicketQr = (chatId: string, code: string, target: string, caption: string) =>
  greenApi("sendFileByUrl", {
    chatId,
    urlFile: qrImageUrl(target),
    fileName: `ticket-${code}.png`,
    caption,
  });

// Three link buttons: the guest's page, the calendar file, and the decline path.
const sendTicketButtons = (chatId: string, code: string, target: string) =>
  greenApi("sendInteractiveButtons", {
    chatId,
    header: "مؤتمر كسلا للإنتان",
    body:
      `تذكرتك ${code} جاهزة.\n` +
      "اضغط «تأكيد الحضور» عند وصولك، ثم امسح رمز البوابة بكاميرا هاتفك ليُسجَّل حضورك.",
    footer: "الاثنين 16 نوفمبر 2026",
    buttons: [
      { type: "url", buttonId: "1", buttonText: "تأكيد الحضور", url: target },
      { type: "url", buttonId: "2", buttonText: "أضف إلى التقويم", url: `${SITE}/calendar/` },
      { type: "url", buttonId: "3", buttonText: "لا أستطيع الحضور", url: target + "&d=1" },
    ],
  });

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

// Admin-editable template from public.message_templates; falls back to the
// built-in text when the row is missing or blank.
async function template(key: string, r: Record_, fallback: string): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL");
  const skey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !skey) return fallback;
  const res = await fetch(`${url}/rest/v1/message_templates?key=eq.${key}&select=body`, {
    headers: { apikey: skey, Authorization: "Bearer " + skey },
  });
  if (!res.ok) return fallback;
  const rows = await res.json().catch(() => []);
  const body = Array.isArray(rows) ? rows[0]?.body : null;
  if (typeof body !== "string" || !body.trim()) return fallback;
  return body
    .replaceAll("{{name}}", r.name ?? "")
    .replaceAll("{{ticket_code}}", r.ticket_code ?? "");
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
    "رقم تذكرتك: " + (r.ticket_code ?? "") + "\n" +
    "رمز QR المرفق هو تذكرتك — أظهره عند الدخول.\n" +
    "— التحالف السوداني للإنتان"
  );
}

function attended(r: Record_): string {
  return (
    "أهلاً " + (r.name ?? "") + "،\n" +
    "تم تسجيل حضورك في مؤتمر كسلا للإنتان بنجاح ✅\n" +
    "رقم تذكرتك: " + (r.ticket_code ?? "") + "\n" +
    "نتمنى لك مؤتمراً مفيداً.\n" +
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

function reminderText(r: Record_): string {
  return (
    "أهلاً " + (r.name ?? "") + "،\n" +
    "تذكير بمؤتمر كسلا للإنتان — الاثنين 16 نوفمبر 2026 — 9:00 صباحاً — كسلا.\n" +
    "رقم تذكرتك: " + (r.ticket_code ?? "") + "\n" +
    "اضغط «تأكيد الحضور» عند وصولك، أو «لا أستطيع الحضور» إن تعذّر مجيئك.\n" +
    "— التحالف السوداني للإنتان"
  );
}

function declinedText(r: Record_): string {
  return (
    "أهلاً " + (r.name ?? "") + "،\n" +
    "سجّلنا اعتذارك عن حضور مؤتمر كسلا للإنتان، وأتحنا مقعدك لضيف آخر.\n" +
    "شكراً لإبلاغنا، ونأمل أن نلتقي بك في فعالية قادمة.\n" +
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
    console.error("notify: unauthorized", { secretInVault: !!expected });
    return json({ error: "unauthorized" }, 401);
  }

  const payload = await req.json().catch(() => null);
  if (!payload?.table || !payload?.record) return json({ error: "bad payload" }, 400);

  // Door check-in: the guest gets a thanks message once the scan is confirmed,
// with the pre-assessment button as the conference starts.
  if (payload.table === "conference_registrations" && payload.event === "ATTEND") {
    if (!payload.record.phone) return json({ skipped: true });
    const chatId = toChatId(payload.record.phone);
    const body = await template(
      "registration_attended",
      payload.record,
      attended(payload.record)
    );
    const hash = String(payload.record.assessment_token ?? "");
    // No hash means the column has not been migrated in; a closed window means
    // the button would dead-end. Both fall back to the plain thanks message.
    if (!hash || !(await assessmentOpen("pre"))) {
      const whatsapp = { attended: await sendWhats(chatId, body) };
      await logWhats(payload.table, payload.record, whatsapp);
      return json({ whatsapp, preButton: false });
    }
    const result = await greenApi("sendInteractiveButtons", {
      chatId,
      header: "مؤتمر كسلا للإنتان",
      body,
      footer: "الاستبانة الأولى",
      buttons: [
        {
          type: "url",
          buttonId: "1",
          buttonText: "الاستبانة الأولى",
          url: assessmentUrl(hash, "pre"),
        },
      ],
    });
    await logWhats(payload.table, payload.record, { attended: result });
    return json({ whatsapp: { attended: result }, preButton: true });
  }

  // Admin invite: both assessment links, one tap each. The page itself refuses
  // whoever is not attended or whose window is shut.
  if (payload.table === "conference_registrations" && payload.event === "ASSESSMENT") {
    if (!payload.record.phone) return json({ skipped: true });
    const hash = String(payload.record.assessment_token ?? "");
    if (!hash) return json({ skipped: true, reason: "no assessment_token" });
    const stage = payload.stage === "post" ? "post" : "pre";
    const result = await greenApi("sendInteractiveButtons", {
      chatId: toChatId(payload.record.phone),
      header: "مؤتمر كسلا للإنتان",
      body:
        "أهلاً " + (payload.record.name ?? "") + "،\n" +
        (stage === "pre"
          ? "قبل أن تبدأ الجلسات، أجب عن أسئلة قصيرة لقياس معرفتك الحالية بالإنتان."
          : "قبل أن ينتهي المؤتمر، أجب عن الأسئلة نفسها لنقيس ما تعلّمته."),
      footer: "دقيقة واحدة — إجابة واحدة لكل سؤال",
      // One button: this message invites one stage, not both.
      buttons: [
        stage === "pre"
          ? {
              type: "url",
              buttonId: "1",
              buttonText: "الاستبانة الأولى",
              url: assessmentUrl(hash, "pre"),
            }
          : {
              type: "url",
              buttonId: "1",
              buttonText: "الاستبانة النهائية",
              url: assessmentUrl(hash, "post"),
            },
      ],
    });
    await logWhats(payload.table, payload.record, { assessment: result });
    return json({ whatsapp: { assessment: result } });
  }

  // Evening-before nudge: the reminder text, then the ticket itself again.
  if (payload.table === "conference_registrations" && payload.event === "REMIND") {
    if (!payload.record.phone) return json({ skipped: true });
    const chatId = toChatId(payload.record.phone);
    const code = payload.record.ticket_code;
    const target = checkinUrl(code, String(payload.record.checkin_token ?? ""));
    const whatsapp: Record<string, GreenResult> = {};
    whatsapp.reminder = await sendWhats(
      chatId,
      await template("registration_reminder", payload.record, reminderText(payload.record))
    );
    whatsapp.ticket = await sendTicketQr(
      chatId,
      code,
      target,
      "مؤتمر كسلا للإنتان — الاثنين 16 نوفمبر 2026\nرقم تذكرتك: " + code
    );
    whatsapp.buttons = await sendTicketButtons(chatId, code, target);
    await logWhats(payload.table, payload.record, whatsapp);
    return json({ whatsapp });
  }

  // "I can't come": closing message to the guest, a note to the admins.
  if (payload.table === "conference_registrations" && payload.event === "DECLINE") {
    const whatsapp: Record<string, GreenResult> = {};
    if (payload.record.phone) {
      whatsapp.declined = await sendWhats(
        toChatId(payload.record.phone),
        await template("registration_declined", payload.record, declinedText(payload.record))
      );
    }
    const adminChat = (await getSecret("green_api_admin"))?.trim();
    if (adminChat) {
      whatsapp.admin = await sendWhats(
        adminChat,
        "اعتذر عن الحضور: " + (payload.record.name ?? "") +
          (payload.record.phone ? " — " + payload.record.phone : "")
      );
    }
    await logWhats(payload.table, payload.record, whatsapp);
    return json({ whatsapp });
  }

  // Admin decision: approvals send the ticket QR, rejections a closing message.
  // RESEND re-sends the ticket for an already approved registration.
  if (
    payload.table === "conference_registrations" &&
    (payload.event === "UPDATE" || payload.event === "RESEND")
  ) {
    const chatId = toChatId(payload.record.phone ?? "");
    if (!payload.record.phone) return json({ skipped: true });
    const whatsapp: Record<string, GreenResult> = {};
    if (payload.record.status === "approved") {
      whatsapp.approval = await sendWhats(
        chatId,
        await template("registration_approved", payload.record, approval(payload.record))
      );
      whatsapp.ticket = await sendTicketQr(
        chatId,
        payload.record.ticket_code,
        checkinUrl(payload.record.ticket_code, String(payload.record.checkin_token ?? "")),
        "مؤتمر كسلا للإنتان — الاثنين 16 نوفمبر 2026\nرقم تذكرتك: " + payload.record.ticket_code
      );
      whatsapp.buttons = await sendTicketButtons(
        chatId,
        payload.record.ticket_code,
        checkinUrl(payload.record.ticket_code, String(payload.record.checkin_token ?? ""))
      );
    } else if (payload.record.status === "rejected") {
      whatsapp.rejection = await sendWhats(
        chatId,
        await template("registration_rejected", payload.record, rejection(payload.record))
      );
    }
    await logWhats(payload.table, payload.record, whatsapp);
    return json({ whatsapp });
  }

  const adminChat = (await getSecret("green_api_admin"))?.trim();
  const alert = adminAlert(payload.table, payload.record);
  const whatsapp: Record<string, GreenResult> = {};

  await Promise.all([
    (async () => {
      if (adminChat && alert) whatsapp.admin = await sendWhats(adminChat, alert);
    })(),
    (async () => {
      if (payload.table === "conference_registrations" && payload.record.phone) {
        whatsapp.confirmation = await sendWhats(
          toChatId(payload.record.phone),
          await template("registration_received", payload.record, confirmation(payload.record))
        );
      }
    })(),
  ]);

  await logWhats(payload.table, payload.record, whatsapp);

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
