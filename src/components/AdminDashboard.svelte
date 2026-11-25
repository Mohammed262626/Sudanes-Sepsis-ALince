<script lang="ts">
  import { onMount, tick } from "svelte";
  import { supabase } from "../lib/supabase";
  import { url } from "../lib/url";

  type Row = Record<string, string | number>;
  type Template = { key: string; label: string; body: string };
  type Door = { id: number; label: string; code: string; created_at: string };

  // Grouped by function: one group per row of related work.
  const groups = [
    {
      label: "إدارة المؤتمر",
      tabs: [
        { id: "conference_registrations", label: "التسجيلات" },
        { id: "assessments", label: "الاستبانات" },
        { id: "program", label: "البرنامج" },
        { id: "settings", label: "المؤتمر" },
        { id: "doors", label: "البوابات" },
      ],
    },
    {
      label: "التواصل",
      tabs: [
        { id: "contact_messages", label: "الرسائل" },
        { id: "donation_interests", label: "الدعم" },
        { id: "registration_notify", label: "المهتمين" },
        { id: "push", label: "إشعارات" },
        { id: "templates", label: "قوالب واتساب" },
      ],
    },
  ];

  const tabs = groups.flatMap((g) => g.tabs);

  const dataTabs = tabs.filter(
    (t) => !["templates", "assessments", "push", "program", "settings", "doors"].includes(t.id),
  );

  const columns: Record<string, { key: string; label: string; cls?: string }[]> = {
    conference_registrations: [
      { key: "created_at", label: "التاريخ", cls: "nw hide-sm" },
      { key: "name", label: "الاسم", cls: "wrap" },
      { key: "status", label: "الحالة", cls: "nw" },
      { key: "ticket_code", label: "رمز التذكرة", cls: "nw hide-xs" },
      { key: "email", label: "البريد", cls: "ltr wrap hide-xs" },
      { key: "phone", label: "الهاتف", cls: "nw hide-xs" },
      { key: "role", label: "الصفة", cls: "nw hide-sm" },
      { key: "actions", label: "إجراء", cls: "nw" },
    ],
    assessments: [
      { key: "name", label: "الاسم", cls: "wrap" },
      { key: "ticket_code", label: "رمز التذكرة", cls: "nw hide-xs" },
      { key: "pre", label: "الأولى", cls: "nw" },
      { key: "post", label: "النهائية", cls: "nw" },
      { key: "score", label: "الدرجة (قبل · بعد)", cls: "nw" },
      { key: "actions", label: "إجراء", cls: "nw" },
    ],
    contact_messages: [
      { key: "created_at", label: "التاريخ", cls: "nw" },
      { key: "name", label: "الاسم", cls: "wrap" },
      { key: "email", label: "البريد", cls: "ltr wrap" },
      { key: "message", label: "الرسالة", cls: "wrap" },
      { key: "actions", label: "إجراء", cls: "nw" },
    ],
    donation_interests: [
      { key: "created_at", label: "التاريخ", cls: "nw" },
      { key: "name", label: "الاسم", cls: "wrap" },
      { key: "email", label: "البريد", cls: "ltr wrap" },
      { key: "support_type", label: "نوع الدعم", cls: "nw" },
      { key: "note", label: "ملاحظات", cls: "wrap" },
      { key: "actions", label: "إجراء", cls: "nw" },
    ],
    registration_notify: [
      { key: "created_at", label: "التاريخ", cls: "nw" },
      { key: "name", label: "الاسم", cls: "wrap" },
      { key: "email", label: "البريد", cls: "ltr wrap" },
      { key: "actions", label: "إجراء", cls: "nw" },
    ],
  };

  let loading = $state(true);
  let tab = $state(tabs[0].id);
  let data = $state<Record<string, Row[]>>({});
  let failed = $state(false);
  let userEmail = $state("");
  let drawer = $state(false);

  // While the drawer is open the page behind must not scroll.
  $effect(() => {
    if (!drawer) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  });
  let statusFilter = $state("all");

  let templates = $state<Template[]>([]);
  let saving = $state(false);
  let saveNote = $state("");

  // Day program: rows live in the database and the guest dashboard reads them
  // directly, so adding a session is visible to guests without a rebuild.
  type ProgramRow = { id: number; title: string; starts_at: string; notes: string | null };
  let program = $state<ProgramRow[]>([]);
  let programBusy = $state(false);
  let programNote = $state("");
  let draft = $state({ title: "", starts_at: "", notes: "" });

  const timeFmt = new Intl.DateTimeFormat("ar-SD", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Khartoum",
  });

  const dateFmt = new Intl.DateTimeFormat("ar-SD", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const statusLabels: Record<string, string> = {
    pending: "بانتظار القبول",
    approved: "مقبول",
    rejected: "مرفوض",
  };

  // shortcut: mirrors the test questions in AssessmentForm.svelte; swap both
  // together when the clinician-reviewed set lands.
  const ANSWER_KEY = [0, 0, 0, 0, 0, 0];

  const scoreOf = (answers: Record<string, number> | undefined) => {
    if (!answers) return "—";
    const picks = Object.keys(answers).sort();
    const hit = picks.filter((k, i) => Number(answers[k]) === ANSWER_KEY[i]).length;
    return `${hit}/${picks.length}`;
  };

  let busyId = $state(0);
  let actionError = $state("");
  let flashId = $state(0);
  let query = $state("");

  // Row feedback after a write; cleared so the animation can replay.
  const flash = (id: number) => {
    flashId = id;
    setTimeout(() => {
      if (flashId === id) flashId = 0;
    }, 900);
  };

  // Admin-only: RLS lets only allowlisted emails update; the DB trigger sends the
  // approval message with the ticket QR (or the rejection message).
  async function decide(id: number, status: "approved" | "rejected" | "pending") {
    if (!supabase || busyId) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("conference_registrations")
      .update({ status })
      .eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر تحديث الحالة. حاول مرة أخرى.";
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).map((r) =>
      r.id === id ? { ...r, status } : r,
    );
    data = { ...data };
    flash(id);
    if (status !== "pending") void showSends([id]);
  }

  // Re-sends the ticket QR for an approved registration (via the resend_ticket RPC).
  async function resend(id: number) {
    if (!supabase || busyId) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase.rpc("resend_ticket", { p_id: id });
    busyId = 0;
    if (error) actionError = "تعذّر إرسال التذكرة. حاول مرة أخرى.";
    else {
      flash(id);
      void showSends([id]);
    }
  }

  // Clears a mistaken check-in. The attendance trigger only fires null -> value,
  // so nothing is sent to the guest.
  async function clearAttendance(id: number) {
    if (!supabase || busyId || !confirm("إلغاء تسجيل حضور هذا الشخص؟")) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("conference_registrations")
      .update({ attended_at: null })
      .eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر إلغاء الحضور. حاول مرة أخرى.";
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).map((r) =>
      r.id === id ? { ...r, attended_at: null } : r,
    );
    data = { ...data };
    flash(id);
  }

  // Withdraws an approval: back to pending, and the decline is cleared so the row
