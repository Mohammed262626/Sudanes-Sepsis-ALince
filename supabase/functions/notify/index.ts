// Sends Arabic transactional messages when a row is inserted.
// Triggered by public.notify_email() (see Supabase migrations); authenticated
// with the x-webhook-secret header, compared against the value in Supabase Vault.
// WhatsApp via Green API is the live channel (registrant confirmation + admin
// alerts); email goes through Brevo once its sender domain is verified.

const FROM = "Sudan Sepsis Alliance <muhasalahsuliman@gmail.com>";

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

// Email clients drop <style> blocks and ignore flex/grid, so the shell is
// nested tables with inline styles only. Same palette as the site: paper
// background, ink borders, one accent rule, no shadows or gradients.
const PAPER = "#f7f5f0";
const INK = "#15130f";
const ACCENT = "#c0392b";
const LINE = "#ddd8cf";
const MUTED = "#6f6a62";

function layout(body: string, preheader = "") {
  return (
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>التحالف السوداني للإنتان</title></head>' +
    // Gmail drops <head> and anything on <html>, so direction lives on <body>
    // and right-alignment is repeated on every text cell below.
    '<body dir="rtl" style="margin:0;padding:0;background:' + PAPER + ';color:' + INK +
    ';direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;-webkit-text-size-adjust:100%">' +
    (preheader
      ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(preheader) + "</div>"
      : "") +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background:' + PAPER + '">' +
    '<tr><td align="center" style="padding:32px 16px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="max-width:600px;width:100%;background:#ffffff;border:2px solid ' + INK + '">' +
    '<tr><td dir="rtl" align="right" style="background:' + INK + ';padding:20px 24px;text-align:right">' +
    '<div style="color:' + PAPER + ';font-size:17px;font-weight:bold">التحالف السوداني للإنتان</div>' +
    '<div style="color:#b9b3a7;font-size:12px;margin-top:4px">مؤتمر كسلا للإنتان — 30 نوفمبر 2026</div>' +
    "</td></tr>" +
    '<tr><td style="height:4px;line-height:4px;font-size:0;background:' + ACCENT + '">&nbsp;</td></tr>' +
    '<tr><td dir="rtl" align="right" style="padding:28px 24px 8px;font-size:16px;line-height:1.75;color:' + INK + ';text-align:right">' + body + "</td></tr>" +
    '<tr><td dir="rtl" align="right" style="padding:18px 24px 24px;border-top:2px solid ' + LINE + ';font-size:12px;line-height:1.8;color:' + MUTED + ';text-align:right">' +
    '<a href="' + SITE + '" style="color:' + ACCENT + ';text-decoration:none">التحالف السوداني للإنتان</a><br>' +
    "رسالة تلقائية — لا تُستخدم للإبلاغ عن حالات طبية طارئة." +
    "</td></tr></table></td></tr></table></body></html>"
  );
}

// Bordered detail box with label/value rows, mirroring the site's row pattern.
const row = (label: string, value: string) =>
  '<tr><td align="right" style="padding:3px 0;color:' + MUTED + ';font-size:13px;width:84px;vertical-align:top;text-align:right">' + label +
  '</td><td align="right" style="padding:3px 0;font-weight:bold;text-align:right">' + value + "</td></tr>";

const box = (rows: string) =>
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="margin:20px 0">' +
  '<tr><td dir="rtl" align="right" style="border:2px solid ' + LINE + ';padding:14px 16px;font-size:15px;line-height:1.8;color:' + INK + ';text-align:right">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="rtl">' + rows + "</table>" +
  "</td></tr></table>";

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

// Buttons roam with the door page: confirm attendance, the guest dashboard
// (door + ticket + assessments live there), and the decline path. Max 3.
const sendTicketButtons = (
  chatId: string,
  token: string,
  target: string,
  body: string,
) =>
  greenApi("sendInteractiveButtons", {
    chatId,
    header: "مؤتمر كسلا للإنتان",
    body,
    footer: "الاثنين 30 نوفمبر 2026",
    buttons: [
      { type: "url", buttonId: "1", buttonText: "تأكيد الحضور", url: target },
      {
        type: "url",
        buttonId: "2",
        buttonText: "افتح لوحتك",
        url: `${SITE}/guest/?s=${encodeURIComponent(token)}`,
      },
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
          "<p style=\"margin:0 0 4px\">طلبك لمؤتمر <strong>كسلا للإنتان</strong> وصلنا.</p>" +
          box(
            row("التاريخ", "الاثنين 30 نوفمبر 2026") +
              row("الوقت", "9:00 صباحاً بتوقيت الخرطوم") +
              row("المكان", "كسلا")
          ) +
          "<p>سنتواصل معك قريباً لتأكيد القبول.</p>",
        "استلمنا طلب تسجيلك في مؤتمر كسلا للإنتان"
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
          "<p>شكراً لتواصلك مع التحالف السوداني للإنتان. سنعود إليك في أقرب وقت.</p>",
        "استلمنا رسالتك — التحالف السوداني للإنتان"
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
          "<p>سجّلنا اهتمامك بدعم التحالف السوداني للإنتان، وسنرسل لك تفاصيل الدعم فور جاهزيتها.</p>",
        "شكراً لاهتمامك بدعم التحالف السوداني للإنتان"
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
    "الاثنين 30 نوفمبر 2026 — 9:00 صباحاً — كسلا\n" +
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
    "تذكير بمؤتمر كسلا للإنتان — الاثنين 30 نوفمبر 2026 — 9:00 صباحاً — كسلا.\n" +
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

  // Evening-before nudge: two messages — ticket image (reminder as caption)
  // and the buttons.
  if (payload.table === "conference_registrations" && payload.event === "REMIND") {
    if (!payload.record.phone) return json({ skipped: true });
    const chatId = toChatId(payload.record.phone);
    const code = payload.record.ticket_code;
    const token = String(payload.record.checkin_token ?? "");
    const target = checkinUrl(code, token);
    const whatsapp: Record<string, GreenResult> = {};
    whatsapp.ticket = await sendTicketQr(
      chatId,
      code,
      target,
      await template("registration_reminder", payload.record, reminderText(payload.record))
    );
    whatsapp.buttons = await sendTicketButtons(
      chatId,
      token,
      target,
      "غداً نلقاك. تذكرتك في الصورة أعلاه — أو من لوحتك."
    );
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
      const code = payload.record.ticket_code;
      const token = String(payload.record.checkin_token ?? "");
      const target = checkinUrl(code, token);
      // Two messages: the approval text rides as the ticket image's caption.
      whatsapp.ticket = await sendTicketQr(
        chatId,
        code,
        target,
        await template("registration_approved", payload.record, approval(payload.record))
      );
      whatsapp.buttons = await sendTicketButtons(
        chatId,
        token,
        target,
        "تذكرتك جاهزة. «لوحتك» فيها التذكرة والحضور والاستبانات — تُفتح بلا كلمة مرور."
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

  const apiKey = (await getSecret("brevo_api_key"))?.trim();
  if (!apiKey) return json({ error: "missing brevo key", whatsapp }, 500);

  // Brevo wants the display name and the address separately.
  const fromMatch = FROM.match(/^(.*)<(.+)>$/);
  const senderName = (fromMatch?.[1] ?? "التحالف السوداني للإنتان").trim();
  const senderEmail = (fromMatch?.[2] ?? FROM).trim();

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
    }),
  });

  const out = await res.text();
  console.log("brevo", payload.table, res.status, out);
  return json({ sent: res.ok, status: res.status, whatsapp });
});
