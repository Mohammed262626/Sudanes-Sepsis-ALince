<script lang="ts">
  import { EVENT, DEADLINE } from "../lib/event";

  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const remaining = $derived(Math.max(0, EVENT - now));
  const days = $derived(Math.floor(remaining / 86_400_000));
  const hours = $derived(Math.floor(remaining / 3_600_000) % 24);
  const minutes = $derived(Math.floor(remaining / 60_000) % 60);
  const seconds = $derived(Math.floor(remaining / 1_000) % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
</script>

<div class="count" aria-label="الوقت المتبقي حتى بدء المؤتمر">
  {#if remaining === 0}
    <p class="count-live">بدأ المؤتمر</p>
  {:else}
    <p class="count-label">يبدأ المؤتمر بعد</p>
    <p class="count-days"><span>{days}</span> يوم</p>
    <p class="count-clock" dir="ltr" aria-hidden="true">
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </p>
  {/if}
  <p class="count-deadline">
    {#if now < DEADLINE}
      التسجيل مفتوح حتى 3 نوفمبر 2026
    {:else}
      انتهت فترة التسجيل
    {/if}
  </p>
</div>
