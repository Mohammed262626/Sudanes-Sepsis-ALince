<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "../lib/supabase";

  type Row = Record<string, string>;

  const tabs = [
    { id: "conference_registrations", label: "التسجيلات" },
    { id: "contact_messages", label: "الرسائل" },
    { id: "donation_interests", label: "الدعم" },
  ];

  const columns: Record<string, { key: string; label: string }[]> = {
    conference_registrations: [
      { key: "created_at", label: "التاريخ" },
      { key: "name", label: "الاسم" },
      { key: "email", label: "البريد" },
      { key: "phone", label: "الهاتف" },
      { key: "role", label: "الصفة" },
      { key: "organization", label: "الجهة" },
      { key: "note", label: "ملاحظات" },
    ],
    contact_messages: [
      { key: "created_at", label: "التاريخ" },
      { key: "name", label: "الاسم" },
      { key: "email", label: "البريد" },
      { key: "message", label: "الرسالة" },
    ],
    donation_interests: [
      { key: "created_at", label: "التاريخ" },
      { key: "name", label: "الاسم" },
      { key: "email", label: "البريد" },
      { key: "support_type", label: "نوع الدعم" },
      { key: "note", label: "ملاحظات" },
    ],
  };

  let loading = $state(true);
  let tab = $state(tabs[0].id);
  let data = $state<Record<string, Row[]>>({});
  let failed = $state(false);
  let userEmail = $state("");

  const dateFmt = new Intl.DateTimeFormat("ar-SD", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  onMount(async () => {
    if (!supabase) return;
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      location.replace("/admin/login");
      return;
    }
    userEmail = session.session.user.email ?? "";

    const results = await Promise.all(
      tabs.map((t) =>
        supabase
          .from(t.id)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ),
    );

    const next: Record<string, Row[]> = {};
    results.forEach((r, i) => {
      if (r.error) failed = true;
      next[tabs[i].id] = r.data ?? [];
    });
    data = next;
    loading = false;
  });

  async function signOut() {
    await supabase?.auth.signOut();
    location.replace("/admin/login");
  }

  const rows = $derived(data[tab] ?? []);
  const cols = $derived(columns[tab]);
</script>

<div class="admin-head">
  <p class="kicker">لوحة التحكم</p>
  <div class="admin-user">
    <span dir="ltr">{userEmail}</span>
    <button class="btn btn--ghost" type="button" onclick={signOut}>
      خروج
    </button>
  </div>
</div>

{#if loading}
  <p>جارٍ التحميل…</p>
{:else if failed}
  <p class="form-status" data-state="error">
    تعذّر تحميل البيانات. تحقق من صلاحيات الحساب.
  </p>
{:else}
  <div class="tabs" role="tablist">
    {#each tabs as t (t.id)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === t.id}
        class:active={tab === t.id}
        onclick={() => (tab = t.id)}
      >
        {t.label} <span class="tab-count">{data[t.id]?.length ?? 0}</span>
      </button>
    {/each}
  </div>

  {#if rows.length === 0}
    <p>لا توجد سجلات بعد.</p>
  {:else}
    <div class="table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            {#each cols as c (c.key)}
              <th>{c.label}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr>
              {#each cols as c (c.key)}
                <td class={c.key === "email" ? "ltr" : ""}>
                  {c.key === "created_at"
                    ? dateFmt.format(new Date(row.created_at))
                    : row[c.key] || "—"}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}