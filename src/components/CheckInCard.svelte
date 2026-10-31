<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { supabase } from "../lib/supabase";
  import { url } from "../lib/url";

  type State =
    | "loading"
    | "nokey"
    | "closed"
    | "notfound"
    | "notapproved"
    | "ready"
    | "decline"
    | "declined"
    | "done"
    | "error";

  const EVENT = "الاثنين 16 نوفمبر 2026";
  const dateFmt = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" });
  const reduced = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let state = $state<State>("loading");
  let token = "";
  let name = $state("");
  let ticket = $state("");
  let attendedAt = $state<string | null>(null);
  let declinedAt = $state<string | null>(null);
  let busy = $state(false);

  // Door step: the URI says who the guest is, the entrance poster proves he is
  // actually there. No scan (or typed poster code) means no confirm button.
  let doorOk = $state(false);
  let doorError = $state("");
  let scanning = $state(false);
  let manualOpen = $state(false);
  let manual = $state("");
  let doorCode = "";
  let video = $state<HTMLVideoElement | null>(null);
  let stageEl = $state<HTMLElement | null>(null);
  let confirmBtn = $state<HTMLButtonElement | null>(null);

  let stream: MediaStream | null = null;
  let loop = 0;
  let checking = false;
  let canvas: HTMLCanvasElement | null = null;

  // 1 = identity shown, 2 = waiting for the door code, 3 = waiting for the tap.
  const step = $derived(state === "done" ? 4 : doorOk ? 3 : 2);

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    token = params.get("k")?.trim() ?? "";
    const wantsDecline = params.get("d") === "1";
    if (!token || !supabase) {
      state = "nokey";
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
      declined_at?: string | null;
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
    declinedAt = r.declined_at ?? null;
    state = attendedAt
      ? "done"
      : declinedAt
        ? "declined"
        : wantsDecline
          ? "decline"
          : "ready";
  });

  onDestroy(stopCamera);

  // --- sound: no files, generated on the first tap (iOS needs the gesture) ---
  let audio: AudioContext | null = null;

  function ensureAudio() {
    try {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      audio ??= new Ctor();
      if (audio!.state === "suspended") audio!.resume();
    } catch {
      // No audio: the visual state still carries the answer.
    }
  }

  function beep(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
    if (!audio) return;
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const ping = () => {
    beep(880, 0.09, "sine", 0.12);
    beep(1320, 0.1, "sine", 0.12, 0.1);
  };
  const fanfare = () => {
    beep(660, 0.09, "sine", 0.12);
    beep(880, 0.09, "sine", 0.12, 0.09);
    beep(1320, 0.18, "sine", 0.12, 0.18);
  };
  const buzz = () => beep(220, 0.16, "square", 0.08);

  function hum(pattern: number | number[]) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Desktop: nothing to vibrate.
    }
  }

  function stopCamera() {
    scanning = false;
    cancelAnimationFrame(loop);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function loadJsQr(): Promise<any> {
    const w = window as any;
    if (w.jsQR) return w.jsQR;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url("vendor/jsQR.js");
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("jsQR"));
      document.head.append(s);
    });
    return w.jsQR;
  }

  // Centre 70% at 720 px, then the whole frame at 800 px — the tuning that
  // reads the admin scanner reliably at arm's length on phones.
  async function decoder(): Promise<(v: HTMLVideoElement) => string | null> {
    const jsQR = await loadJsQr();
    canvas ??= document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const grab = (v: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number, cap: number) => {
      const s = Math.min(1, cap / sw);
      canvas!.width = Math.max(1, Math.round(sw * s));
      canvas!.height = Math.max(1, Math.round(sh * s));
      ctx!.drawImage(v, sx, sy, sw, sh, 0, 0, canvas!.width, canvas!.height);
      return ctx!.getImageData(0, 0, canvas!.width, canvas!.height);
    };
    return (v) => {
      if (!ctx || !v.videoWidth) return null;
      const w = v.videoWidth;
      const h = v.videoHeight;
      const side = Math.round(Math.min(w, h) * 0.7);
      const crop = grab(v, (w - side) / 2, (h - side) / 2, side, side, 720);
      const hit = jsQR(crop.data, crop.width, crop.height, { inversionAttempts: "attemptBoth" });
      if (hit) return hit.data;
      const full = grab(v, 0, 0, w, h, 800);
      return (
        jsQR(full.data, full.width, full.height, { inversionAttempts: "attemptBoth" })?.data ?? null
      );
    };
  }

  async function startDoorScan() {
    ensureAudio();
    doorError = "";
    if (!window.isSecureContext) {
      doorError = "الكاميرا تحتاج رابط https. استخدم رمز البوابة أدناه.";
      manualOpen = true;
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      doorError = "هذا المتصفح لا يسمح بالكاميرا. استخدم رمز البوابة أدناه.";
      manualOpen = true;
      return;
    }

    let decode: (v: HTMLVideoElement) => string | null;
    try {
      decode = await decoder();
    } catch {
      doorError = "تعذّر تحميل قارئ الرمز، تحقق من الاتصال.";
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
    } catch (err: any) {
      doorError =
        err?.name === "NotAllowedError" || err?.name === "SecurityError"
          ? "اسمح بالكاميرا من إعدادات المتصفح ثم أعد المحاولة."
          : "تعذّر فتح الكاميرا. أعد المحاولة أو استخدم رمز البوابة أدناه.";
      return;
    }

    scanning = true;
    await tick();
    if (!video) return;
    video.srcObject = stream;
    await video.play().catch(() => {});

    let frames = 0;
    const poll = () => {
      if (!scanning || !video) return;
      loop = requestAnimationFrame(poll);
      if (checking) return;
      // ~15 fps is plenty for a QR and keeps the phone cool.
      if (++frames % 4) return;
      let raw: string | null = null;
      try {
        raw = decode(video);
      } catch {
        return;
      }
      if (raw) acceptDoor(raw);
    };
    poll();
  }

  async function acceptDoor(raw: string): Promise<boolean> {
    const value = raw.trim();
    if (!value) return false;
    // Scanning or typing your own ticket instead of the poster is the usual slip.
    if (/checkin\/?\?/i.test(value) || /SX-[A-Z0-9]{4,}/i.test(value)) {
      doorError = "هذا رمز تذكرتك — امسح رمز البوابة المعلّق عند المدخل.";
      return false;
    }
    if (!supabase || checking) return false;
    checking = true;
    const { data, error } = await supabase.rpc("checkin_door", { p_door: value });
    checking = false;
    if (error) {
      doorError = "تعذّر الاتصال، أعد المحاولة.";
      return false;
    }
    if (!data) {
      doorError = "رمز البوابة غير صحيح.";
      buzz();
      hum(80);
      return false;
    }
    doorCode = value;
    stopCamera();
    doorError = "";
    doorOk = true;
    ping();
    hum(60);
    return true;
  }

  async function submitManual() {
    if (busy || !manual.trim()) return;
    busy = true;
    await acceptDoor(manual);
    busy = false;
  }

  // Declining frees the seat; the trigger sends the closing message and tells
