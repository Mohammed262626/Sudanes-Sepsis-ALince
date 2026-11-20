<script lang="ts">
  import { supabase } from "../lib/supabase";
  import { fetchEventConfig } from "../lib/event";

  const contactEmail = "mailto:info@sudansepsisalliance.com";

  let cfg = $state<Awaited<ReturnType<typeof fetchEventConfig>> | null>(null);

  $effect(() => {
    fetchEventConfig().then((c) => (cfg = c));
  });

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(id);
  });

  // Registration opens on the admin toggle (reg_open), not the soon flag.
  const open = $derived(cfg && cfg.regOpen && now < cfg.regDeadline);
  let state = $state<"idle" | "sending" | "ok" | "error" | "closed">("idle");
  let waitState = $state<"idle" | "sending" | "ok" | "error" | "exists">("idle");

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!supabase || !open) {
      state = open ? "error" : "closed";
      return;
    }
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    state = "sending";
    const { error } = await supabase.from("conference_registrations").insert({
      name: String(data.get("name")).trim(),
      email: String(data.get("email")).trim(),
      phone: String(data.get("phone")).trim(),
      role: String(data.get("role")),
      organization: String(data.get("organization")).trim() || null,
      note: String(data.get("note")).trim() || null,
    });
    if (error) {
      state = "error";
    } else {
      form.reset();
      state = "ok";
    }
  }

  // Waitlist while registration is closed: name + email only. Duplicates are
  // dropped by the unique email constraint inside register_notify.
  async function submitWait(event: SubmitEvent) {
    event.preventDefault();
    if (!supabase) {
      waitState = "error";
      return;
    }
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    waitState = "sending";
    const { data: res, error } = await supabase.rpc("register_notify", {
      p_name: String(data.get("n-name") ?? "").trim(),
      p_email: String(data.get("n-email") ?? "").trim(),
    });
    if (error || !res?.ok) {
      waitState = "error";
      return;
    }
    form.reset();
    waitState = res.inserted ? "ok" : "exists";
  }
</script>

{#if cfg === null}
  <div class="form-skel" aria-hidden="true">
    <span class="skel" style="block-size: 2.75rem;"></span>
    <span class="skel" style="block-size: 2.75rem;"></span>
    <span class="skel" style="block-size: 2.75rem;"></span>
    <span class="skel" style="inline-size: 10rem; block-size: 3rem;"></span>
  </div>
{:else if cfg && open}
  <form class="form" onsubmit={submit}>
    <div class="field">
      <label for="k-name">الاسم الكامل</label>
      <input id="k-name" name="name" required maxlength="200" autocomplete="name" />
    </div>
    <div class="field">
      <label for="k-email">البريد الإلكتروني</label>
      <input
        id="k-email"
        name="email"
        type="email"
        required
        maxlength="320"
        autocomplete="email"
        dir="ltr"
      />
    </div>
    <div class="field">
      <label for="k-phone">رقم الهاتف</label>
      <input
        id="k-phone"
        name="phone"
        type="tel"
        required
        maxlength="20"
        autocomplete="tel"
        dir="ltr"
      />
    </div>
    <div class="field">
      <label for="k-role">الصفة</label>
      <select id="k-role" name="role" required>
        <option value="">— اختر —</option>
        <option value="طبيب">طبيب/طبيبة</option>
        <option value="ممرض">ممرض/ممرضة</option>
        <option value="صيدلي">صيدلي/صيدلانية</option>
        <option value="طالب">طالب/طالبة طب</option>
        <option value="باحث">باحث/باحثة</option>
        <option value="إعلامي">إعلامي/إعلامية</option>
        <option value="صانع قرار">صانع/صانعة قرار</option>
        <option value="منظمة">منظمة غير حكومية</option>
        <option value="مهتم">مهتم/مهتمة</option>
      </select>
    </div>
    <div class="field">
      <label for="k-org">الجهة (اختياري)</label>
      <input id="k-org" name="organization" maxlength="300" autocomplete="organization" />
    </div>
    <div class="field">
      <label for="k-note">ملاحظات (اختياري)</label>
      <textarea id="k-note" name="note" maxlength="2000"></textarea>
    </div>
    <button class="btn" type="submit">
      {state === "sending" ? "جارٍ التسجيل…" : "تسجيل"}
    </button>
    {#if state === "ok"}
      <p class="form-status" data-state="ok">
        وصلنا طلبك. بعد الاعتماد تصلك تذكرة الدخول برمز QR عبر واتساب.
      </p>
    {:else if state === "error" || state === "closed"}
      <p class="form-status" data-state="error">
        {state === "closed" ? "انتهت فترة التسجيل." : "تعذّر التسجيل. حاول مرة أخرى."}
      </p>
    {/if}
  </form>
{:else if cfg && now < cfg.regDeadline}
  <!-- Registration not open yet, deadline not passed: capture a waitlist. -->
  <div class="waitlist">
    <p>
      {cfg.soon
        ? "قريباً — يُفتح باب التسجيل عند الإعلان عن الموعد النهائي."
        : "باب التسجيل مغلق الآن."}
      أعلمنا بتسجيلك وسنخبرك فور بدء التسجيل.
    </p>
    <form class="form" onsubmit={submitWait}>
      <div class="field">
        <label for="n-name">الاسم</label>
        <input id="n-name" name="n-name" required maxlength="200" autocomplete="name" />
      </div>
      <div class="field">
        <label for="n-email">البريد الإلكتروني</label>
        <input
          id="n-email"
          name="n-email"
          type="email"
          required
          maxlength="320"
          autocomplete="email"
          dir="ltr"
        />
      </div>
      <button class="btn" type="submit" disabled={waitState === "sending"}>
        {waitState === "sending" ? "جارٍ الحفظ…" : "أعلمني عند بدء التسجيل"}
      </button>
      {#if waitState === "ok"}
        <p class="form-status" data-state="ok">
          سجّلنا بريدك — سنرسل لك رسالة فور بدء التسجيل.
        </p>
      {:else if waitState === "exists"}
        <p class="form-status" data-state="ok">
          بريدك مسجّل لدينا مسبقاً — سنخبرك فور بدء التسجيل.
        </p>
      {:else if waitState === "error"}
        <p class="form-status" data-state="error">
          تعذّر الحفظ. تحقق من البريد وحاول مرة أخرى.
        </p>
      {/if}
    </form>
  </div>
{:else if cfg !== null}
  <p>انتهت فترة التسجيل. للاستفسار، <a href={contactEmail}>تواصل معنا</a>.</p>
{/if}