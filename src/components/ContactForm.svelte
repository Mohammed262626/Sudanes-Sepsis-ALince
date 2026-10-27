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
    const { error } = await supabase.from("contact_messages").insert({
      name: String(data.get("name")).trim(),
      email: String(data.get("email")).trim(),
      message: String(data.get("message")).trim(),
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
    <label for="c-name">الاسم</label>
    <input id="c-name" name="name" required maxlength="200" autocomplete="name" />
  </div>
  <div class="field">
    <label for="c-email">البريد الإلكتروني</label>
    <input
      id="c-email"
      name="email"
      type="email"
      required
      maxlength="320"
      autocomplete="email"
      dir="ltr"
    />
  </div>
  <div class="field">
    <label for="c-message">رسالتك</label>
    <textarea id="c-message" name="message" required maxlength="4000"
    ></textarea>
  </div>
  <button class="btn" type="submit" disabled={state === "sending"}>
    {state === "sending" ? "جارٍ الإرسال…" : "إرسال الرسالة"}
  </button>
  <p
    class="form-status"
    data-state={state === "ok" || state === "error" ? state : undefined}
    aria-live="polite"
  >
    {state === "ok" ? "تم استلام رسالتك. سنتواصل معك قريباً." : ""}
    {state === "error" ? "تعذّر الإرسال. تحقق من اتصالك وحاول مرة أخرى." : ""}
  </p>
</form>
