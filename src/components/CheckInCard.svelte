<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "../lib/supabase";

  type State =
    | "loading"
    | "scan"
    | "closed"
    | "notfound"
    | "notapproved"
    | "ready"
    | "done"
    | "error";

  const EVENT = "الاثنين 16 نوفمبر 2026";
  const dateFmt = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" });

  let state = $state<State>("loading");
  let token = "";
  let name = $state("");
  let ticket = $state("");
  let attendedAt = $state<string | null>(null);
  let busy = $state(false);

  onMount(async () => {
    // Only the pass opens this page; a typed ticket code is not enough.
    token = new URLSearchParams(location.search).get("k")?.trim() ?? "";
    if (!token || !supabase) {
      state = "scan";
      return;
    }
    const { data, error } = await supabase.rpc("checkin_lookup", { p_token: token });
    if (error) {
      state = "error";
      return;
    }
    const r = data as {
      ok?: boolean;
      reason?: string;
      name?: string;
      ticket_code?: string;
      attended_at?: string | null;
    };
    if (!r?.ok) {
      state =
        r?.reason === "closed"
          ? "closed"
          : r?.reason === "not_approved"
            ? "notapproved"
            : "notfound";
      return;
    }
    name = r.name ?? "";
    ticket = r.ticket_code ?? "";
    attendedAt = r.attended_at ?? null;
    state = attendedAt ? "done" : "ready";
  });

  async function confirm() {
    if (busy || !supabase) return;
    busy = true;
    const { data, error } = await supabase.rpc("checkin_confirm", { p_token: token });
    busy = false;
    const r = data as { ok?: boolean; reason?: string; attended_at?: string };
    if (error || !r?.ok) {
      state = r?.reason === "closed" ? "closed" : "error";
      return;
    }
    attendedAt = r.attended_at ?? new Date().toISOString();
    state = "done";
  }
</script>

<div class="checkin">
  <p class="kicker">مؤتمر كسلا للإنتان</p>

  {#if state === "loading"}
    <h1>جارٍ التحقق…</h1>
  {:else if state === "scan"}
    <h1>امسح رمز تذكرتك</h1>
    <p class="note">
      افتح هذه الصفحة بمسح رمز QR من تذكرة الواتساب، ثم اضغط «تأكيد الحضور» يوم المؤتمر.
    </p>
  {:else if state === "closed"}
    <h1>صفحة الحضور مغلقة</h1>
    <p class="note">تُفتح يوم المؤتمر: {EVENT}.</p>
  {:else if state === "notfound"}
    <h1>رمز غير معروف</h1>
    <p class="note">امسح رمز QR من تذكرة الواتساب مرة أخرى.</p>
  {:else if state === "notapproved"}
    <h1>تذكرتك لم تُعتمد بعد</h1>
    <p class="note">تواصل مع فريق التنظيم إن كنت تعتقد أن هذا خطأ.</p>
  {:else if state === "ready"}
    <h1>أهلاً {name}</h1>
    <div class="facts">
      <span class="ticket" dir="ltr">{ticket}</span>
      <span>{EVENT}</span>
    </div>
    <p class="note">اضغط الزر أدناه لتسجيل حضورك.</p>
    <button class="btn" type="button" disabled={busy} onclick={confirm}>
      تأكيد الحضور
    </button>
  {:else if state === "done"}
    <span class="mark" aria-hidden="true">✓</span>
    <h1>تم تسجيل حضورك</h1>
    <p class="note">
      {name}{attendedAt ? " — " + dateFmt.format(new Date(attendedAt)) : ""}
    </p>
    <p class="note">أرسلنا لك رسالة تأكيد على الواتساب.</p>
  {:else}
    <h1>تعذّر التحقق</h1>
    <p class="note">تحقق من اتصالك ثم أعد تحميل الصفحة.</p>
  {/if}
</div>

<style>
  .checkin {
    display: grid;
    gap: 0.85rem;
    inline-size: 100%;
    max-inline-size: 30rem;
    padding: 1.5rem 1.35rem;
    border: 2px solid var(--ink);
    background: var(--paper);
  }

  .checkin .kicker {
    margin: 0;
  }

  .checkin h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.375rem;
    line-height: 1.35;
  }

  .note {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.75;
    color: var(--muted);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .ticket {
    direction: ltr;
    font-weight: 700;
    color: var(--ink);
  }

  .checkin .btn {
    inline-size: 100%;
    min-block-size: 3.25rem;
    font-size: 1.125rem;
  }

  .mark {
    display: grid;
    place-items: center;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    border: 2px solid var(--ink);
    border-radius: 50%;
    font-size: 1.5rem;
  }
</style>