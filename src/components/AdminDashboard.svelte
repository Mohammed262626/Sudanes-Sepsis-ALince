<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "../lib/supabase";

  type Row = Record<string, string | number>;

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
      { key: "status", label: "الحالة" },
      { key: "ticket_code", label: "رمز التذكرة" },
      { key: "actions", label: "إجراء" },
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

  const statusLabels: Record<string, string> = {
    pending: "بانتظار القبول",
    approved: "مقبول",
    rejected: "مرفوض",
  };

  let busyId = $state(0);
  let actionError = $state("");

  // Admin-only: RLS lets only allowlisted emails update; the DB trigger sends the
  // approval message with the ticket QR (or the rejection message).
  async function decide(id: number, status: "approved" | "rejected") {
    if (!supabase || busyId) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("conference_registrations")
      .update({ status })
      .eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر تحديث الحالة. حاول مرة أخرى.";
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).map((r) =>
      r.id === id ? { ...r, status } : r,
    );
    data = { ...data };
  }

  // Re-sends the ticket QR for an approved registration (via the resend_ticket RPC).
  async function resend(id: number) {
    if (!supabase || busyId) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase.rpc("resend_ticket", { p_id: id });
    busyId = 0;
    if (error) actionError = "تعذّر إرسال التذكرة. حاول مرة أخرى.";
  }

  async function remove(id: number) {
    if (!supabase || busyId || !confirm("حذف هذا التسجيل نهائياً؟")) return;
    busyId = id;
    actionError = "";
    const { error } = await supabase
      .from("conference_registrations")
      .delete()
      .eq("id", id);
    busyId = 0;
    if (error) {
      actionError = "تعذّر الحذف. حاول مرة أخرى.";
      return;
    }
    data.conference_registrations = (data.conference_registrations ?? []).filter(
      (r) => r.id !== id,
    );
    data = { ...data };
  }

  async function load() {
    if (!supabase) return;
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      location.replace("/admin/login");
      return;
    }
    userEmail = session.session.user.email ?? "";
    loading = true;
    actionError = "";

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
  }

  onMount(load);

  async function signOut() {
    await supabase?.auth.signOut();
    location.replace("/admin/login");
  }

  const rows = $derived(data[tab] ?? []);
  const cols = $derived(columns[tab]);
</script>

<header class="admin-head">
  <div>
    <p class="kicker">لوحة التحكم</p>
    <h1>الطلبات والرسائل</h1>
  </div>
  <div class="admin-user">
    <button class="btn btn--ghost" type="button" onclick={load}>تحديث</button>
    <span dir="ltr">{userEmail}</span>
    <button class="btn btn--ghost" type="button" onclick={signOut}>
      خروج
    </button>
  </div>
</header>

{#if actionError}
  <p class="form-status" data-state="error">{actionError}</p>
{/if}

{#if loading}
  <div class="admin-loading" aria-busy="true" aria-label="جارٍ التحميل">
    <span></span><span></span><span></span><span></span>
  </div>
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
    <p class="admin-empty">لا توجد سجلات بعد.</p>
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
                  {#if c.key === "created_at"}
                    {dateFmt.format(new Date(row.created_at))}
                  {:else if c.key === "status"}
                    <span class="badge" data-status={row.status}>
                      {statusLabels[row.status] ?? row.status}
                    </span>
                  {:else if c.key === "actions"}
                    <div class="row-actions">
                      {#if row.status === "pending"}
                        <button
                          class="btn btn--sm"
                          type="button"
                          disabled={busyId === row.id}
                          onclick={() => decide(row.id, "approved")}
                        >
                          قبول
                        </button>
                        <button
                          class="btn btn--ghost btn--sm"
                          type="button"
                          disabled={busyId === row.id}
                          onclick={() => decide(row.id, "rejected")}
                        >
                          رفض
                        </button>
                      {:else if row.status === "approved"}
                        <button
                          class="btn btn--ghost btn--sm"
                          type="button"
                          disabled={busyId === row.id}
                          onclick={() => resend(row.id)}
                        >
                          إعادة الإرسال
                        </button>
                      {/if}
                      <button
                        class="btn btn--ghost btn--sm"
                        type="button"
                        disabled={busyId === row.id}
                        onclick={() => remove(row.id)}
                      >
                        حذف
                      </button>
                    </div>
                  {:else}
                    {row[c.key] || "—"}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}