<script lang="ts">
  import { onMount, tick } from "svelte";
  import { supabase } from "../lib/supabase";
  import { url } from "../lib/url";
  import { buzz, ensureAudio, jsQrDecoder, parseCode, tone } from "../lib/scan";

  type Guest = {
    id: number;
    name: string;
    email: string | null;
    status: string;
    attended_at: string | null;
    ticket_code: string | null;
  };

  const COLS = "id,name,email,status,attended_at,ticket_code";
  const POLL_MS = 5000;

  let rows = $state<Guest[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let problem = $state("");
  let fresh = $state<number[]>([]);

  // Ids already seen on this screen, so only arrivals from other doors chirp.
  let known = new Set<number>();
  let primed = false;

  const timeFmt = new Intl.DateTimeFormat("ar-SD", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Khartoum",
  });

  async function refresh() {
    if (!supabase) return;
    const { data, error, count } = await supabase
      .from("conference_registrations")
      .select(COLS, { count: "exact" })
      .not("attended_at", "is", null)
      .order("attended_at", { ascending: false })
      .limit(60);
    if (error) {
      problem = "تعذّر تحميل القائمة — ستُعاد المحاولة.";
      return;
    }
    problem = "";
    total = count ?? 0;
    const list = (data ?? []) as Guest[];
    const arrivals = list.filter((r) => !known.has(r.id));
    list.forEach((r) => known.add(r.id));
    rows = list;
    loading = false;

    // Someone was checked in at another door: chirp once, mark the row.
    if (primed && arrivals.length) {
      tone([1180], "square", 0.07);
      fresh = [...fresh, ...arrivals.map((r) => r.id)];
      const ids = arrivals.map((r) => r.id);
      setTimeout(() => (fresh = fresh.filter((id) => !ids.includes(id))), 3000);
    }
    primed = true;
  }

  // Scanner. Same flow as the dashboard tab: nothing is written until the
  // confirm button is pressed.
  let video = $state<HTMLVideoElement | null>(null);
  let scanning = $state(false);
  let manualCode = $state("");
  let pending = $state<Guest | null>(null);
  let result = $state<{ ok: boolean; title: string; note: string } | null>(null);
  let hint = $state(false);
  let hit = $state(false);

  let stream: MediaStream | null = null;
  let loop = 0;
  let hintTimer = 0;
  let resultTimer = 0;
  let input = $state<HTMLInputElement | null>(null);
  let confirmEl = $state<HTMLElement | null>(null);

  const flash = () => {
    hit = true;
    setTimeout(() => (hit = false), 220);
  };

  function say(ok: boolean, title: string, note: string, ms = 4000) {
    clearTimeout(resultTimer);
    result = { ok, title, note };
    resultTimer = window.setTimeout(() => (result = null), ms);
  }

  async function startScan() {
    if (scanning) return;
    result = null;
    // The tap that opens the camera is also the gesture that unlocks audio.
    ensureAudio();
    if (!window.isSecureContext) {
      say(false, "الكاميرا تحتاج رابط HTTPS", "افتح الرابط المنشور، أو أدخل الرمز يدويًا.", 8000);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      say(false, "هذا المتصفح لا يسمح بالكاميرا", "استخدم قارئ QR أو أدخل الرمز يدويًا.", 8000);
      return;
    }

    let decode: (v: HTMLVideoElement) => string | null;
    try {
      decode = await jsQrDecoder();
    } catch {
      say(false, "تعذّر تحميل قارئ QR", "تحقق من الاتصال أو أدخل الرمز يدويًا.", 8000);
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }],
        } as MediaTrackConstraints,
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        say(false, "تعذّر فتح الكاميرا", "اسمح بالوصول إلى الكاميرا أو أدخل الرمز يدويًا.", 8000);
        return;
      }
    }
    scanning = true;
    hint = false;
    await tick();
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
    armHint();

    let frames = 0;
    const poll = () => {
      if (!scanning) return;
      loop = requestAnimationFrame(poll);
      // A read waits for confirmation: keep the loop alive, skip decoding.
      if (pending || !video) return;
      if (++frames % 4) return;
      let raw: string | null;
      try {
        raw = decode(video);
      } catch {
        return;
      }
      if (!raw) return;
      clearTimeout(hintTimer);
      hint = false;
      void checkIn(raw);
    };
    poll();
  }

  function armHint() {
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      if (scanning && !pending) hint = true;
    }, 8000);
  }

  function stopScan() {
    scanning = false;
    pending = null;
    hint = false;
    clearTimeout(hintTimer);
    cancelAnimationFrame(loop);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  let looking = false;
  // A code held in front of the camera decodes every frame; ignore repeats
  // briefly so a bad ticket beeps once, not sixty times.
  let lastCode = "";
  let lastAt = 0;

  async function checkIn(raw: string) {
    const code = parseCode(raw);
    if (!code || !supabase || looking) return;
    if (code === lastCode && Date.now() - lastAt < 3000) return;
    lastCode = code;
    lastAt = Date.now();
    looking = true;
    clearTimeout(resultTimer);
    pending = null;
    const { data, error } = await supabase
      .from("conference_registrations")
      .select(COLS)
      .eq("ticket_code", code)
      .maybeSingle();
    looking = false;

    if (error) {
      tone([200], "triangle");
      buzz(80);
      say(false, "تعذّر التحقق", "حاول مرة أخرى.");
      return;
    }
    const row = data as Guest | null;
    if (!row) {
      tone([200], "triangle");
      buzz(80);
      say(false, "رمز غير معروف", code);
      return;
    }
    if (row.attended_at) {
      tone([600, 480]);
      say(true, `${row.name} — سبق تسجيل الحضور`, "الحضور: " + timeFmt.format(new Date(row.attended_at)));
      return;
    }
    if (row.status !== "approved") {
      tone([200], "triangle");
      buzz(80);
      say(false, `${row.name} — لم يُقبل بعد`, code);
      return;
    }
    tone([880]);
    buzz(40);
    flash();
    pending = row;
    void tick().then(() => confirmEl?.scrollIntoView({ block: "nearest" }));
  }

  function submitManual() {
    const code = manualCode.trim();
    if (!code) return;
    manualCode = "";
    void checkIn(code);
  }

  async function confirmAttend() {
    const row = pending;
    if (!row || !supabase) return;
    pending = null;
    const at = new Date().toISOString();
    const { error } = await supabase
      .from("conference_registrations")
      .update({ attended_at: at })
      .eq("id", row.id);
    if (error) {
      tone([200], "triangle");
      buzz(80);
      say(false, "تعذّر تسجيل الحضور", "حاول مرة أخرى.");
      return;
    }
    tone([880, 1320]);
    buzz(40);
    flash();
    // Count our own action as seen so the poll does not chirp for it too.
    known.add(row.id);
    say(true, `تم تسجيل ${row.name}`, "الحضور الآن", 3000);
    input?.focus();
    await refresh();
  }

  onMount(() => {
    if (!supabase) {
      problem = "لا يوجد اتصال بقاعدة البيانات.";
      loading = false;
      return;
    }
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        location.replace(url("admin/login"));
        return;
      }
      await refresh();
    })();
    // Doors share one list: polling keeps every screen current without opening
    // a public realtime channel to registrant data.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      stopScan();
    };
  });
