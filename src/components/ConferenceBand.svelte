<script lang="ts">
  import { EVENT, DEADLINE } from "../lib/event";
  import { url } from "../lib/url";

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

{#if remaining > 0}
  <section class="conf-band" aria-label="مؤتمر كسلا للإنتان">
    <div class="wrap conf-band-inner">
      <a class="conf-band-title" href={url("conference")}>
        <strong>مؤتمر كسلا للإنتان</strong>
        <span>16 نوفمبر 2026 · 9:00 صباحاً · كسلا</span>
      </a>
      <p class="conf-band-count">
        متبقٍ {days} يوم
        <span class="conf-clock" dir="ltr" aria-hidden="true">
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </span>
      </p>
      <a class="btn btn--light" href={url("conference")}>
        {now < DEADLINE ? "سجّل حضورك" : "تفاصيل المؤتمر"}
      </a>
    </div>
  </section>
{/if}
