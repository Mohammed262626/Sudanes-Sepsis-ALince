<script lang="ts">
  import { url } from "../lib/url";
  import { fetchEventConfig } from "../lib/event";
  import type { EventConfig } from "../lib/event";

  let cfg = $state<EventConfig | null>(null);

  $effect(() => {
    fetchEventConfig().then((c) => (cfg = c));
  });

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
</script>

{#if cfg && cfg.bandEnabled}
  <section class="conf-band" aria-label="مؤتمر كسلا للتسمم الدموي">
    <div class="wrap conf-band-inner">
      <a class="conf-band-title" href={url("conference")}>
        <strong>مؤتمر كسلا للتسمم الدموي</strong>
        {#if !cfg.soon}
          <span>{cfg.eventTime}</span>
        {:else}
          <span>قريباً</span>
        {/if}
      </a>
      {#if !cfg.soon}
        <p class="conf-band-count">
          متبقٍ {Math.max(0, Math.floor((cfg.eventDate - now) / 86_400_000))} يوم
          <span class="conf-clock" dir="ltr" aria-hidden="true">
            {String(Math.max(0, Math.floor((cfg.eventDate - now) / 3_600_000) % 24)).padStart(2, "0")}:
            {String(Math.max(0, Math.floor((cfg.eventDate - now) / 60_000) % 60)).padStart(2, "0")}:
            {String(Math.max(0, Math.floor((cfg.eventDate - now) / 1_000) % 60)).padStart(2, "0")}
          </span>
        </p>
        <a class="btn btn--light" href={url("conference")}>
          {now < cfg.regDeadline ? "سجّل حضورك" : "تفاصيل المؤتمر"}
        </a>
      {:else}
        <a class="btn btn--light" href={url("conference")}>التفاصيل</a>
      {/if}
    </div>
  </section>
{:else if cfg === null}
  <section class="conf-band" aria-hidden="true">
    <div class="wrap conf-band-inner">
      <span class="skel skel--on-accent" style="inline-size: 14rem; block-size: 1.25rem;"></span>
      <span class="skel skel--on-accent" style="inline-size: 7rem; block-size: 2.5rem;"></span>
    </div>
  </section>
{/if}