</script>

<div class="door" onclick={() => ensureAudio()}>
  <header class="door-head">
    <div class="door-count">
      <strong>{total}</strong>
      <span>حضروا</span>
    </div>
    {#if scanning}
      <button class="btn btn--ghost" type="button" onclick={stopScan}>إيقاف الكاميرا</button>
    {:else}
      <button class="btn" type="button" onclick={startScan}>بدء الكاميرا</button>
    {/if}
  </header>

  {#if problem}
    <p class="door-alert">{problem}</p>
  {/if}

  <section class="door-scan" class:is-hit={hit}>
    {#if scanning}
      <video bind:this={video} playsinline muted></video>
    {:else}
      <p class="door-idle">ابدأ الكاميرا، أو اكتب رمز التذكرة أدناه.</p>
    {/if}

    <p class="door-status" role="status">
      {#if pending}
        بانتظار التأكيد
      {:else if scanning && hint}
        لم يُقرأ الرمز — قرّب التذكرة أو أدخل الرمز.
      {:else if scanning}
        وجّه التذكرة إلى الكاميرا.
      {:else}
        اكتب رمز التذكرة أدناه.
      {/if}
    </p>

    {#if pending}
      <div class="door-confirm" bind:this={confirmEl}>
        <p class="door-confirm-name">{pending.name}</p>
        <p class="door-confirm-code" dir="ltr">{pending.ticket_code}</p>
        <div class="door-confirm-actions">
          <button class="btn" type="button" onclick={confirmAttend}>تسجيل الحضور</button>
          <button class="btn btn--ghost" type="button" onclick={() => (pending = null)}>
            إلغاء
          </button>
        </div>
      </div>
    {/if}

    {#if result}
      <p class="door-result" data-ok={result.ok ? "true" : "false"}>
        <strong>{result.title}</strong>
        <span>{result.note}</span>
      </p>
    {/if}

    <form class="door-manual" onsubmit={(e) => { e.preventDefault(); submitManual(); }}>
      <input
        bind:this={input}
        bind:value={manualCode}
        placeholder="SX-XXXX"
        dir="ltr"
        autocomplete="off"
        aria-label="رمز التذكرة"
      />
      <button class="btn" type="submit" disabled={!manualCode.trim()}>تحقّق</button>
    </form>
  </section>

  <section class="door-list">
    <h2>آخر الحاضرين</h2>
    {#if loading}
      <p class="door-empty">جارٍ التحميل…</p>
    {:else if rows.length === 0}
      <p class="door-empty">لم يسجّل أحد الحضور بعد.</p>
    {:else}
      <ul>
        {#each rows as row (row.id)}
          <li class:is-fresh={fresh.includes(row.id)}>
            <span class="door-who">
              <span class="door-name">{row.name}</span>
              {#if row.email}<span class="door-email" dir="ltr">{row.email}</span>{/if}
            </span>
            <span class="door-facts">
              <span class="door-code" dir="ltr">{row.ticket_code}</span>
              <span class="door-time">
                {row.attended_at ? timeFmt.format(new Date(row.attended_at)) : ""}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="door-foot"><a href={url("admin/")}>لوحة التحكم</a></p>
  </section>
</div>

<style>
  .door {
    display: grid;
    gap: 1.25rem;
    max-width: 46rem;
    margin-inline: auto;
    padding-block: 1.25rem;
  }

  /* No chrome: a kiosk strip, the scanner, then the live list. */
  .door-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-block-end: 2px solid var(--ink);
    padding-block-end: 1rem;
  }

  .door-count {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .door-count strong {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(2.25rem, 8vw, 3.5rem);
    line-height: 1;
  }

  .door-count span {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--muted);
  }

  .door-alert {
    margin: 0;
    padding: 0.75rem 1rem;
    border: 2px solid var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .door-scan {
    display: grid;
    gap: 0.9rem;
    border: 2px solid var(--ink);
    padding: 1rem;
    transition: background-color 0.2s ease;
  }

  .door-scan.is-hit {
    background: var(--tint-pink);
  }

  .door-scan video {
    inline-size: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: var(--ink);
  }

  .door-idle {
    margin: 0;
    padding-block: 2.5rem;
    text-align: center;
    font-size: 1.0625rem;
    color: var(--muted);
  }

  .door-status {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--muted);
    border-block-start: 2px solid var(--line);
    padding-block-start: 0.75rem;
  }

  .door-manual {
    display: flex;
    gap: 0.5rem;
  }

  .door-manual input {
    flex: 1;
    min-inline-size: 0;
    font-family: var(--font-body);
    font-size: 1.125rem;
    padding: 0.6rem 0.75rem;
    border: 2px solid var(--ink);
    border-radius: 0;
    background: var(--paper);
    color: var(--ink);
  }

  .door-manual input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .door-confirm {
    border: 2px solid var(--accent);
    padding: 1rem;
  }

  .door-confirm-name {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.5rem;
  }

  .door-confirm-code {
    margin: 0.15rem 0 0.9rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .door-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .door-result {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0.75rem 1rem;
    border-inline-start: 6px solid var(--accent);
    background: var(--tint-pink);
  }

  .door-result[data-ok="false"] {
    border-inline-start-color: var(--ink);
    background: var(--line);
  }

  .door-result strong {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.125rem;
  }

  .door-result span {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .door-list h2 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.9375rem;
    margin: 0 0 0.5rem;
  }

  .door-empty {
    margin: 0;
    color: var(--muted);
  }

  .door-list ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .door-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 0.25rem;
    border-block-end: 2px solid var(--line);
  }

  .door-list li.is-fresh {
    background: var(--tint-pink);
  }

  .door-who {
    display: grid;
    gap: 0.1rem;
    min-inline-size: 0;
  }

  .door-name {
    font-weight: 600;
  }

  .door-email {
    font-size: 0.8125rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .door-facts {
    flex: none;
    display: grid;
    gap: 0.1rem;
    justify-items: end;
  }

  .door-code {
    font-size: 0.8125rem;
    color: var(--ink);
  }

  .door-time {
    flex: none;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .door-foot {
    margin: 1rem 0 0;
    font-size: 0.875rem;
  }

  .door-foot a {
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .door-scan {
      transition: none;
    }
  }
</style>
