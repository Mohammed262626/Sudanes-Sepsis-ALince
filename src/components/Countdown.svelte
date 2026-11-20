<script lang="ts">
  import { fetchEventConfig } from "../lib/event";

  let cfg = $state<Awaited<ReturnType<typeof fetchEventConfig>> | null>(null);

  $effect(() => {
    fetchEventConfig().then((c) => (cfg = c));
  });

  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
</script>

<div class="count" aria-label="ميعاد المؤتمر">
  {#if cfg}
    {#if cfg.soon}
      <p class="count-live">قريباً</p>
      <p class="count-deadline">نُعلن الموعد النهائي وتفاصيل التسجيل قريباً.</p>
    {:else if cfg.eventDate <= now}
      <p class="count-live">بدأ المؤتمر</p>
    {:else}
      <p class="count-label">يبدأ المؤتمر بعد</p>
      <p class="count-days">
        <span>{Math.floor((cfg.eventDate - now) / 86_400_000)}</span> يوم
      </p>
      <p class="count-clock" dir="ltr" aria-hidden="true">
        {String(Math.floor((cfg.eventDate - now) / 3_600_000) % 24).padStart(2, "0")}:
        {String(Math.floor((cfg.eventDate - now) / 60_000) % 60).padStart(2, "0")}:
        {String(Math.floor((cfg.eventDate - now) / 1_000) % 60).padStart(2, "0")}
      </p>
      <p class="count-deadline">
        {#if now < cfg.regDeadline}
          التسجيل مفتوح حتى {new Date(cfg.regDeadline).toLocaleDateString("ar")}
        {:else}
          انتهت فترة التسجيل
        {/if}
      </p>
    {/if}
  {:else}
    <div aria-hidden="true">
      <span class="skel skel--on-accent" style="inline-size: 9rem; block-size: 0.875rem;"></span>
      <span class="skel skel--on-accent" style="inline-size: 12rem; block-size: 3rem; margin-block-start: 1rem;"></span>
      <span class="skel skel--on-accent" style="inline-size: 8rem; block-size: 1rem; margin-block-start: 1rem;"></span>
    </div>
  {/if}
</div>