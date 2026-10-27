<script lang="ts">
  import { supabase } from "../lib/supabase";

  const DEADLINE = new Date("2026-11-03T23:59:59+02:00").getTime();

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(id);
  });

  const open = $derived(now < DEADLINE);
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

{#if open}
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
        minlength="6"
        maxlength="30"
        autocomplete="tel"
        dir="ltr"
      />
    </div>
    <div class="field">
      <label for="k-role">الصفة</label>
      <select id="k-role" name="role" required>
        <option value="طبيب">طبيب</option>
        <option value="ممرض">ممرض</option>
        <option value="صيدلي">صيدلي</option>
        <option value="طالب">طالب</option>
        <option value="إدارة صحية">إدارة صحية</option>
        <option value="أخرى">أخرى</option>
      </select>
    </div>
    <div class="field">
      <label for="k-org">الجهة / المؤسسة (اختياري)</label>
      <input id="k-org" name="organization" maxlength="200" />
    </div>
    <div class="field">
      <label for="k-note">ملاحظات (اختياري)</label>
      <textarea id="k-note" name="note" maxlength="2000"></textarea>
    </div>
    <button class="btn" type="submit" disabled={state === "sending"}>
      {state === "sending" ? "جارٍ التسجيل…" : "سجّل حضورك"}
    </button>
    <p
      class="form-status"
      data-state={state === "ok" || state === "error" ? state : undefined}
      aria-live="polite"
    >
      {state === "ok" ? "تم تسجيلك. سنرسل لك تفاصيل الحضور قريباً." : ""}
      {state === "error" ? "تعذّر التسجيل. تحقق من بياناتك وحاول مرة أخرى." : ""}
    </p>
  </form>
{:else}
  <p>
    انتهت فترة التسجيل في 3 نوفمبر 2026. للاستفسار،
    <a href="/#contact">تواصل معنا</a>.
  </p>
{/if}
