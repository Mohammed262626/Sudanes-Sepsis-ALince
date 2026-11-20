<script lang="ts">
  import { fetchEventConfig } from "../lib/event";

  let cfg = $state<Awaited<ReturnType<typeof fetchEventConfig>> | null>(null);

  $effect(() => {
    fetchEventConfig().then((c) => (cfg = c));
  });
</script>

<div class="rows" role="list">
  {#if cfg}
    <div class="row" style="grid-template-columns: 8rem 1fr;" role="listitem">
      <span class="idx">التاريخ</span>
      <h3>{cfg.soon ? "يُعلن قريباً" : new Date(cfg.eventDate).toLocaleDateString("ar", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h3>
    </div>
    <div class="row" style="grid-template-columns: 8rem 1fr;" role="listitem">
      <span class="idx">الوقت</span>
      <h3>{cfg.soon ? "يُعلن قريباً" : cfg.eventTime}</h3>
    </div>
    <div class="row" style="grid-template-columns: 8rem 1fr;" role="listitem">
      <span class="idx">المكان</span>
      <h3>كسلا — يُعلن الموقع الدقيق لاحقاً</h3>
    </div>
    <div class="row" style="grid-template-columns: 8rem 1fr;" role="listitem">
      <span class="idx">التسجيل</span>
      <h3>{cfg.soon ? "يُفتح قريباً" : `مفتوح حتى ${new Date(cfg.regDeadline).toLocaleDateString("ar")}`}</h3>
    </div>
  {:else}
    {#each ["التاريخ", "الوقت", "المكان", "التسجيل"] as label (label)}
      <div class="row" style="grid-template-columns: 8rem 1fr;" role="listitem" aria-hidden="true">
        <span class="idx">{label}</span>
        <span class="skel" style="block-size: 1.25rem; inline-size: 60%;"></span>
      </div>
    {/each}
  {/if}
</div>