<script lang="ts">
  import { supabase } from "../lib/supabase";

  let email = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) location.replace("/admin");
    });
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!supabase) {
      error = "تعذّر الاتصال بالخادم.";
      return;
    }
    busy = true;
    error = "";
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    busy = false;
    if (authError) {
      error = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
      return;
    }
    location.replace("/admin");
  }
</script>

<form class="form" onsubmit={submit}>
  <div class="field">
    <label for="a-email">البريد الإلكتروني</label>
    <input
      id="a-email"
      type="email"
      bind:value={email}
      required
      autocomplete="username"
      dir="ltr"
    />
  </div>
  <div class="field">
    <label for="a-pass">كلمة المرور</label>
    <input
      id="a-pass"
      type="password"
      bind:value={password}
      required
      autocomplete="current-password"
      dir="ltr"
    />
  </div>
  <button class="btn" type="submit" disabled={busy}>
    {busy ? "جارٍ الدخول…" : "تسجيل الدخول"}
  </button>
  <p class="form-status" data-state="error" aria-live="polite">{error}</p>
</form>