// the admins. Allowed before the event, not only during the check-in window.
  async function doDecline() {
    if (busy || !supabase) return;
    busy = true;
    const { data, error } = await supabase.rpc("checkin_decline", { p_token: token });
    busy = false;
    const r = data as { ok?: boolean; reason?: string; declined_at?: string };
    if (error || !r?.ok) {
      state = "error";
      return;
    }
    declinedAt = r.declined_at ?? new Date().toISOString();
    beep(392, 0.12, "sine", 0.1);
    beep(330, 0.16, "sine", 0.1, 0.1);
    hum(40);
    state = "declined";
  }

  async function confirm() {
    if (busy || !supabase) return;
    busy = true;
    const { data, error } = await supabase.rpc("checkin_confirm", {
      p_token: token,
      p_door: doorCode,
    });
    busy = false;
    const r = data as { ok?: boolean; reason?: string; attended_at?: string };
    if (error) {
      state = "error";
      return;
    }
    if (!r?.ok) {
      if (r?.reason === "bad_door") {
        doorOk = false;
        doorCode = "";
        doorError = "انتهت صلاحية مسح البوابة، أعد مسحها.";
        return;
      }
      state = r?.reason === "closed" ? "closed" : "error";
      return;
    }
    attendedAt = r.attended_at ?? new Date().toISOString();
    fanfare();
    hum([40, 60, 40]);
    state = "done";
  }

  // The confirm button is the one thing that matters once the door is verified:
  // bring it into view and focus it instead of hoping the guest looks down.
  $effect(() => {
    if (!doorOk || !confirmBtn) return;
    const behavior = reduced() ? "auto" : "smooth";
    confirmBtn.scrollIntoView({ block: "nearest", behavior });
    confirmBtn.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!scanning || !stageEl) return;
    stageEl.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  });
</script>

