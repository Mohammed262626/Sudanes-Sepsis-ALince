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

  function signOut() {
    try {
      localStorage.removeItem("sep-guest");
    } catch {
      // Nothing stored.
    }
    token = "";
    guest = null;
    copied = false;
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
  // is the promise made on the site. No PDF yet — the card states readiness.
  const cert = $derived.by(() => {
    if (!guest) return { state: "wait", label: "", text: "" };
    if (!guest.attended_at)
      return {
        state: "wait",
        label: "بانتظار الحضور",
        text: "تُنشأ شهادة الحضور بعد تسجيل حضورك عند البوابة.",
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
          " لتصبح شهادتك جاهزة.",
      };
    return {
      state: "ok",
      label: "جاهزة",
      text: "استوفيت الحضور والاستبانتين — شهادة الحضور جاهزة وتُسلَّم بعد المؤتمر.",
    };
  });
</script>

{#if loading}
  <div class="guest-shell">
    <p class="kicker">لوحتك</p>
    <p class="note">جارٍ التحميل…</p>
  </div>
{:else if guest}
  <div class="guest-shell" aria-labelledby="guest-title">
    <header class="guest-head" id="guest-title">
      <p class="kicker">لوحتك</p>
      <h1>{guest.name}</h1>
      <div class="chips">
        <span class="chip" data-state={guest.status === "approved" ? "ok" : "wait"}>
          {STATUS[guest.status] ?? guest.status}
        </span>
        {#if guest.attended_at}
          <span class="chip" data-state="ok">حاضر</span>
        {/if}
      </div>
    </header>

    <section class="block" aria-labelledby="ticket-title">
      <h2 id="ticket-title">تذكرتك</h2>
      <div class="ticket-wrapper">
        <p class="ticket" dir="ltr">{guest.ticket_code}</p>
        <button
          class="btn btn--ghost"
          type="button"
          onclick={copyTicketCode}
          aria-label={copied ? "Already copied" : "Copy ticket code"}
        >
          {copied ? "نسخت" : "نسخ"}
        </button>
      </div>
      <p class="note">
        في يوم المؤتمر افتح صفحة البوابة من هنا، ثم امسح رمز المدخل بكاميرا هاتفك.
      </p>
      {#if guest.status === "approved"}
        <a class="btn" href={doorUrl}>افتح صفحة البوابة</a>
      {:else}
        <p class="note">تُفتح صفحة البوابة بعد قبول التسجيل.</p>
      {/if}
    </section>

    <section class="block" aria-labelledby="program-title">
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

    <section class="block" aria-labelledby="assess-title">
      <h2 id="assess-title">الاستبانات</h2>
      {#if !guest.attended_at}
        <p class="note">
          تظهر الاستبانات بعد تسجيل حضورك عند البوابة.
        </p>
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

    <section class="block" aria-labelledby="cert-title">
      <h2 id="cert-title">الشهادة</h2>
      <div class="chips">
        <span class="chip" data-state={cert.state}>{cert.label}</span>
      </div>
      <p class="note">{cert.text}</p>
    </section>

    <footer class="guest-foot">
      <button class="link" type="button" onclick={signOut}>
        تسجيل الخروج من هذا الجهاز
      </button>
    </footer>
  </div>
{:else}
  <div class="guest-shell">
    <p class="kicker">لوحتك</p>
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
  h1 {
    font-size: clamp(1.75rem, 5vw, 2.25rem);
    margin: 0.4rem 0 0;
  }

  .guest-shell {
    padding: 1.5rem 1.25rem;
    max-inline-size: 46rem;
    margin-inline: auto;
  }

  .guest-head {
    padding-block-end: 1rem;
    border-block-end: 2px solid var(--ink);
    margin-block-end: 1.25rem;
  }

  .kicker {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--muted);
    margin-block-end: 0.5rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-block-start: 0.75rem;
  }

  .chip {
    display: inline-block;
    padding: 0.25rem 0.75rem;
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

  .block {
    padding-block: 1.25rem;
    border-block-end: 2px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
    margin-block-end: 1rem;
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }

  .block h2 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }

  .ticket-wrapper {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-block-end: 0.75rem;
  }

  .ticket {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.75rem;
    letter-spacing: 0.02em;
    flex: 1;
  }

  .note {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: color-mix(in srgb, var(--ink) 72%, var(--paper));
  }

  .assess {
    list-style: none;
    margin: 0;
    padding: 0;
    inline-size: 100%;
    display: grid;
    gap: 0.75rem;
  }

  .assess li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.5rem;
    border-block-start: 1px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
  }

  .assess li > span:first-child {
    font-size: 0.9375rem;
  }

  .program {
    list-style: none;
    margin: 0;
    padding: 0;
    inline-size: 100%;
    display: grid;
  }

  .program li {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 1rem;
    padding-block: 0.6rem;
    border-block-start: 1px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
    font-size: 0.9375rem;
  }

  .program li:first-child {
    border-block-start: 2px solid var(--ink);
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

  .btn--sm {
    min-height: 2.25rem;
    padding-inline: 1rem;
    font-size: 0.875rem;
  }

  .btn--ghost {
    background: none;
    border: 2px solid var(--ink);
    color: var(--ink);
    padding: 0.5rem 1rem;
    font: inherit;
    cursor: pointer;
  }

  .btn--ghost:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .btn--ghost:hover {
    background: color-mix(in srgb, var(--ink) 5%, var(--paper));
  }

  .link {
    border: 0;
    padding: 0;
    background: none;
    font: inherit;
    font-size: 0.875rem;
    color: color-mix(in srgb, var(--ink) 60%, var(--paper));
    text-decoration: underline;
    cursor: pointer;
  }

  .link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>