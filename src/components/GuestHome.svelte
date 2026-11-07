<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "../lib/supabase";
  import { url } from "../lib/url";

  type Guest = {
    name: string;
    ticket_code: string;
    status: string;
    attended_at: string | null;
    assessment_token: string;
    assessment_pre_open: boolean;
    assessment_post_open: boolean;
    pre_done: boolean;
    post_done: boolean;
  };

  const STATUS = {
    pending: "قيد المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
  };

  type Session = { title: string; starts_at: string; notes: string | null };

  let token = $state("");
  let guest = $state<Guest | null>(null);
  let program = $state<Session[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let copied = $state(false);

  const timeFmt = new Intl.DateTimeFormat("ar-SD", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Khartoum",
  });

  onMount(async () => {
    await loadGuest();

    const onFocus = async () => {
      if (!loading && guest) {
        await loadGuest();
      }
    };
    const onVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        await loadGuest();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  async function loadGuest() {
    let saved = "";
    try {
      saved = localStorage.getItem("sep-guest") ?? "";
    } catch {
      // Private mode: the link still works for this visit.
    }
    const fromLink = new URLSearchParams(location.search).get("s") ?? "";
    token = fromLink || saved;

    if (fromLink) {
      try {
        localStorage.setItem("sep-guest", fromLink);
      } catch {
        // Nothing to remember; the page still opens.
      }
      history.replaceState(null, "", location.pathname);
    }

    if (!token || !supabase) {
      loading = false;
      return;
    }
    const { data, error } = await supabase.rpc("guest_me", { p_token: token });
    if (error || !Array.isArray(data) || data.length === 0) {
      loading = false;
      failed = true;
      return;
    }
    guest = data[0] as Guest;

    // Public read; the schedule lives in the database so it updates without a
    // rebuild. A failure here must not block the ticket.
    const { data: prog } = await supabase
      .from("conference_program")
      .select("title,starts_at,notes")
      .order("starts_at");
    program = (prog ?? []) as Session[];
    loading = false;
  }

  async function copyTicketCode() {
    if (!guest) return;
    try {
      await navigator.clipboard.writeText(guest.ticket_code);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = guest.ticket_code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }

  const doorUrl = $derived(
    guest ? `${url("checkin")}/?k=${encodeURIComponent(token)}&t=${encodeURIComponent(guest.ticket_code)}` : ""
  );

  const assessmentHref = (stage: "pre" | "post") =>
    `${url("assessment")}/?t=${encodeURIComponent(guest?.assessment_token ?? "")}&s=${stage}`;

  // Certificate status is derived, not stored: attendance plus both assessments
  // is the promise made on the site. No PDF yet — the strip states readiness.
  const cert = $derived.by(() => {
    if (!guest) return { state: "wait", label: "", text: "" };
    if (!guest.attended_at)
      return {
        state: "wait",
        label: "بانتظار الحضور",
        text: "تُنشأ بعد تسجيل حضورك عند البوابة.",
      };
    if (!guest.pre_done || !guest.post_done)
      return {
        state: "wait",
        label: "لم تكتمل",
        text:
          "أكمل " +
          (!guest.pre_done && !guest.post_done
            ? "الاستبانتين"
            : !guest.pre_done
              ? "الاستبانة الأولى"
              : "الاستبانة النهائية") +
          " لتصبح جاهزة.",
      };
    return {
      state: "ok",
      label: "جاهزة",
      text: "استوفيت الحضور والاستبانتين — تُسلَّم بعد المؤتمر.",
    };
  });
</script>

{#if loading}
  <p class="note">جارٍ التحميل…</p>
{:else if guest}
  <div class="guest-shell" aria-labelledby="guest-title">
    <article class="pass">
      <p class="pass-band">مؤتمر كسلا للإنتان</p>
      <div class="pass-body">
        <div>
          <h1 id="guest-title">{guest.name}</h1>
          <div class="chips">
            <span class="chip" data-state={guest.status === "approved" ? "ok" : "wait"}>
              {STATUS[guest.status] ?? guest.status}
            </span>
            {#if guest.attended_at}
              <span class="chip" data-state="ok">حاضر</span>
            {/if}
          </div>
        </div>

        <div class="pass-ticket">
          <div class="ticket-id">
            <span class="pass-label">رقم التذكرة</span>
            <p class="ticket" dir="ltr">{guest.ticket_code}</p>
          </div>
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            onclick={copyTicketCode}
            aria-label={copied ? "Already copied" : "Copy ticket code"}
          >
            {copied ? "نُسخ" : "نسخ"}
          </button>
          {#if guest.status === "approved"}
            <a class="btn btn--sm" href={doorUrl}>صفحة البوابة</a>
          {/if}
        </div>
      </div>
    </article>

    <div class="cols">
      <section class="card" aria-labelledby="program-title">
        <h2 id="program-title">برنامج اليوم</h2>
        {#if program.length}
          <ol class="program">
            {#each program as s (s.starts_at + s.title)}
              <li>
                <time datetime={s.starts_at}>{timeFmt.format(new Date(s.starts_at))}</time>
                <span class="what">
                  {s.title}
                  {#if s.notes}<small>{s.notes}</small>{/if}
                </span>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="note">لم يُدرج البرنامج بعد.</p>
        {/if}
      </section>

      <section class="card" aria-labelledby="assess-title">
        <h2 id="assess-title">الاستبيانات</h2>
        {#if !guest.attended_at}
          <p class="note">تظهر بعد تسجيل حضورك عند البوابة.</p>
        {:else}
          <ul class="assess">
            <li>
              <span>الاستبانة الأولى</span>
              {#if guest.pre_done}
                <span class="chip" data-state="ok">تمت</span>
              {:else if guest.assessment_pre_open}
                <a class="btn btn--sm" href={assessmentHref("pre")}>ابدأ</a>
              {:else}
                <span class="chip" data-state="wait">مغلقة الآن</span>
              {/if}
            </li>
            <li>
              <span>الاستبانة النهائية</span>
              {#if guest.post_done}
                <span class="chip" data-state="ok">تمت</span>
              {:else if guest.assessment_post_open && guest.pre_done}
                <a class="btn btn--sm" href={assessmentHref("post")}>ابدأ</a>
              {:else if guest.assessment_post_open}
                <span class="chip" data-state="wait">بعد إتمام الأولى</span>
              {:else}
                <span class="chip" data-state="wait">لم تُفتح بعد</span>
              {/if}
            </li>
          </ul>
        {/if}
      </section>
    </div>

    <section class="cert" aria-labelledby="cert-title">
      <h2 id="cert-title">الشهادة</h2>
      <p class="cert-line">
        <span class="dot" data-state={cert.state} aria-hidden="true"></span>
        <span><strong>{cert.label}</strong> — {cert.text}</span>
      </p>
    </section>
  </div>
{:else}
  <div class="empty">
    <h1>الدخول عبر رسالة القبول</h1>
    <p class="note">
      افتح زر «افتح لوحتك» في رسالة القبول التي وصلتك على واتساب. تُحفظ اللوحة على هذا
      الجهاز، فلا تحتاج للرابط مرة أخرى.
    </p>
    {#if failed}
      <p class="note" role="alert">لم يُعرَف الرابط. افتح الزر من الرسالة الأصلية.</p>
    {/if}
  </div>
{/if}

<style>
  .guest-shell {
    display: grid;
    gap: 1.5rem;
  }

  .empty {
    display: grid;
    gap: 0.75rem;
    max-inline-size: 34rem;
  }

  h1 {
    font-size: clamp(1.6rem, 6vw, 2.25rem);
    line-height: 1.15;
    margin: 0 0 0.75rem;
  }

  .pass {
    border: 2px solid var(--ink);
    background: var(--paper);
  }

  .pass-band {
    margin: 0;
    padding: 0.5rem 1.25rem;
    background: var(--ink);
    color: var(--paper);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8125rem;
    letter-spacing: 0.04em;
  }

  .pass-body {
    padding: 1.25rem;
    display: grid;
    gap: 1.25rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chip {
    display: inline-block;
    padding: 0.2rem 0.65rem;
    border: 2px solid color-mix(in srgb, var(--ink) 25%, var(--paper));
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .chip[data-state="ok"] {
    border-color: var(--ok);
    color: var(--ok);
  }

  .chip[data-state="wait"] {
    color: color-mix(in srgb, var(--ink) 60%, var(--paper));
  }

  .pass-ticket {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    padding-block-start: 1.25rem;
    border-block-start: 1px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
  }

  .ticket-id {
    flex: 1 1 9rem;
    min-inline-size: 0;
  }

  .pass-label {
    display: block;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--ink) 60%, var(--paper));
  }

  .ticket {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.4rem;
    letter-spacing: 0.02em;
    text-align: start;
  }

  .cols {
    display: grid;
    gap: 1.25rem;
    align-items: start;
  }

  @media (min-width: 720px) {
    .cols {
      grid-template-columns: 1fr 1fr;
    }
  }

  .card {
    border: 2px solid var(--ink);
    padding: 1.25rem;
    display: grid;
    gap: 0.75rem;
    align-content: start;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    padding-block-end: 0.6rem;
    border-block-end: 2px solid var(--ink);
  }

  .note {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: color-mix(in srgb, var(--ink) 72%, var(--paper));
  }

  .program,
  .assess {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }

  .program li {
    display: grid;
    grid-template-columns: 5rem 1fr;
    gap: 0.75rem;
    padding-block: 0.5rem;
    border-block-start: 1px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
    font-size: 0.9375rem;
  }

  .program li:first-child,
  .assess li:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .program time {
    font-family: var(--font-display);
    font-weight: 700;
    white-space: nowrap;
  }

  .program .what {
    display: grid;
    gap: 0.1rem;
  }

  .program small {
    color: color-mix(in srgb, var(--ink) 65%, var(--paper));
    font-size: 0.8125rem;
  }

  .assess li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-block: 0.55rem;
    border-block-start: 1px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
  }

  .assess li > span:first-child {
    font-size: 0.9375rem;
  }

  .cert {
    border: 2px solid var(--ink);
    padding: 0.9rem 1.25rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .cert h2 {
    border: 0;
    padding: 0;
    font-size: 0.875rem;
  }

  .cert-line {
    margin: 0;
    flex: 1 1 14rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  .dot {
    flex: none;
    inline-size: 0.625rem;
    block-size: 0.625rem;
    background: color-mix(in srgb, var(--ink) 35%, var(--paper));
  }

  .dot[data-state="ok"] {
    background: var(--ok);
  }

  /* Sits after global.css: a touch-size small button inside the cards. */
  .btn--sm {
    padding: 0.5rem 1rem;
    min-block-size: 2.75rem;
    font-size: 0.875rem;
  }
</style>
