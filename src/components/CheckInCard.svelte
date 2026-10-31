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

  // Door step: the page only knows who the guest is (from the URI), the scan of
  // the entrance poster is what proves he is actually there.
  let doorOk = $state(false);
  let doorError = $state("");
  let scanning = $state(false);
  let doorCode = "";
  let video = $state<HTMLVideoElement | null>(null);
  let stream: MediaStream | null = null;
  let loop = 0;
  let checking = false;
  let canvas: HTMLCanvasElement | null = null;

  onMount(async () => {
    token = new URLSearchParams(location.search).get("k")?.trim() ?? "";
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

  onDestroy(stopCamera);

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

  // Centre 70% at 720 px, then the whole frame at 800 px — same tuning that
  // reads the admin scanner reliably on phones.
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
    doorError = "";
    if (!window.isSecureContext) {
      doorError = "الكاميرا تحتاج رابط https.";
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      doorError = "هذا المتصفح لا يسمح بالكاميرا.";
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
    } catch {
      doorError = "تعذّر فتح الكاميرا. اسمح بالوصول ثم أعد المحاولة.";
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

  async function acceptDoor(raw: string) {
    const value = raw.trim();
    // Scanning the ticket instead of the poster is the usual mistake.
    if (/checkin\/?\?/i.test(value) || /SX-[A-Z0-9]{4,}/i.test(value)) {
      doorError = "هذا رمز تذكرتك — امسح رمز البوابة المعلّق عند المدخل.";
      return;
    }
    if (!supabase || checking) return;
    checking = true;
    const { data, error } = await supabase.rpc("checkin_door", { p_door: value });
    checking = false;
    if (error) {
      doorError = "تعذّر التحقق، أعد المحاولة.";
      return;
    }
    if (!data) {
      doorError = "رمز البوابة غير صحيح، حاول مرة أخرى.";
      return;
    }
    doorCode = value;
    stopCamera();
    doorError = "";
    doorOk = true;
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
    state = "done";
  }
</script>

<div class="checkin">
  <p class="kicker">مؤتمر كسلا للإنتان</p>

  {#if state === "loading"}
    <h1>جارٍ التحقق...</h1>
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
      <p class="door-ok"><span aria-hidden="true">✓</span> تم التحقق من البوابة</p>
      <button class="btn" type="button" disabled={busy} onclick={confirm}>تأكيد الحضور</button>
    {:else}
      <p class="note">لتسجيل حضورك امسح رمز البوابة المعلّق عند المدخل.</p>
      {#if scanning}
        <div class="scan">
          <video bind:this={video} playsinline muted></video>
        </div>
        <p class="scan-tip">وجّه الكاميرا نحو رمز البوابة</p>
        <button class="btn btn--ghost" type="button" onclick={stopCamera}>إيقاف الكاميرا</button>
      {:else}
        <button class="btn" type="button" onclick={startDoorScan}>امسح رمز البوابة</button>
      {/if}
      {#if doorError}<p class="error">{doorError}</p>{/if}
    {/if}
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

  .door-ok {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
  }

  .error {
    margin: 0;
    font-size: 0.875rem;
    color: var(--accent);
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