// does not keep the «اعتذر» badge. Silent — the status trigger sends nothing for
// pending, and the guest's QR page starts refusing him at once.
  async function revoke(id: number) {
    if (!supabase || busyId || !confirm("إلغاء قبول هذا التسجيل وإعادته إلى الانتظار؟")) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("conference_registrations")
      .update({ status: "pending", declined_at: null })
      .eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر إلغاء القبول. حاول مرة أخرى.";
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).map((r) =>
      r.id === id ? { ...r, status: "pending", declined_at: null } : r,
    );
    data = { ...data };
    flash(id);
  }

  // Reverses a decline; the decline trigger only fires null -> value, so this
  // sends nothing.
  async function clearDecline(id: number) {
    if (!supabase || busyId || !confirm("إلغاء اعتذار هذا الضيف وإعادته إلى قائمة الحضور؟")) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("conference_registrations")
      .update({ declined_at: null })
      .eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر إلغاء الاعتذار. حاول مرة أخرى.";
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).map((r) =>
      r.id === id ? { ...r, declined_at: null } : r,
    );
    data = { ...data };
    flash(id);
  }

  // Copying the ticket code is the one thing staff do with it at the desk; a tap
// copies it and says so for a moment.
  let copiedCode = $state("");
  let copyTimer = 0;

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Old browsers / non-secure contexts: fall back to a hidden selection.
      const el = document.createElement("textarea");
      el.value = code;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.append(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    copiedCode = code;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copiedCode = ""), 1600);
  }

  async function remove(id: number) {
    if (!supabase || busyId || !confirm("حذف هذا السجل نهائياً؟")) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase.from(tab).delete().eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر الحذف. حاول مرة أخرى.";
      return;
    }
    data[tab] = (data[tab] ?? []).filter((r) => r.id !== id);
    data = { ...data };
  }

  // CSV of what is on screen (search + status filter applied), BOM so Excel
  // keeps the Arabic.
  let exporting = $state(false);

  // The whole tab, straight from Supabase: every row (paginated past any row
  // cap) and every column, no filters — the screen filters stay screen-only.
  async function fetchAllRows(table: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const r = await supabase!.from(table).select("*").range(from, from + 999);
      if (r.error) throw r.error;
      out.push(...((r.data ?? []) as Row[]));
      if ((r.data?.length ?? 0) < 1000) break;
    }
    return out;
  }

  async function exportCsv() {
    if (!supabase || exporting) return;
    exporting = true;
    try {
      let rows: Row[];
      if (tab === "assessments") {
        const [regs, responses] = await Promise.all([
          supabase.from("conference_registrations").select("*").order("created_at", { ascending: false }),
          supabase
            .from("assessment_responses")
            .select("id,registration_id,stage,answers,created_at")
            .order("created_at", { ascending: false }),
        ]);
        if (regs.error || responses.error) throw regs.error ?? responses.error;
        rows = buildAssessmentRows(regs.data ?? [], responses.data ?? []);
      } else {
        rows = await fetchAllRows(tab);
      }
      if (!rows.length) {
        pushToast("لا توجد سجلات للتصدير.", false);
        return;
      }
      const known: Record<string, string> = Object.fromEntries(
        cols.filter((c) => c.key !== "actions").map((c) => [c.key, c.label]),
      );
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
      const head = keys.map((k) => cell(known[k] ?? k)).join(",");
      const body = rows
        .map((r) =>
          keys
            .map((k) =>
              cell(
                k === "status"
                  ? (statusLabels[String(r.status)] ?? r.status)
                  : k === "created_at"
                    ? new Date(String(r.created_at)).toISOString()
                    : r[k],
              ),
            )
            .join(","),
        )
        .join("\r\n");
      const blob = new Blob(["\uFEFF" + head + "\r\n" + body], {
        type: "text/csv;charset=utf-8",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      pushToast(`صُدِّر ${rows.length} سجلاً.`, true);
    } catch (e) {
      pushToast(`تعذّر التصدير: ${(e as Error).message}`, false);
    } finally {
      exporting = false;
    }
  }

  // Evening-before nudge: one batch of 25, press again for the next. The RPC
  // stamps reminder_sent_at, so nobody is reminded twice.
  let reminding = $state(false);
  let notice = $state("");

  async function remind() {
    if (!supabase || reminding || !pendingReminders) return;
    if (!confirm(`إرسال تذكير إلى ${pendingReminders} ضيفاً؟`)) return;
    reminding = true;
    actionError = "";
    notice = "";
    const { data: n, error } = await supabase.rpc("remind_pending", { p_limit: 25 });
    reminding = false;
    if (error) {
      actionError = "تعذّر إرسال التذكير. حاول مرة أخرى.";
      return;
    }
    const sent = Number(n ?? 0);
    notice =
      `أُرسل ${sent} تذكيراً.` +
      (pendingReminders > sent ? " اضغط مرة أخرى للدفعة التالية." : "");
    // A reminder touches no visible column; the log drawer re-reads notify_log.
    void showSends();
  }

  async function saveProgram() {
    if (!supabase || programBusy) return;
    if (!draft.title.trim() || !draft.starts_at) {
      programNote = "اكتب عنوان الفقرة ووقتها.";
      return;
    }
    programBusy = true;
    programNote = "";
    const { data: row, error } = await supabase
      .from("conference_program")
      .insert({
        title: draft.title.trim(),
        starts_at: new Date(draft.starts_at).toISOString(),
        notes: draft.notes.trim() || null,
      })
      .select("id,title,starts_at,notes")
      .single();
    programBusy = false;
    if (error || !row) {
      programNote = "تعذّر الحفظ. حاول مرة أخرى.";
      return;
    }
    program = ([...program, row as ProgramRow] as ProgramRow[]).sort((a, b) =>
      a.starts_at.localeCompare(b.starts_at),
    );
    draft = { title: "", starts_at: "", notes: "" };
    programNote = "أُضيفت الفقرة وبدأ يراها الضيوف.";
  }

  async function removeProgram(id: number) {
    if (!supabase || programBusy || !confirm("حذف هذه الفقرة من البرنامج؟")) return;
    programBusy = true;
    programNote = "";
    const { error } = await supabase.from("conference_program").delete().eq("id", id);
    programBusy = false;
    if (error) {
      programNote = "تعذّر الحذف. حاول مرة أخرى.";
      return;
    }
    program = program.filter((p) => p.id !== id);
  }

  async function saveTemplates() {    if (!supabase || saving) return;
    saving = true;
    saveNote = "";
    const results = await Promise.all(
      templates.map((t) =>
        supabase!
          .from("message_templates")
          .update({ body: t.body, updated_at: new Date().toISOString() })
          .eq("key", t.key),
      ),
    );
    saving = false;
    saveNote = results.some((r) => r.error)
      ? "تعذّر الحفظ. حاول مرة أخرى."
      : "تم الحفظ — تُطبّق على الرسائل القادمة.";
  }

  // Assessment windows: the page reads them through the database, so flipping
  // one here is enough — no rebuild.
  let preOpen = $state(false);
  let postOpen = $state(false);
  let sendingStage = $state("");

  async function toggleWindow(stage: "pre" | "post", open: boolean) {
    if (!supabase || sendingStage) return;
    sendingStage = stage;
    actionError = "";
    const { data, error } = await supabase.rpc("set_assessment_window", {
      p_stage: stage,
      p_open: open,
    });
    sendingStage = "";
    if (error) {
      actionError = "تعذّر تغيير حالة الاستبانة. حاول مرة أخرى.";
      return;
    }
    if (stage === "pre") preOpen = open;
    else postOpen = open;
    // Opening the final one sends its invites from inside the same call.
    const sent = Number((data as { sent?: number } | null)?.sent ?? 0);
    notice = open && stage === "post" ? `فُتحت النهائية وأُرسل ${sent} رابطاً.` : "";
    if (open && stage === "post") void showSends();
  }

  async function sendInvite(stage: "pre" | "post") {
    if (!supabase || sendingStage) return;
    const target = stage === "pre" ? preTargets : postTargets;
    if (!target) return;
    if (!confirm(`إرسال رابط الاستبانة إلى ${target} حاضراً؟`)) return;
    sendingStage = stage;
    actionError = "";
    notice = "";
    const { data: n, error } = await supabase.rpc("send_assessment_invite", {
      p_stage: stage,
    });
    sendingStage = "";
    if (error) {
      actionError = "تعذّر إرسال الروابط. حاول مرة أخرى.";
      return;
    }
    notice = `أُرسل ${Number(n ?? 0)} رابطاً.`;
    void showSends();
  }

  // WhatsApp runs inside the database trigger, so Green API's answer lands a
  // moment later. Poll the log a few times and say the truth; no fake success.
  type Toast = { id: number; text: string; ok: boolean };
  let toasts = $state<Toast[]>([]);
  let toastSeq = 0;
  const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

  function dismissToast(id: number) {
    const timer = toastTimers.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.delete(id);
    toasts = toasts.filter((t) => t.id !== id);
  }

  function pushToast(text: string, ok: boolean) {
    const id = ++toastSeq;
    toasts = [...toasts, { id, text, ok }].slice(-4);
    toastTimers.set(
      id,
      setTimeout(() => dismissToast(id), ok ? 6000 : 10000),
    );
  }

  // Conference config.
  let bandEnabled = $state(true);
  let confSoon = $state(true);
  let regOpen = $state(false);
  let confEventDate = $state("");
  let confEventTime = $state("9:00 صباحاً بتوقيت الخرطوم");
  let confRegDeadline = $state("");
  let savingConfig = $state(false);
  let configNote = $state("");
  let waitlistCount = $state(0);
  // What is live on the site now: drives the summary strip and the unsaved hint.
  let savedConf = $state({ band: true, soon: false, open: false, deadline: "" });
  let confBaseline = $state("");
  const confSignature = $derived(
    [bandEnabled, confSoon, regOpen, confEventDate, confEventTime, confRegDeadline].join("|"),
  );
  const confDirty = $derived(confBaseline !== "" && confSignature !== confBaseline);

  const deadlineFmt = new Intl.DateTimeFormat("ar-SD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Khartoum",
  });

  // Khartoum is fixed at UTC+2 (no DST), so convert by a constant offset rather
  // than the browser's zone. DB stores an instant; datetime-local needs local text.
  const KHARTOUM_OFFSET_MS = 2 * 3600_000;

  function toDeadlineInput(iso: string | null): string {
    if (!iso) return "";
    // Accept both "+00:00" and the bare "+00" PostgREST used to emit.
    const t = new Date(iso.replace(/([+-]\d{2})$/, "$1:00")).getTime();
    if (Number.isNaN(t)) return "";
    return new Date(t + KHARTOUM_OFFSET_MS).toISOString().slice(0, 16);
  }

  function toDeadlineInstant(local: string): string | null {
    return local ? local + ":00+02:00" : null;
  }

  async function saveConferenceConfig() {
    if (!supabase || savingConfig) return;
    savingConfig = true;
    configNote = "";
    const { error } = await supabase.rpc("set_conference_config", {
      p_band_enabled: bandEnabled,
      p_soon: confSoon,
      p_event_date: confEventDate,
      p_event_time: confEventTime,
      p_reg_deadline: toDeadlineInstant(confRegDeadline),
      p_reg_open: regOpen,
    });
    savingConfig = false;
    if (error) {
      // An expired session is the usual culprit: the data loaded fine an hour
      // ago, then the JWT died. Send them to sign in instead of retry-zombie.
      if (error.code === "PGRST301" || error.status === 401 || /JWT/i.test(error.message)) {
        location.replace(url("admin/login"));
        return;
      }
      configNote = `تعذّر الحفظ: ${error.message}`;
    } else {
      configNote = "تم الحفظ.";
      confBaseline = confSignature;
      savedConf = { band: bandEnabled, soon: confSoon, open: regOpen, deadline: confRegDeadline };
    }
  }

  // Emails everyone who asked to be told when registration opens. Only makes
  // sense while registration is actually open.
  async function openWaitlist() {
    if (!supabase || waitlistCount === 0) return;
    if (!confirm(`إرسال «التسجيل مفتوح» إلى ${waitlistCount} مهتمّاً؟`)) return;
    const { data, error } = await supabase.rpc("notify_waitlist");
    if (error) {
      configNote = "تعذّر الإرسال. حاول مرة أخرى.";
      return;
    }
    configNote = `أُرسل ${Number(data ?? 0)} بريداً.`;
  }

  // Waitlist CRUD: add a person, or edit an existing name/email.
  let waitDraft = $state({ name: "", email: "" });
  let waitEditId = $state(0);
  let waitNote = $state("");

  async function saveWait(draft: { name: string; email: string }, id = 0) {
    if (!supabase) return;
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name || !email) {
      waitNote = "اكتب الاسم والبريد.";
      return;
    }
    waitNote = "";
    const res = id
      ? await supabase.from("registration_notify").update({ name, email }).eq("id", id)
      : await supabase.from("registration_notify").insert({ name, email }).select().single();
    if (res.error) {
      waitNote = res.error.code === "23505" ? "هذا البريد مسجّل مسبقاً." : "تعذّر الحفظ. حاول مرة أخرى.";
      return;
    }
    if (id) {
      data.registration_notify = (data.registration_notify ?? []).map((r) =>
        r.id === id ? { ...r, name, email } : r,
      );
      waitEditId = 0;
    } else if (res.data) {
      // In place: the row comes back from PostgREST, newest-first.
      data.registration_notify = [res.data as Row, ...(data.registration_notify ?? [])];
    }
    data = { ...data };
    waitDraft = { name: "", email: "" };
  }

  const SEND_KINDS: Record<string, string> = {
    approval: "رسالة القبول",
    ticket: "التذكرة",
    buttons: "أزرار التذكرة",
    rejection: "رسالة الرفض",
    attended: "رسالة الحضور",
    assessment: "رابط الاستبانة",
    reminder: "التذكير",
    declined: "رسالة الاعتذار",
    confirmation: "تأكيد التسجيل",
    email: "البريد الإلكتروني",
    admin: "تنبيه الأدمن",
  };

  // Browser notifications are for the failures you cannot sit and watch for.
  let notifyOn = $state(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );

  let pushText = $state("");
  let doors = $state<Door[]>([]);
  let doorDraft = $state("");
  let doorBusy = $state(false);
  let doorNote = $state("");
  let poster = $state<Door | null>(null);
  let pushNote = $state("");
  let pushing = $state(false);
  let pushCount = $state(0);

  // Session-only send log below the composer. Nothing to reload: just append.
  let pushFeed = $state<{ text: string; ok: boolean }[]>([]);

  async function sendPush() {
    if (!supabase || pushing) return;
    const body = pushText.trim();
    if (!body) return;
    if (!confirm(`إرسال الإشعار إلى ${pushCount} مشتركاً؟`)) return;
    pushing = true;
    pushNote = "";
    const { data, error } = await supabase.functions.invoke("push-send", {
      body: { title: "التحالف السوداني للتسمم الدموي", body },
    });
    pushing = false;
    const at = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
    if (error) {
      pushNote = "تعذّر الإرسال. حاول مرة أخرى.";
      pushFeed = [{ text: `${at} — فشل الإرسال`, ok: false }, ...pushFeed].slice(0, 8);
      pushToast(pushNote, false);
      return;
    }
    const sent = Number((data as { sent?: number } | null)?.sent ?? 0);
    const failed = Number((data as { failed?: number } | null)?.failed ?? 0);
    pushNote = `وصل ${sent} إشعاراً` + (failed ? `، وفشل ${failed}.` : ".");
    pushToast(pushNote, failed === 0);
    if (failed && notifyOn) new Notification("فشل بعض الإشعارات", { body: pushNote });
    pushFeed = [
      { text: `${at} — ${pushNote} «${body}»`, ok: failed === 0 },
      ...pushFeed,
    ].slice(0, 8);
    pushText = "";
    void refreshSubscribers();
  }

  // Subscribers change on their own schedule; read the count when the tab opens.
  async function refreshSubscribers() {
    if (!supabase) return;
    const { count } = await supabase
      .from("push_subscriptions")
      .select("endpoint", { count: "exact", head: true });
    pushCount = count ?? 0;
  }

  async function askNotify() {    if (typeof Notification === "undefined") {
      pushToast("المتصفح لا يدعم الإشعارات.", false);
      return;
    }
    const state = await Notification.requestPermission();
    notifyOn = state === "granted";
    const joined = notifyOn && (await (window as any).sepPush?.());
    pushToast(
      state !== "granted"
        ? "لم يُسمح بالإشعارات — فعّلها من إعدادات المتصفح."
        : joined
          ? "تم تفعيل إشعارات المتصفح على هذا الجهاز."
          : "سُمح بالإشعارات، لكن تعذّر تسجيل المتصفح.",
      state === "granted" && !!joined,
    );
  }

  async function showSends(ids: number[] = []) {
    if (!supabase) return;
    const since = new Date(Date.now() - 120_000).toISOString();
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const q = supabase
        .from("notify_log")
        .select("ref_id, kind, chat_id, ok, status, error")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(8);
      if (ids.length) q.in("ref_id", ids);
      const { data } = await q;
      if (!data?.length) continue;
      for (const r of data) {
        const who = String(r.chat_id ?? "").replace("@c.us", "");
        const what = SEND_KINDS[r.kind] ?? r.kind;
        if (r.ok) {
          pushToast(`تم إرسال ${what} إلى ${who}.`, true);
          continue;
        }
        const why =
          Number(r.status) === 466 ? "تجاوز حصة Green API الشهرية" : `رمز ${r.status}`;
        const text = `تعذّر إرسال ${what} إلى ${who} — ${why}.`;
        pushToast(text, false);
        if (notifyOn) new Notification("تعذّر إرسال رسالة", { body: text });
      }
      return;
    }
  }

  // Wipes a guest's answers (both stages) so he can take it again.
  async function wipeAssessment(id: number) {
    if (!supabase || busyId) return;
    if (!confirm("حذف إجابات هذا الضيف؟ سيُسمح له بالإجابة من جديد.")) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("assessment_responses")
      .delete()
      .eq("registration_id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر حذف الإجابات. حاول مرة أخرى.";
      return;
    }
    // In place: the row resets and the derived answered-counts follow it.
    data.assessments = (data.assessments ?? []).map((r) =>
      r.id === id
        ? { ...r, pre: "—", post: "—", score: "— · —", has_pre: "", has_post: "", pre_answers: "", post_answers: "" }
        : r,
    );
    data = { ...data };
    flash(id);
  }

  // Doors: each entrance gets its own public code; the poster prints huge.
  const doorUrl = (d: Door) =>
    `${location.origin}${url("conference/checkin")}/?door=${encodeURIComponent(d.code)}`;

  const qrUrl = (d: Door) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=40&color=962567&bgcolor=FFFFFF&format=png&data=${encodeURIComponent(doorUrl(d))}`;

  async function addDoor() {
    if (!supabase || doorBusy) return;
    const label = doorDraft.trim();
    if (!label) {
      doorNote = "أدخل اسم البوابة.";
      return;
    }
    doorBusy = true;
    doorNote = "";
    // Unambiguous alphabet, ticket-style ID: no I/L/O/0/1 confusion on posters.
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
    const { data, error } = await supabase
      .from("doors")
      .insert({ label, code: `DOOR-${rnd}` })
      .select()
      .single();
    doorBusy = false;
    if (error || !data) {
      doorNote = "تعذّر إنشاء البوابة. حاول مرة أخرى.";
      return;
    }
    doorDraft = "";
    // In place: no full reload, the row arrives straight from PostgREST.
    doors = [...doors, data as Door];
  }

  async function removeDoor(id: number) {
    if (!supabase || doorBusy) return;
    if (!confirm("حذف هذه البوابة؟ ملصقها لن يعمل بعد الحذف.")) return;
    doorBusy = true;
    const { error } = await supabase.from("doors").delete().eq("id", id);
    doorBusy = false;
    if (error) {
      doorNote = "تعذّر الحذف. حاول مرة أخرى.";
      return;
    }
    if (poster?.id === id) poster = null;
    doors = doors.filter((d) => d.id !== id);
  }

  const loadedTabs = new Set<string>();

  // One card per person: pre and post answers meet on the registration. Shared
  // by the tab view and the CSV export so both show the same join.
  function buildAssessmentRows(regs: Row[], responses: { registration_id: number; stage: string; answers: Record<string, number>; created_at: string }[]): Row[] {
    const byReg = new Map<
      number,
      { pre?: { at: string; answers: Record<string, number> }; post?: { at: string; answers: Record<string, number> } }
    >();
    for (const a of responses) {
      const entry = byReg.get(a.registration_id) ?? {};
      entry[a.stage as "pre" | "post"] = { at: a.created_at, answers: a.answers ?? {} };
      byReg.set(a.registration_id, entry);
    }
    const raw = (answers?: Record<string, number>) =>
      answers
        ? Object.entries(answers)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")
        : "";
    const line = (e?: { at: string; answers: Record<string, number> }) =>
      e ? `${scoreOf(e.answers)} · ${dateFmt.format(new Date(e.at))}` : "—";
    return regs
      .filter((r) => r.attended_at)
      .map((r) => {
        const e = byReg.get(Number(r.id)) ?? {};
        return {
          id: r.id,
          name: r.name,
          ticket_code: r.ticket_code,
          pre: line(e.pre),
          post: line(e.post),
          score: `${scoreOf(e.pre?.answers)} · ${scoreOf(e.post?.answers)}`,
          has_pre: e.pre ? "1" : "",
          has_post: e.post ? "1" : "",
          pre_answers: raw(e.pre?.answers),
          post_answers: raw(e.post?.answers),
        };
      });
  }

  let tabLoading = $state(false);
  let counts = $state<Record<string, number>>({});

  // One tab at a time: the dashboard boots with the active tab's data and the
  // rest streams in the first time its tab opens. Badges stay honest through
  // cheap head counts.
  async function loadTab(id: string, boot = false) {
    if (!supabase) return;
    if (boot) {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        location.replace(url("admin/login"));
        return;
      }
      userEmail = session.session.user.email ?? "";
      loading = true;
    } else if (loadedTabs.has(id)) {
      return;
    } else {
      tabLoading = true;
    }
    actionError = "";
    saveNote = "";

    const next = { ...data };
    const plain = async (table: string) => {
      const r = await supabase!
        .from(table)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (r.error) failed = true;
      return (r.data ?? []) as Row[];
    };

    if (id === "assessments") {
      const [regs, responses, config] = await Promise.all([
        plain("conference_registrations"),
        supabase
          .from("assessment_responses")
          .select("id,registration_id,stage,answers,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("event_config")
          .select("assessment_pre_open,assessment_post_open")
          .eq("id", 1)
          .maybeSingle(),
      ]);
      if (responses.error || config.error) failed = true;
      next.conference_registrations = regs;
      loadedTabs.add("conference_registrations");
      next.assessments = buildAssessmentRows(regs, responses.data ?? []);
      preOpen = !!config.data?.assessment_pre_open;
      postOpen = !!config.data?.assessment_post_open;
    } else if (id === "templates") {
      const { data: rows, error } = await supabase
        .from("message_templates")
        .select("key,label,body")
        .order("key");
      if (error) failed = true;
      const order = [
        "registration_received",
        "registration_approved",
        "registration_attended",
        "registration_rejected",
      ];
      templates = ((rows ?? []) as Template[]).sort(
        (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
      );
    } else if (id === "program") {
      const { data, error } = await supabase
        .from("conference_program")
        .select("id,title,starts_at,notes")
        .order("starts_at");
      if (error) failed = true;
      program = (data ?? []) as ProgramRow[];
    } else if (id === "doors") {
      const { data, error } = await supabase.from("doors").select("*").order("id");
      if (error) failed = true;
      doors = (data ?? []) as Door[];
    } else if (id === "settings") {
      const cfgRes = await supabase
        .from("event_config")
        .select("band_enabled,soon,event_date,event_time,reg_deadline,reg_open")
        .eq("id", 1)
        .maybeSingle();
      if (!cfgRes.error && cfgRes.data) {
        const c = cfgRes.data;
        bandEnabled = c.band_enabled !== false;
        confSoon = c.soon === true;
        regOpen = c.reg_open === true;
        confEventDate = String(c.event_date ?? "");
        confEventTime = String(c.event_time ?? "9:00 صباحاً بتوقيت الخرطوم");
        confRegDeadline = toDeadlineInput(c.reg_deadline);
        savedConf = { band: bandEnabled, soon: confSoon, open: regOpen, deadline: confRegDeadline };
        confBaseline = confSignature;
      }
      const waitlist = await supabase
        .from("registration_notify")
        .select("id", { count: "exact", head: true });
      waitlistCount = waitlist.count ?? 0;
    } else {
      next[id] = await plain(id);
    }

    data = next;
    loadedTabs.add(id);
    loading = false;
    tabLoading = false;
  }

  onMount(() => {
    void loadTab(tab, true).then(() => {
      // Cheap badge counts for tabs that have not been opened yet.
      return Promise.all(
        dataTabs
          .filter((t) => !loadedTabs.has(t.id))
          .map(async (t) => {
            const r = await supabase!.from(t.id).select("id", { count: "exact", head: true });
            if (!r.error) {
              counts[t.id] = r.count ?? 0;
              counts = { ...counts };
            }
          }),
      );
    });
  });

  async function signOut() {
    await supabase?.auth.signOut();
    location.replace(url("admin/login"));
  }

  const registrations = $derived(data.conference_registrations ?? []);
  const present = $derived(registrations.filter((r) => r.attended_at).length);
  const filterOptions = $derived([
    { id: "all", label: "الكل", n: registrations.length },
    { id: "pending", label: "بانتظار القبول", n: registrations.filter((r) => r.status === "pending").length },
    { id: "approved", label: "مقبول", n: registrations.filter((r) => r.status === "approved" && !r.attended_at && !r.declined_at).length },
    { id: "attended", label: "حاضر", n: present },
    { id: "declined", label: "اعتذر", n: registrations.filter((r) => r.declined_at && !r.attended_at).length },
    { id: "rejected", label: "مرفوض", n: registrations.filter((r) => r.status === "rejected").length },
  ]);
  // Approved guests who have not been reminded yet — the reminder button count.
  const pendingReminders = $derived(
    registrations.filter(
      (r) =>
        r.status === "approved" &&
        !r.attended_at &&
        !r.declined_at &&
        !r.reminder_sent_at &&
        String(r.phone ?? "").trim().length > 0,
    ).length,
  );
  // Attendees who still owe a stage — the invite button counts.
  const assessmentRows = $derived(data.assessments ?? []);
  const preAnswered = $derived(
    new Set(assessmentRows.filter((r) => r.has_pre).map((r) => r.id)),
  );
  const postAnswered = $derived(
    new Set(assessmentRows.filter((r) => r.has_post).map((r) => r.id)),
  );
  const answeredPeople = $derived(new Set([...preAnswered, ...postAnswered]).size);
  const preTargets = $derived(
    registrations.filter(
      (r) => r.attended_at && !preAnswered.has(r.id) && String(r.phone ?? "").trim(),
    ).length,
  );
  const postTargets = $derived(
    registrations.filter(
      (r) =>
        r.attended_at &&
        preAnswered.has(r.id) &&
        !postAnswered.has(r.id) &&
        String(r.phone ?? "").trim(),
    ).length,
  );
  const matches = (r: Row, f: string) => {
    if (f === "attended") return !!r.attended_at;
    if (f === "declined") return !!r.declined_at && !r.attended_at;
    if (f === "approved") return r.status === "approved" && !r.attended_at && !r.declined_at;
    return r.status === f && !r.attended_at;
  };
  const rows = $derived(
    tab === "conference_registrations" && statusFilter !== "all"
      ? registrations.filter((r) => matches(r, statusFilter))
      : (data[tab] ?? []),
  );
  const cols = $derived(columns[tab] ?? []);
  // Name, email or phone; digits are compared separately so "966782749"
  // still finds "0966 782 749".
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (tab !== "conference_registrations" || !q) return rows;
    const digits = q.replace(/\D/g, "");
    const hit = (v: unknown) => String(v ?? "").toLowerCase().includes(q);
    const phoneHit = (v: unknown) =>
      digits.length >= 3 && String(v ?? "").replace(/\D/g, "").includes(digits);
    return rows.filter(
      (r) =>
        hit(r.name) ||
        hit(r.email) ||
        hit(r.phone) ||
        hit(r.ticket_code) ||
        phoneHit(r.phone),
    );
  });
  const count = (id: string) =>
    id === "templates"
      ? templates.length
      : id === "assessments"
          ? (loadedTabs.has("assessments") ? answeredPeople : "")
          : id === "program"
            ? program.length
            : id === "push"
              ? pushCount
              : id === "doors"
                ? doors.length
                : id === "settings"
                  ? ""
                  : (loadedTabs.has(id) ? data[id]?.length ?? "" : counts[id] ?? "");

</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape") drawer = false; }} />

<header class="admin-head">
  <div class="admin-head-title">
    <button
      class="admin-menu-btn"
      type="button"
      aria-expanded={drawer}
      aria-controls="admin-drawer"
      aria-label="الأقسام"
      onclick={() => (drawer = !drawer)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>
    </button>
    <div>
      <p class="kicker">لوحة التحكم</p>
      <h1>الطلبات والرسائل</h1>
    </div>
  </div>
  <div class="admin-user">
    <span dir="ltr">{userEmail}</span>
    <div class="admin-actions">
      <button
        class="btn btn--ghost btn--icon"
        type="button"
        data-act={notifyOn ? "ok" : undefined}
        title={notifyOn ? "الإشعارات مفعّلة" : "تفعيل إشعارات المتصفح"}
        aria-label={notifyOn ? "الإشعارات مفعّلة" : "تفعيل إشعارات المتصفح"}
        aria-pressed={notifyOn}
        onclick={askNotify}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></svg>
      </button>
      <button
        class="btn btn--ghost btn--icon"
        type="button"
        title="تحديث"
        aria-label="تحديث"
        disabled={tabLoading}
        onclick={() => {
          loadedTabs.delete(tab);
          void loadTab(tab);
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.7-6.4" /><path d="M21 3v6h-6" /></svg>
      </button>
      <button
        class="btn btn--ghost btn--icon"
        type="button"
        title="تنزيل CSV — كل السجلات"
        aria-label="تنزيل CSV"
        disabled={exporting}
        onclick={() => void exportCsv()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 19h16" /></svg>
      </button>
      <a
        class="btn btn--ghost"
        href={url("admin/attendance")}
        title="شاشة الحضور"
      >
        الحضور
      </a>
      <button
        class="btn btn--ghost btn--icon"
        type="button"
        title="خروج"
        aria-label="خروج"
        onclick={signOut}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
      </button>
    </div>
  </div>
</header>

{#if actionError}
  <p class="form-status" data-state="error">{actionError}</p>
{/if}

{#if toasts.length}
  <div class="toasts" aria-live="polite">
    {#each toasts as t (t.id)}
      <div class="toast" data-state={t.ok ? "ok" : "error"}>
        <span>{t.text}</span>
        <button type="button" aria-label="إغلاق" onclick={() => dismissToast(t.id)}>✕</button>
      </div>
    {/each}
  </div>
{/if}

{#if loading}
  <div
    class="admin-loading"
    data-shape={tab === "templates" ? "templates" : "table"}
    aria-busy="true"
    aria-label="جارٍ التحميل"
  >
    {#if tab === "templates"}
      {#each [0, 1, 2, 3] as i (i)}<span></span>{/each}
    {:else}
      {#each [0, 1, 2, 3, 4, 5] as i (i)}<span></span>{/each}
    {/if}
  </div>
{:else if failed}
  <p class="form-status" data-state="error">
    تعذّر تحميل البيانات. تحقق من صلاحيات الحساب.
  </p>
{:else}
  <div class="admin-layout">
    <aside class="admin-side" id="admin-drawer" class:open={drawer}>
      {#each groups as g, i (g.label)}
        <div class="side-group">
          <span class="side-group-label" id={`tabgroup-${i}`}>{g.label}</span>
          <div class="side-tabs" role="tablist" aria-labelledby={`tabgroup-${i}`}>
            {#each g.tabs as t (t.id)}
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                class:active={tab === t.id}
                onclick={() => {
                  tab = t.id;
                  drawer = false;
                  if (t.id === "push") void refreshSubscribers();
                  else void loadTab(t.id);
                }}
              >
                {t.label} <span class="tab-count">{count(t.id)}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </aside>
    <div class="admin-main">

  {#if tabLoading}
    <div class="admin-loading" data-shape="table" aria-busy="true" aria-label="جارٍ التحميل">
      {#each [0, 1, 2, 3, 4, 5] as i (i)}<span></span>{/each}
    </div>
  {:else}
  {#if tab === "program"}
    <div class="templates">
      <div class="program-add">
        <label>
          <span>العنوان</span>
          <input type="text" maxlength="120" bind:value={draft.title} placeholder="مثال: جلسة علمية" />
        </label>
        <label>
          <span>الوقت</span>
          <input type="datetime-local" bind:value={draft.starts_at} />
        </label>
        <label>
          <span>ملاحظة (اختياري)</span>
          <input type="text" maxlength="160" bind:value={draft.notes} />
        </label>
      </div>
      <div class="templates-foot">
        <button class="btn" type="button" onclick={saveProgram} disabled={programBusy}>
          إضافة الفقرة
        </button>
        <p class="admin-note">
          {programNote || "يظهر البرنامج في صفحة كل ضيف، والتغيير فوري بلا إعادة بناء."}
        </p>
      </div>
    </div>
    <ul class="program-list">
      {#each program as p (p.id)}
        <li>
          <span class="when">{timeFmt.format(new Date(p.starts_at))}</span>
          <span class="what">
            {p.title}
            {#if p.notes}<small>{p.notes}</small>{/if}
          </span>
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            onclick={() => removeProgram(p.id)}
            disabled={programBusy}
          >
            حذف
          </button>
        </li>
      {/each}
    </ul>
  {:else if tab === "templates"}
    <div class="templates">
      {#each templates as t (t.key)}
        <label>
          <span>{t.label}</span>
          <textarea rows="5" spellcheck="false" bind:value={t.body}></textarea>
        </label>
      {/each}
      <div class="templates-foot">
        <button class="btn" type="button" onclick={saveTemplates} disabled={saving}>
          حفظ القوالب
        </button>
        <p class="admin-note">
          {saveNote ||
            "المتغيّرات المتاحة: {{name}} و {{ticket_code}} — تُستبدل تلقائياً عند الإرسال."}
        </p>
      </div>
    </div>
  {:else if tab === "push"}
    <div class="templates">
      <label>
        <span>نص الإشعار</span>
        <textarea
          rows="4"
          bind:value={pushText}
          placeholder="مثال: تذكير — الجلسة الأولى تبدأ الآن في القاعة الرئيسية."
        ></textarea>
      </label>
      <div class="templates-foot">
        <button
          class="btn"
          type="button"
          onclick={sendPush}
          disabled={pushing || pushCount === 0 || !pushText.trim()}
        >
          {pushing ? "جارٍ الإرسال…" : `إرسال إلى ${pushCount}`}
        </button>
        <p class="admin-note">
          {pushNote || "يصل إلى كل من فعّل الإشعارات في متصفحه — حتى لو كان الموقع مغلقاً."}
        </p>
      </div>
      {#if pushFeed.length}
        <ul class="push-feed">
          {#each pushFeed as item, i (i)}
            <li class="form-status" data-state={item.ok ? "ok" : "error"}>{item.text}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else if tab === "settings"}
    <div class="conf">
      <div class="conf-now" aria-live="polite">
        <span class="conf-now-label">على الموقع الآن</span>
        <div class="conf-now-values">
          <span>{savedConf.soon ? "قريباً" : "مجدول"}</span>
          <span>التسجيل {savedConf.open ? "مفتوح" : "مغلق"}</span>
          {#if savedConf.band}<span>الشريط ظاهر</span>{:else}<span>الشريط مخفي</span>{/if}
          {#if savedConf.deadline}
            <span>
              آخر موعد {deadlineFmt.format(new Date(toDeadlineInstant(savedConf.deadline)!))}
            </span>
          {/if}
        </div>
      </div>

      <section class="conf-group">
        <h2>الحالة</h2>
        <button
          class="conf-switch"
          type="button"
          role="switch"
          aria-checked={bandEnabled}
          disabled={savingConfig}
          onclick={() => { bandEnabled = !bandEnabled; }}
        >
          <span class="conf-switch-text">
            <strong>شريط المؤتمر</strong>
            <small>يظهر أعلى الصفحة الرئيسية</small>
          </span>
          <span class="conf-toggle" aria-hidden="true"></span>
        </button>
        <button
          class="conf-switch"
          type="button"
          role="switch"
          aria-checked={confSoon}
          disabled={savingConfig}
          onclick={() => { confSoon = !confSoon; }}
        >
          <span class="conf-switch-text">
            <strong>حالة المؤتمر</strong>
            <small>صفحة «قريباً» بدل الصفحة الكاملة</small>
          </span>
          <span class="conf-toggle" aria-hidden="true"></span>
        </button>
        <button
          class="conf-switch"
          type="button"
          role="switch"
          aria-checked={regOpen}
          disabled={savingConfig}
          onclick={() => { regOpen = !regOpen; }}
        >
          <span class="conf-switch-text">
            <strong>التسجيل</strong>
            <small>يفتح نموذج التسجيل للزوار</small>
          </span>
          <span class="conf-toggle" aria-hidden="true"></span>
        </button>
      </section>

      <section class="conf-group">
        <h2>التوقيت</h2>
        <div class="conf-fields conf-fields--two">
          <label>
            <span>تاريخ المؤتمر</span>
            <input type="date" bind:value={confEventDate} />
          </label>
          <label>
            <span>وقت المؤتمر</span>
            <input type="text" bind:value={confEventTime} dir="rtl" />
          </label>
        </div>
        <div class="conf-fields conf-fields--deadline">
          <label>
            <span>آخر موعد للتسجيل</span>
            <input type="datetime-local" bind:value={confRegDeadline} />
            <small>بتوقيت الخرطوم.</small>
          </label>
        </div>
      </section>

      <div class="conf-foot">
        <button class="btn" type="button" onclick={saveConferenceConfig} disabled={savingConfig}>
          {savingConfig ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
        </button>
        <button
          class="btn btn--ghost"
          type="button"
          onclick={() => void openWaitlist()}
          disabled={waitlistCount === 0}
        >
          أبلغ المهتمين ({waitlistCount})
        </button>
        {#if configNote}
          <p class="form-status">{configNote}</p>
        {:else if confDirty}
          <p class="conf-dirty">لديك تغييرات غير محفوظة.</p>
        {/if}
      </div>
    </div>
  {:else if tab === "doors"}
    <div class="templates">
      <div class="program-add">
        <label>
          <span>اسم البوابة</span>
          <input type="text" maxlength="80" bind:value={doorDraft} placeholder="مثال: بوابة القاعة الشرقية" />
        </label>
      </div>
      <div class="templates-foot">
        <button class="btn" type="button" onclick={() => void addDoor()} disabled={doorBusy}>
          {doorBusy ? "جارٍ الإنشاء…" : "إنشاء بوابة"}
        </button>
        <p class="admin-note">
          {doorNote ||
            "كل بوابة تملك رمزاً وملصق QR يُمسح من صفحة الحضور — الرمز يثبت المكان فقط، والهوية من تذكرة الضيف."}
        </p>
      </div>
    </div>
    <ul class="program-list doors-list">
      {#each doors as d (d.id)}
        <li>
          <span class="when">
            <strong dir="ltr">{d.code}</strong>
            <small class="hide-xs" dir="ltr">{doorUrl(d)}</small>
          </span>
          <span class="what">
            {d.label}
            <small>{dateFmt.format(new Date(d.created_at))}</small>
          </span>
          <button class="btn btn--sm" type="button" onclick={() => (poster = d)}>الملصق</button>
          <button class="btn btn--ghost btn--sm" type="button" onclick={() => void removeDoor(d.id)} disabled={doorBusy}>
            حذف
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    {#if tab === "registration_notify"}
      <div class="templates">
        <div class="program-add waitlist-add" class:waitlist-add--edit={waitEditId}>
          <label>
            <span>الاسم</span>
            <input type="text" maxlength="200" bind:value={waitDraft.name} autocomplete="off" />
          </label>
          <label>
            <span>البريد الإلكتروني</span>
            <input
              type="email"
              maxlength="320"
              bind:value={waitDraft.email}
              dir="ltr"
              autocomplete="off"
            />
          </label>
          {#if waitEditId}
            <button
              class="btn btn--icon"
              type="button"
              title="حفظ التعديل"
              aria-label="حفظ التعديل"
              onclick={() => void saveWait(waitDraft, waitEditId)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </button>
            <button
              class="btn btn--ghost btn--icon"
              type="button"
              title="إلغاء"
              aria-label="إلغاء"
              onclick={() => {
                waitEditId = 0;
                waitDraft = { name: "", email: "" };
                waitNote = "";
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          {:else}
            <button
              class="btn btn--icon"
              type="button"
              title="إضافة مهتم"
              aria-label="إضافة مهتم"
              onclick={() => void saveWait(waitDraft)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
            </button>
          {/if}
        </div>
        <p class="admin-note">
          {waitNote || "من يضيف نفسه للقائمة يصله إشعار فور فتح باب التسجيل."}
        </p>
      </div>
    {/if}
    {#if tab === "conference_registrations"}
      <div class="admin-toolbar">
        <input
          class="admin-search"
          type="search"
          bind:value={query}
          placeholder="ابحث بالاسم أو الهاتف أو البريد أو رمز التذكرة"
          aria-label="ابحث بالاسم أو الهاتف أو البريد أو رمز التذكرة"
        />
        <div class="filters">
          {#each filterOptions as f (f.id)}
            <button
              type="button"
              aria-pressed={statusFilter === f.id}
              onclick={() => (statusFilter = f.id)}
            >
              {f.label} <span class="tab-count">{f.n}</span>
            </button>
          {/each}
        </div>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          disabled={reminding || pendingReminders === 0}
          onclick={remind}
        >
          {reminding ? "جارٍ الإرسال..." : `تذكير غير الحاضرين (${pendingReminders})`}
        </button>
      </div>
      {#if notice}
        <p class="form-status">{notice}</p>
      {/if}
    {/if}

    {#if tab === "assessments"}
      <div class="admin-toolbar">
        <div class="filters">
          <button
            type="button"
            aria-pressed={preOpen}
            disabled={!!sendingStage}
            onclick={() => toggleWindow("pre", !preOpen)}
          >
            الأولى: {preOpen ? "مفتوح" : "مغلق"}
          </button>
          <button
            type="button"
            aria-pressed={postOpen}
            disabled={!!sendingStage}
            onclick={() => toggleWindow("post", !postOpen)}
          >
            النهائية: {postOpen ? "مفتوح" : "مغلق"}
          </button>
        </div>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          disabled={!!sendingStage || preTargets === 0}
          onclick={() => sendInvite("pre")}
        >
          إرسال رابط الأولى ({preTargets})
        </button>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          disabled={!!sendingStage || postTargets === 0}
          onclick={() => sendInvite("post")}
        >
          إرسال رابط النهائية ({postTargets})
        </button>
      </div>
      {#if notice}
        <p class="form-status">{notice}</p>
      {/if}
    {/if}

    {#key tab + ":" + statusFilter}
      <div class="table-wrap">
        {#if shown.length === 0}
          <p class="admin-empty-cell">
            {query.trim() ? "لا نتائج مطابقة." : "لا توجد سجلات بعد."}
          </p>
        {:else}
          <table class="admin-table">
          <thead>
            <tr>
              {#each cols as c (c.key)}
                <th data-col={c.key} class={c.cls ?? ""}>{c.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each shown as row (row.id)}
                <tr data-flash={flashId === row.id ? "1" : undefined}>
                {#each cols as c (c.key)}
                  <td data-col={c.key} class={c.cls ?? ""}>
                    {#if c.key === "created_at"}
                      {dateFmt.format(new Date(row.created_at))}
                    {:else if c.key === "status"}
                      {#if row.attended_at}
                        <span class="badge" data-status="attended">حاضر</span>
                      {:else if row.declined_at}
                        <span class="badge" data-status="declined">اعتذر</span>
                      {:else}
                        <span class="badge" data-status={row.status}>
                          {statusLabels[row.status] ?? row.status}
                        </span>
                      {/if}
                    {:else if c.key === "ticket_code"}
                      {#if row.ticket_code}
                        <button
                          class="code-copy"
                          type="button"
                          dir="ltr"
                          title="نسخ رمز التذكرة"
                          aria-label={`نسخ رمز التذكرة ${row.ticket_code}`}
                          data-copied={copiedCode === row.ticket_code ? "1" : undefined}
                          onclick={() => copyCode(String(row.ticket_code))}
                        >
                          {row.ticket_code}
                        </button>
                      {:else}
                        —
                      {/if}
                    {:else if c.key === "actions"}
                      <div class="row-actions">
                        {#if tab === "assessments"}
                          <button
                            class="btn btn--ghost btn--icon"
                            type="button"
                            data-act="danger"
                            title="حذف الإجابات"
                            aria-label="حذف الإجابات"
                            disabled={busyId === row.id}
                            onclick={() => wipeAssessment(row.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></svg>
                          </button>
                        {:else if row.status === "pending"}
                          <button
                            class="btn btn--icon"
                            type="button"
                            title="قبول"
                            aria-label="قبول"
                            disabled={busyId === row.id}
                            onclick={() => decide(row.id, "approved")}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                          </button>
                          <button
                            class="btn btn--ghost btn--icon"
                            type="button"
                            data-act="danger"
                            title="رفض"
                            aria-label="رفض"
                            disabled={busyId === row.id}
                            onclick={() => decide(row.id, "rejected")}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        {:else if row.status === "approved"}
                          {#if row.declined_at}
                            <button
                              class="btn btn--icon"
                              type="button"
                              title="إلغاء الاعتذار"
                              aria-label="إلغاء الاعتذار"
                              disabled={busyId === row.id}
                              onclick={() => clearDecline(row.id)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                            </button>
                          {:else if !row.attended_at}
                            <button
                              class="btn btn--ghost btn--icon"
                              type="button"
                              title="إعادة إرسال التذكرة"
                              aria-label="إعادة إرسال التذكرة"
                              disabled={busyId === row.id}
                              onclick={() => resend(row.id)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></svg>
                            </button>
                          {/if}
                          {#if !row.attended_at && !row.declined_at}
                            <button
                              class="btn btn--ghost btn--icon"
                              type="button"
                              data-act="danger"
                              title="إلغاء القبول"
                              aria-label="إلغاء القبول"
                              disabled={busyId === row.id}
                              onclick={() => revoke(row.id)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
                            </button>
                          {/if}
                        {:else if row.status === "rejected"}
                          <button
                            class="btn btn--ghost btn--icon"
                            type="button"
                            data-act="ok"
                            title="إعادة إلى الانتظار"
                            aria-label="إعادة إلى الانتظار"
                            disabled={busyId === row.id}
                            onclick={() => decide(row.id, "pending")}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                          </button>
                        {/if}
                        {#if row.attended_at && tab !== "assessments"}
                          <button
                            class="btn btn--ghost btn--icon"
                            type="button"
                            title="إلغاء الحضور"
                            aria-label="إلغاء الحضور"
                            disabled={busyId === row.id}
                            onclick={() => clearAttendance(row.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
                          </button>
                        {/if}
                        {#if tab === "registration_notify"}
                          <button
                            class="btn btn--ghost btn--icon"
                            type="button"
                            title="تعديل"
                            aria-label="تعديل"
                            disabled={busyId === row.id}
                            onclick={() => {
                              waitEditId = waitEditId === row.id ? 0 : Number(row.id);
                              waitDraft = {
                                name: String(row.name ?? ""),
                                email: String(row.email ?? ""),
                              };
                              waitNote = "";
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
                          </button>
                        {/if}
                        {#if tab !== "assessments"}
                          <button
                            class="btn btn--ghost btn--icon"
                            type="button"
                            data-act="danger"
                            title="حذف"
                            aria-label="حذف"
                            disabled={busyId === row.id}
                            onclick={() => remove(row.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></svg>
                          </button>
                        {/if}
                      </div>
                    {:else}
                      {row[c.key] || "—"}
                    {/if}
                  </td>
                {/each}
              </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {/key}
  {/if}
  {/if}
    </div>
  </div>

  {#if drawer}
    <button class="admin-backdrop" type="button" aria-label="إغلاق القائمة" onclick={() => (drawer = false)}></button>
  {/if}

  {#if poster}
    <!-- Door poster: wide QR for print/photograph, door ID under it. -->    <div class="poster" role="dialog" aria-modal="true" aria-label={`ملصق ${poster.label}`}>
      <button class="poster-x" type="button" onclick={() => (poster = null)} aria-label="إغلاق">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
      </button>
      <div class="poster-card">
        <img src={qrUrl(poster)} alt={`رمز QR للبوابة ${poster.code}`} width="420" height="420" />
        <p class="poster-code" dir="ltr">{poster.code}</p>
        <p class="poster-label">{poster.label}</p>
        <p class="poster-note">امسح هذا الرمز عند البوابة — أو اطبع الملصق.</p>
      </div>
    </div>
  {/if}
{/if}
