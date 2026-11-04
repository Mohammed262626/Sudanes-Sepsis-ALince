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

  const STATUS: Record<string, string> = {
    pending: "بانتظار القبول",
    approved: "مؤكد",
    rejected: "لم يُقبل",
  };

  let token = $state("");
  let guest = $state<Guest | null>(null);
  let loading = $state(true);
  let failed = $state(false);

  onMount(async () => {
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
    loading = false;
    if (error || !Array.isArray(data) || data.length === 0) {
      failed = true;
      return;
    }
    guest = data[0] as Guest;
  });

  function signOut() {
    try {
      localStorage.removeItem("sep-guest");
    } catch {
      // Nothing stored.
    }
    token = "";
    guest = null;
  }

  const doorUrl = $derived(
    guest ? `${url("checkin")}/?k=${encodeURIComponent(token)}&t=${encodeURIComponent(guest.ticket_code)}` : "",
  );

  const assessmentHref = (stage: "pre" | "post") =>
    `${url("assessment")}/?t=${encodeURIComponent(guest?.assessment_token ?? "")}&s=${stage}`;
</script>

{#if loading}
  <p class="kicker">لوحتك</p>
  <p class="note">جارٍ التحميل…</p>
{:else if guest}
  <header class="guest-head">
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
    <p class="ticket" dir="ltr">{guest.ticket_code}</p>
    <p class="note">
      في يوم المؤتمر افتح صفحة البوابة من هنا، ثم امسح رمز المدخل بكاميرا هاتفك.
    </p>
    {#if guest.status === "approved"}
      <a class="btn" href={doorUrl}>افتح صفحة البوابة</a>
    {:else}
      <p class="note">تُفتح صفحة البوابة بعد قبول التسجيل.</p>
    {/if}
  </section>

  <section class="block" aria-labelledby="assess-title">
    <h2 id="assess-title">الاستبانات</h2>
    {#if !guest.attended_at}
      <p class="note">تظهر الاستبانات بعد تسجيل حضورك عند البوابة.</p>
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

  <footer class="guest-foot">
    <button class="link" type="button" onclick={signOut}>تسجيل الخروج من هذا الجهاز</button>
  </footer>
{:else}
  <p class="kicker">لوحتك</p>
  <h1>الدخول عبر رسالة القبول</h1>
  <p class="note">
    افتح زر «افتح لوحتك» في رسالة القبول التي وصلتك على واتساب. تُحفظ اللوحة على هذا
    الجهاز، فلا تحتاج للرابط مرة أخرى.
  </p>
  {#if failed}
    <p class="note" role="alert">لم يُعرَف الرابط. افتح الزر من الرسالة الأصلية.</p>
  {/if}
{/if}

<style>
  h1 {
    font-size: clamp(1.5rem, 4vw, 2rem);
    margin: 0.35rem 0 0;
  }

  .guest-head {
    padding-block-end: 1.25rem;
    border-block-end: 2px solid var(--ink);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-block-start: 0.75rem;
  }

  .chip {
    display: inline-block;
    padding: 0.2rem 0.6rem;
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
    padding-block: 1.5rem;
    border-block-end: 2px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }

  .block h2 {
    font-size: 1.05rem;
    margin: 0;
  }

  .ticket {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    letter-spacing: 0.05em;
  }

  .note {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.65;
    color: color-mix(in srgb, var(--ink) 72%, var(--paper));
  }

  .assess {
    list-style: none;
    margin: 0;
    padding: 0;
    inline-size: 100%;
    display: grid;
    gap: 0.65rem;
  }

  .assess li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.5rem;
    border-block-start: 1px solid color-mix(in srgb, var(--ink) 15%, var(--paper));
  }

  .guest-foot {
    padding-block-start: 1.25rem;
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
</style>
