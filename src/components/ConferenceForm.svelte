<script lang="ts">
  import { supabase } from "../lib/supabase";
  import { url } from "../lib/url";
  import { fetchEventConfig } from "../lib/event";

  let cfg = $state<Awaited<ReturnType<typeof fetchEventConfig>> | null>(null);

  $effect(() => {
    fetchEventConfig().then((c) => (cfg = c));
  });

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(id);
  });

  const open = $derived(cfg && !cfg.soon && now < cfg.regDeadline);
  let state = $state<"idle" | "sending" | "ok" | "error" | "closed">("idle");

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
</script>

{#if cfg && cfg.soon}
  <p>قريباً — يُفتح باب التسجيل عند الإعلان عن الموعد النهائي. للمزيد من المعلومات، <a href={url("#contact")}>تواصل معنا</a>.</p>
{:else if open}
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
        تم التسجيل بنجاح. سنرسل تفاصيل الحضور والتذكرة إلى بريدك قريباً.
      </p>
    {:else if state === "error" || state === "closed"}
      <p class="form-status" data-state="error">
        {state === "closed" ? "انتهت فترة التسجيل." : "تعذّر التسجيل. حاول مرة أخرى."}
      </p>
    {/if}
  </form>
{:else}
  <p>انتهت فترة التسجيل. للاستفسار، <a href={url("#contact")}>تواصل معنا</a>.</p>
{/if}