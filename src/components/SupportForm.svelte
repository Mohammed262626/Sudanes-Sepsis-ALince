<script lang="ts">
  import { supabase } from "../lib/supabase";

  let state = $state<"idle" | "sending" | "ok" | "error">("idle");

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!supabase) {
      state = "error";
      return;
    }
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    state = "sending";
    const { error } = await supabase.from("donation_interests").insert({
      name: String(data.get("name")).trim(),
      email: String(data.get("email")).trim(),
      support_type: String(data.get("support_type")),
      note: String(data.get("note")).trim(),
    });
    if (error) {
      state = "error";
    } else {
      form.reset();
      state = "ok";
    }
  }
</script>

<form class="form" onsubmit={submit}>
  <div class="field">
    <label for="s-name">الاسم</label>
    <input id="s-name" name="name" required maxlength="200" autocomplete="name" />
  </div>
  <div class="field">
    <label for="s-email">البريد الإلكتروني</label>
    <input
      id="s-email"
      name="email"
      type="email"
      required
      maxlength="320"
      autocomplete="email"
      dir="ltr"
    />
  </div>
  <div class="field">
    <label for="s-type">طريقة الدعم المفضلة</label>
    <select id="s-type" name="support_type" required>
      <option value="تحويل بنكي">تحويل بنكي</option>
      <option value="محفظة إلكترونية">محفظة إلكترونية</option>
      <option value="دعم عيني">دعم عيني</option>
      <option value="تطوع">تطوع</option>
    </select>
  </div>
  <div class="field">
    <label for="s-note">ملاحظات (اختياري)</label>
    <textarea id="s-note" name="note" maxlength="2000"></textarea>
  </div>
  <button class="btn" type="submit" disabled={state === "sending"}>
    {state === "sending" ? "جارٍ الإرسال…" : "سجّل اهتمامك"}
  </button>
  <p
    class="form-status"
    data-state={state === "ok" || state === "error" ? state : undefined}
    aria-live="polite"
  >
    {state === "ok" ? "شكراً لك. سنرسل لك تفاصيل الدعم فور جاهزيتها." : ""}
    {state === "error" ? "تعذّر الإرسال. تحقق من اتصالك وحاول مرة أخرى." : ""}
  </p>
</form>