<div class="checkin">
  <p class="kicker">مؤتمر كسلا للإنتان</p>

  {#if state === "ready" || state === "done"}
    <ol class="steps" aria-label="خطوات تسجيل الحضور">
      <li data-done={step > 1} data-active={step === 1}>بياناتك</li>
      <li data-done={step > 2} data-active={step === 2}>رمز البوابة</li>
      <li data-done={step > 3} data-active={step === 3}>التأكيد</li>
    </ol>
  {/if}

  {#key `${state}:${doorOk}`}
    <div class="block">
      {#if state === "loading"}
        <h1 class="inline"><span class="spin" aria-hidden="true"></span> جارٍ التحقق...</h1>
      {:else if state === "nokey"}
        <h1>افتح الصفحة من تذكرتك</h1>
        <p class="note">اضغط زر «تأكيد الحضور» في رسالة الواتساب التي وصلتك بعد اعتماد تسجيلك.</p>
      {:else if state === "closed"}
        <h1>صفحة الحضور مغلقة</h1>
        <p class="note">تُفتح يوم المؤتمر: {EVENT}.</p>
      {:else if state === "notfound"}
        <h1>رمز غير معروف</h1>
        <p class="note">افتح الصفحة من زر «تأكيد الحضور» في رسالتك.</p>
      {:else if state === "notapproved"}
        <h1>تذكرتك لم تُعتمد بعد</h1>
        <p class="note">تواصل مع فريق التنظيم إن كنت تعتقد أن هذا خطأ.</p>
      {:else if state === "ready"}
        <h1>أهلاً {name}</h1>
        <div class="facts">
          <span class="ticket" dir="ltr">{ticket}</span>
          <span>{EVENT}</span>
        </div>

        {#if doorOk}
          <p class="door-ok" role="status">
            <span class="tick" aria-hidden="true">✓</span> تم التحقق من البوابة
          </p>
          <button
            class="btn go"
            type="button"
            bind:this={confirmBtn}
            disabled={busy}
            aria-busy={busy}
            onclick={confirm}
          >
            {#if busy}
              <span class="spin" aria-hidden="true"></span> جارٍ التسجيل...
            {:else}
              تأكيد الحضور
            {/if}
          </button>
        {:else}
          <p class="note">لتسجيل حضورك امسح رمز البوابة المعلّق عند المدخل.</p>

          {#if scanning}
            <div class="stage" bind:this={stageEl}>
              <video bind:this={video} playsinline muted></video>
              <span class="frame" aria-hidden="true"></span>
              <span class="line" aria-hidden="true"></span>
            </div>
            <p class="scan-tip">قرّب الهاتف حتى يمتلئ الإطار</p>
            <button class="btn btn--ghost" type="button" onclick={stopCamera}>إيقاف الكاميرا</button>
          {:else}
            <button class="btn" type="button" onclick={startDoorScan}>امسح رمز البوابة</button>
          {/if}

          {#if doorError}
            <p class="error" role="alert">{doorError}</p>
          {/if}

          {#if !scanning}
            {#if manualOpen}
              <form
                class="manual"
                onsubmit={(e) => {
                  e.preventDefault();
                  submitManual();
                }}
              >
                <label for="door-code">رمز البوابة</label>
                <div class="manual-row">
                  <input
                    id="door-code"
                    dir="ltr"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    bind:value={manual}
                  />
                  <button class="btn btn--ghost" type="submit" disabled={busy}>تحقق</button>
                </div>
              </form>
            {:else}
              <button class="link" type="button" onclick={() => (manualOpen = true)}>
                لا تعمل الكاميرا؟ أدخل رمز البوابة
              </button>
            {/if}
          {/if}
        {/if}
      {:else if state === "decline"}
        <h1>إلغاء المشاركة؟</h1>
        <p class="note">
          أهلاً {name} — إن أكدت الإلغاء فسيُرسل لنا اعتذارك، ويُتاح مقعدك لضيف آخر.
        </p>
        <div class="facts">
          <span class="ticket" dir="ltr">{ticket}</span>
          <span>{EVENT}</span>
        </div>
        <button class="btn btn--ghost" type="button" disabled={busy} onclick={doDecline}>
          {#if busy}
            <span class="spin" aria-hidden="true"></span> جارٍ الإلغاء...
          {:else}
            نعم، ألغِ مشاركتي
          {/if}
        </button>
        <button class="link" type="button" onclick={() => (state = "ready")}>
          تراجع — سأحضر
        </button>
      {:else if state === "declined"}
        <h1>تم إلغاء مشاركتك</h1>
        <p class="note">
          شكراً لإبلاغنا — أتحنا مقعدك لضيف آخر، وأرسلنا لك رسالة تأكيد على الواتساب.
        </p>
      {:else if state === "done"}
        <div class="done" role="status">
          <span class="mark" aria-hidden="true">✓</span>
          <h1>تم تسجيل حضورك</h1>
        </div>
        <p class="note">
          {name}{attendedAt ? " — " + dateFmt.format(new Date(attendedAt)) : ""}
        </p>
        <p class="note">أظهر هذه الشاشة عند الاستقبال إن طُلبت، وأرسلنا لك تأكيداً على الواتساب.</p>
      {:else}
        <h1>تعذّر التحقق</h1>
        <p class="note">تحقق من اتصالك ثم أعد تحميل الصفحة.</p>
      {/if}
    </div>
  {/key}

  <p class="brand">صفحة رسمية — التحالف السوداني للإنتان</p>
</div>

<style>
  .checkin {
    display: grid;
    gap: 0.9rem;
    inline-size: 100%;
    max-inline-size: 30rem;
    padding: 1.5rem 1.35rem;
    border: 2px solid var(--ink);
    background: var(--paper);
  }

  .kicker {
    margin: 0;
    font-size: 0.8125rem;
  }

  .block {
    display: grid;
    gap: 0.85rem;
    animation: rise 0.22s ease-out both;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.375rem;
    line-height: 1.35;
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 0.6rem;
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

  /* Steps */
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.8125rem;
    color: var(--muted);
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .steps li + li::before {
    content: "·";
    margin-inline-end: 0.15rem;
  }

  .steps li[data-active] {
    color: var(--ink);
    font-weight: 700;
  }

  .steps li[data-done] {
    color: var(--ink);
  }

  .steps li[data-done]::after {
    content: "✓";
    font-size: 0.75rem;
  }

  /* Buttons */
  .checkin .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    inline-size: 100%;
    min-block-size: 3.25rem;
    font-size: 1.125rem;
  }

  .go {
    animation: pop 0.18s cubic-bezier(0.23, 1, 0.32, 1) both;
  }

  .link {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.875rem;
    color: var(--muted);
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  .link:hover {
    color: var(--ink);
  }

  /* Spinner */
  .spin {
    inline-size: 1.05rem;
    block-size: 1.05rem;
    border: 2px solid var(--line);
    border-block-start-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Camera */
  .stage {
    position: relative;
    overflow: hidden;
    border: 2px solid var(--ink);
    background: var(--ink);
  }

  .stage video {
    display: block;
    inline-size: 100%;
    block-size: min(45dvh, 22rem);
    object-fit: cover;
  }

  .frame {
    position: absolute;
    inset: 14%;
    border: 2px dashed rgba(255, 255, 255, 0.6);
    pointer-events: none;
  }

  .line {
    position: absolute;
    inset: 14%;
    background: linear-gradient(var(--accent), var(--accent)) no-repeat;
    background-size: 100% 2px;
    animation: sweep 1.8s ease-in-out infinite alternate;
    pointer-events: none;
  }

  @keyframes sweep {
    from {
      background-position-y: 0;
    }
    to {
      background-position-y: 100%;
    }
  }

  .scan-tip {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--muted);
    text-align: center;
  }

  /* Manual fallback: the poster code, typed. Same server check as a scan. */
  .manual {
    display: grid;
    gap: 0.4rem;
    padding-block-start: 0.2rem;
  }

  .manual label {
    font-size: 0.8125rem;
    color: var(--muted);
  }

  .manual-row {
    display: flex;
    gap: 0.5rem;
  }

  .manual input {
    flex: 1;
    min-inline-size: 0;
    block-size: 2.75rem;
    padding-inline: 0.7rem;
    border: 2px solid var(--line);
    background: var(--paper);
    font: inherit;
    font-size: 1rem;
  }

  .manual .btn {
    inline-size: auto;
    min-block-size: 2.75rem;
    padding-inline: 1rem;
    font-size: 0.9375rem;
  }

  /* Feedback */
  .door-ok {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--ink);
  }

  .tick {
    display: grid;
    place-items: center;
    inline-size: 1.4rem;
    block-size: 1.4rem;
    border-radius: 50%;
    background: var(--ink);
    color: var(--paper);
    font-size: 0.8rem;
    animation: pop 0.18s cubic-bezier(0.23, 1, 0.32, 1) both;
  }

  .done {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .mark {
    display: grid;
    place-items: center;
    inline-size: 2.6rem;
    block-size: 2.6rem;
    border: 2px solid var(--ink);
    border-radius: 50%;
    font-size: 1.4rem;
    animation: pop 0.22s cubic-bezier(0.23, 1, 0.32, 1) both;
  }

  .error {
    margin: 0;
    font-size: 0.875rem;
    color: var(--accent);
    animation: shake 0.24s ease-in-out both;
  }

  .brand {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>