<script lang="ts">
  import { onMount, tick } from "svelte";
  import { supabase } from "../lib/supabase";

  type Row = Record<string, string | number>;
  type Template = { key: string; label: string; body: string };

  const tabs = [
    { id: "conference_registrations", label: "التسجيلات" },
    { id: "scan", label: "الحضور" },
    { id: "contact_messages", label: "الرسائل" },
    { id: "donation_interests", label: "الدعم" },
    { id: "templates", label: "قوالب واتساب" },
  ];

  const dataTabs = tabs.filter((t) => t.id !== "templates" && t.id !== "scan");

  const columns: Record<string, { key: string; label: string; cls?: string }[]> = {
    conference_registrations: [
      { key: "created_at", label: "التاريخ", cls: "nw" },
      { key: "name", label: "الاسم", cls: "nw" },
      { key: "status", label: "الحالة", cls: "nw" },
      { key: "ticket_code", label: "رمز التذكرة", cls: "nw" },
      { key: "email", label: "البريد", cls: "ltr wrap" },
      { key: "phone", label: "الهاتف", cls: "nw" },
      { key: "role", label: "الصفة", cls: "nw" },
      { key: "organization", label: "الجهة", cls: "wrap" },
      { key: "actions", label: "إجراء", cls: "nw" },
    ],
    contact_messages: [
      { key: "created_at", label: "التاريخ", cls: "nw" },
      { key: "name", label: "الاسم", cls: "nw" },
      { key: "email", label: "البريد", cls: "ltr wrap" },
      { key: "message", label: "الرسالة", cls: "wrap" },
    ],
    donation_interests: [
      { key: "created_at", label: "التاريخ", cls: "nw" },
      { key: "name", label: "الاسم", cls: "nw" },
      { key: "email", label: "البريد", cls: "ltr wrap" },
      { key: "support_type", label: "نوع الدعم", cls: "nw" },
      { key: "note", label: "ملاحظات", cls: "wrap" },
    ],
  };

  let loading = $state(true);
  let tab = $state(tabs[0].id);
  let data = $state<Record<string, Row[]>>({});
  let failed = $state(false);
  let userEmail = $state("");
  let statusFilter = $state("all");

  let templates = $state<Template[]>([]);
  let saving = $state(false);
  let saveNote = $state("");

  const dateFmt = new Intl.DateTimeFormat("ar-SD", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const statusLabels: Record<string, string> = {
    pending: "بانتظار القبول",
    approved: "مقبول",
    rejected: "مرفوض",
  };

  let busyId = $state(0);
  let actionError = $state("");

  // Admin-only: RLS lets only allowlisted emails update; the DB trigger sends the
  // approval message with the ticket QR (or the rejection message).
  async function decide(id: number, status: "approved" | "rejected") {
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
  }

  // Re-sends the ticket QR for an approved registration (via the resend_ticket RPC).
  async function resend(id: number) {
    if (!supabase || busyId) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase.rpc("resend_ticket", { p_id: id });
    busyId = 0;
    if (error) actionError = "تعذّر إرسال التذكرة. حاول مرة أخرى.";
  }

  async function remove(id: number) {
    if (!supabase || busyId || !confirm("حذف هذا التسجيل نهائياً؟")) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("conference_registrations")
      .delete()
      .eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر الحذف. حاول مرة أخرى.";
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).filter(
      (r) => r.id !== id,
    );
    data = { ...data };
  }

  async function saveTemplates() {
    if (!supabase || saving) return;
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

  let video = $state<HTMLVideoElement | null>(null);
  let scanning = $state(false);
  let manualCode = $state("");
  let scanResult = $state<{ ok: boolean; title: string; note: string } | null>(null);
  let stream: MediaStream | null = null;
  let loop = 0;

  const parseCode = (raw: string) =>
    (raw.match(/SX-[A-Z0-9]+/i)?.[0] ?? raw).trim().toUpperCase();

  // Camera is a convenience: browsers without BarcodeDetector (iOS Safari) fall
  // back to typing the ticket code, which hits the same check-in path.
  async function startScan() {
    scanResult = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      scanResult = { ok: false, title: "الكاميرا غير متاحة", note: "أدخل رمز التذكرة يدويًا." };
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    } catch {
      scanResult = {
        ok: false,
        title: "تعذّر فتح الكاميرا",
        note: "اسمح بالوصول إلى الكاميرا أو أدخل الرمز يدويًا.",
      };
      return;
    }
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) {
      stopScan();
      scanResult = {
        ok: false,
        title: "المتصفح لا يدعم المسح بالكاميرا",
        note: "أدخل رمز التذكرة يدويًا أدناه.",
      };
      return;
    }
    scanning = true;
    await tick();
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
    const detector = new Detector({ formats: ["qr_code"] });
    const tick = async () => {
      if (!scanning || !video) return;
      try {
        const codes = await detector.detect(video);
        const raw = codes?.[0]?.rawValue;
        if (raw) {
          await checkIn(raw);
          return;
        }
      } catch {
        // frames before the video is ready throw; keep polling
      }
      loop = requestAnimationFrame(() => void tick());
    };
    void tick();
  }

  function stopScan() {
    scanning = false;
    cancelAnimationFrame(loop);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function checkIn(raw: string) {
    const code = parseCode(raw);
    if (!code || !supabase) return;
    const row = registrations.find(
      (r) => String(r.ticket_code ?? "").toUpperCase() === code,
    );
    if (!row) {
      scanResult = { ok: false, title: "رمز غير معروف", note: code };
      return;
    }
    if (row.attended_at) {
      scanResult = {
        ok: true,
        title: `سبق تسجيل ${row.name}`,
        note: "الحضور: " + dateFmt.format(new Date(row.attended_at)),
      };
      return;
    }
    if (row.status !== "approved") {
      scanResult = { ok: false, title: `${row.name} — لم يُقبل بعد`, note: code };
      return;
    }
    const at = new Date().toISOString();
    const { error } = await supabase
      .from("conference_registrations")
      .update({ attended_at: at })
      .eq("id", row.id);
    if (error) {
      scanResult = { ok: false, title: "تعذّر تسجيل الحضور", note: "حاول مرة أخرى." };
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).map((r) =>
      r.id === row.id ? { ...r, attended_at: at } : r,
    );
    data = { ...data };
    manualCode = "";
    stopScan();
    scanResult = { ok: true, title: `${row.name} — حاضر`, note: code };
  }

  async function load() {
    if (!supabase) return;
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      location.replace("/admin/login");
      return;
    }
    userEmail = session.session.user.email ?? "";
    loading = true;
    actionError = "";
    saveNote = "";

    const results = await Promise.all([
      ...dataTabs.map((t) =>
        supabase
          .from(t.id)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ),
      supabase.from("message_templates").select("key,label,body").order("key"),
    ]);

    const next: Record<string, Row[]> = {};
    results.slice(0, dataTabs.length).forEach((r, i) => {
      if (r.error) failed = true;
      next[dataTabs[i].id] = r.data ?? [];
    });
    const order = [
      "registration_received",
      "registration_approved",
      "registration_rejected",
    ];
    templates = ((results[results.length - 1].data ?? []) as Template[]).sort(
      (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
    );
    data = next;
    loading = false;
  }

  onMount(load);

  async function signOut() {
    await supabase?.auth.signOut();
    location.replace("/admin/login");
  }

  const registrations = $derived(data.conference_registrations ?? []);
  const present = $derived(registrations.filter((r) => r.attended_at).length);
  const filterOptions = $derived([
    { id: "all", label: "الكل", n: registrations.length },
    { id: "pending", label: "بانتظار القبول", n: registrations.filter((r) => r.status === "pending").length },
    { id: "approved", label: "مقبول", n: registrations.filter((r) => r.status === "approved" && !r.attended_at).length },
    { id: "attended", label: "حاضر", n: present },
    { id: "rejected", label: "مرفوض", n: registrations.filter((r) => r.status === "rejected").length },
  ]);
  const matches = (r: Row, f: string) =>
    f === "attended" ? !!r.attended_at : r.status === f && !r.attended_at;
  const rows = $derived(
    tab === "conference_registrations" && statusFilter !== "all"
      ? registrations.filter((r) => matches(r, statusFilter))
      : (data[tab] ?? []),
  );
  const cols = $derived(columns[tab] ?? []);
  const count = (id: string) =>
    id === "templates"
      ? templates.length
      : id === "scan"
        ? present
        : (data[id]?.length ?? 0);

  // Release the camera when leaving the attendance tab.
  $effect(() => {
    if (tab !== "scan") stopScan();
  });
</script>

<header class="admin-head">
  <div>
    <p class="kicker">لوحة التحكم</p>
    <h1>الطلبات والرسائل</h1>
  </div>
  <div class="admin-user">
    <span dir="ltr">{userEmail}</span>
    <div class="admin-actions">
      <button
        class="btn btn--ghost btn--icon"
        type="button"
        title="تحديث"
        aria-label="تحديث"
        onclick={load}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.7-6.4" /><path d="M21 3v6h-6" /></svg>
      </button>
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

{#if loading}
  <div class="admin-loading" aria-busy="true" aria-label="جارٍ التحميل">
    <span></span><span></span><span></span><span></span>
  </div>
{:else if failed}
  <p class="form-status" data-state="error">
    تعذّر تحميل البيانات. تحقق من صلاحيات الحساب.
  </p>
{:else}
  <div class="tabs" role="tablist">
    {#each tabs as t (t.id)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === t.id}
        class:active={tab === t.id}
        onclick={() => (tab = t.id)}
      >
        {t.label} <span class="tab-count">{count(t.id)}</span>
      </button>
    {/each}
  </div>

  {#if tab === "scan"}
    <div class="scan">
      {#if scanning}`r`n        <video bind:this={video} playsinline muted></video>`r`n      {/if}
      <div class="scan-actions">
        {#if scanning}
          <button class="btn btn--ghost" type="button" onclick={stopScan}>
            إيقاف الكاميرا
          </button>
        {:else}
          <button class="btn" type="button" onclick={startScan}>افتح الكاميرا</button>
        {/if}
      </div>
      <div class="scan-manual">
        <label>
          <span>أو أدخل رمز التذكرة</span>
          <input
            dir="ltr"
            spellcheck="false"
            placeholder="SX-XXXXXX"
            bind:value={manualCode}
            onkeydown={(e) => e.key === "Enter" && checkIn(manualCode)}
          />
        </label>
        <button class="btn" type="button" onclick={() => checkIn(manualCode)}>
          تأكيد
        </button>
      </div>
      {#if scanResult}
        <p class="scan-result" data-ok={scanResult.ok} role="status">
          <strong>{scanResult.title}</strong>
          <span>{scanResult.note}</span>
        </p>
      {/if}
    </div>
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
  {:else}
    {#if tab === "conference_registrations"}
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
    {/if}

    {#if rows.length === 0}
      <p class="admin-empty">لا توجد سجلات بعد.</p>
    {:else}
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              {#each cols as c (c.key)}
                <th>{c.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.id)}
              <tr>
                {#each cols as c (c.key)}
                  <td class={c.cls ?? ""}>
                    {#if c.key === "created_at"}
                      {dateFmt.format(new Date(row.created_at))}
                    {:else if c.key === "status"}
                      {#if row.attended_at}
                        <span class="badge" data-status="attended">حاضر</span>
                      {:else}
                        <span class="badge" data-status={row.status}>
                          {statusLabels[row.status] ?? row.status}
                        </span>
                      {/if}
                    {:else if c.key === "actions"}
                      <div class="row-actions">
                        {#if row.status === "pending"}
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
                            title="رفض"
                            aria-label="رفض"
                            disabled={busyId === row.id}
                            onclick={() => decide(row.id, "rejected")}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        {:else if row.status === "approved"}
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
                        <button
                          class="btn btn--ghost btn--icon"
                          type="button"
                          title="حذف"
                          aria-label="حذف"
                          disabled={busyId === row.id}
                          onclick={() => remove(row.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></svg>
                        </button>
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
      </div>
    {/if}
  {/if}
{/if}
