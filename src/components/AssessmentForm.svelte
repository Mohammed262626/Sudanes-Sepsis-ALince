<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "../lib/supabase";

  // shortcut: test questions, swap the array for the clinician-reviewed set.
  const QUESTIONS = [
    {
      id: "q1",
      text: "ما هو الإنتان (Sepsis)؟",
      options: [
        "استجابة الجسم الشديدة للعدوى، وقد تُهدّد الحياة",
        "نوع من الحساسية الموسمية",
        "ارتفاع الحرارة وحده دون عدوى",
      ],
    },
    {
      id: "q2",
      text: "أي مما يلي يستدعي الاشتباه الفوري بالإنتان؟",
      options: [
        "ضيق نفس أو تشوّش أو انخفاض ضغط مع عدوى",
        "سيلان أنف فقط",
        "ألم عضلي بسيط بعد مجهود",
      ],
    },
    {
      id: "q3",
      text: "كل ساعة تأخير في علاج الإنتان ترفع احتمال الوفاة.",
      options: ["صحيح", "غير صحيح"],
    },
    {
      id: "q4",
      text: "من هم الأكثر عرضة للإنتان؟",
      options: [
        "الأطفال والنساء الحوامل وكبار السن ومن نقص مناعتهم",
        "الرياضيون الشباب فقط",
        "لا أحد، الإنتان لا يفرّق بين الناس",
      ],
    },
    {
      id: "q5",
      text: "متى تُعطى المضادات الحيوية في الإنتان؟",
      options: [
        "خلال الساعة الأولى من الاشتباه",
        "بعد ظهور نتائج المزرعة فقط",
        "بعد أن يستقر ضغط المريض",
      ],
    },
    {
      id: "q6",
      text: "ما أهم ما يقلل الوفيات من الإنتان؟",
      options: [
        "التعرّف المبكر والعلاج السريع",
        "الانتظار حتى تتضح كل النتائج",
        "المسكّنات وخافضات الحرارة فقط",
      ],
    },
  ];

  type State =
    | "loading"
    | "invalid"
    | "notattended"
    | "closed"
    | "nopre"
    | "form"
    | "answered"
    | "submitted"
    | "error";

  let state = $state<State>("loading");
  let stage = $state<"pre" | "post">("pre");
  let name = $state("");
  let answers = $state<Record<string, number>>({});
  let busy = $state(false);

  const stageLabel = $derived(stage === "pre" ? "الأسسمنت الأولي" : "الأسسمنت النهائي");
  const ready = $derived(QUESTIONS.every((q) => typeof answers[q.id] === "number"));

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    const token = params.get("t")?.trim() ?? "";
    const s = params.get("s");
    if (!token || !supabase) {
      state = "invalid";
      return;
    }
    stage = s === "post" ? "post" : "pre";
    const { data, error } = await supabase.rpc("assessment_lookup", {
      p_token: token,
      p_stage: stage,
    });
    if (error) {
      state = "error";
      return;
    }
    const r = data as { ok?: boolean; reason?: string; name?: string; answered?: boolean };
    if (!r?.ok) {
      state =
        r?.reason === "not_attended"
          ? "notattended"
          : r?.reason === "closed"
            ? "closed"
            : r?.reason === "no_pre"
              ? "nopre"
              : "invalid";
      return;
    }
    name = r.name ?? "";
    state = r.answered ? "answered" : "form";
  });

  async function submit() {
    if (busy || !supabase || !ready) return;
    const params = new URLSearchParams(location.search);
    busy = true;
    const { data, error } = await supabase.rpc("assessment_submit", {
      p_token: params.get("t")?.trim() ?? "",
      p_stage: stage,
      p_answers: answers,
    });
    busy = false;
    const r = data as { ok?: boolean; reason?: string; answered?: boolean };
    if (error || !r?.ok) {
      state = r?.reason === "closed" ? "closed" : "error";
      return;
    }
    state = r.answered ? "answered" : "submitted";
  }
</script>

<div class="sheet">
  <p class="kicker">مؤتمر كسلا للإنتان</p>

  {#key state}
    <div class="block">
      {#if state === "loading"}
        <h1>جارٍ التحقق...</h1>
      {:else if state === "invalid"}
        <h1>رابط غير صالح</h1>
        <p class="note">افتح الصفحة من زر الأسسمنت في رسالة الواتساب التي وصلتك.</p>
      {:else if state === "notattended"}
        <h1>الأسسمنت للحاضرين فقط</h1>
        <p class="note">لم يُسجَّل حضورك بعد. سجّل حضورك عند الاستقبال ثم افتح الرابط من جديد.</p>
      {:else if state === "closed"}
        <h1>الأسسمنت مغلق حالياً</h1>
        <p class="note">سيُفتح في وقته، وستصلك رسالة على الواتساب عندما يصبح متاحاً.</p>
      {:else if state === "nopre"}
        <h1>أكمل الأسسمنت الأولي أولاً</h1>
        <p class="note">الأسسمنت النهائي يُفتح بعد إجابتك عن الأسئلة في بداية المؤتمر.</p>
      {:else if state === "answered"}
        <h1>أجبت عن هذا الأسسمنت</h1>
        <p class="note">{name} — شكراً لك، سُجّلت إجاباتك ولا يمكن تكرارها.</p>
      {:else if state === "submitted"}
        <div class="done">
          <span class="mark" aria-hidden="true">✓</span>
          <h1>تم إرسال إجاباتك</h1>
        </div>
        <p class="note">شكراً {name} — مشاركتك تساعدنا في قياس أثر المؤتمر.</p>
      {:else if state === "error"}
        <h1>تعذّر الإرسال</h1>
        <p class="note">تحقق من اتصالك ثم أعد تحميل الصفحة.</p>
      {:else}
        <h1>{stageLabel}</h1>
        <p class="note">
          {name} — {QUESTIONS.length} أسئلة قصيرة، اختر إجابة واحدة لكل سؤال.
        </p>

        <form
          class="questions"
          onsubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {#each QUESTIONS as q, i (q.id)}
            <fieldset>
              <legend><span class="n">{i + 1}</span>{q.text}</legend>
              {#each q.options as opt, oi (oi)}
                <label class="opt">
                  <input type="radio" name={q.id} value={oi} bind:group={answers[q.id]} />
                  <span>{opt}</span>
                </label>
              {/each}
            </fieldset>
          {/each}

          <button class="btn go" type="submit" disabled={!ready || busy}>
            {#if busy}
              جارٍ الإرسال...
            {:else if ready}
              إرسال الإجابات
            {:else}
              أجب عن جميع الأسئلة
            {/if}
          </button>
        </form>
      {/if}
    </div>
  {/key}

  <p class="brand">صفحة رسمية — التحالف السوداني للإنتان</p>
</div>

<style>
  .sheet {
    display: grid;
    gap: 0.9rem;
    inline-size: 100%;
    max-inline-size: 34rem;
    padding: 1.5rem 1.35rem;
    border: 2px solid var(--ink);
    background: var(--paper);
  }

  .kicker {
    margin: 0;
    font-size: 0.8125rem;
  }

  .block {
    display: grid;
    gap: 0.85rem;
    animation: fade 0.22s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.375rem;
    line-height: 1.35;
  }

  .note {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.75;
    color: var(--muted);
  }

  .questions {
    display: grid;
    gap: 1rem;
  }

  fieldset {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    display: flex;
    gap: 0.5rem;
    padding: 0;
    margin-block-end: 0.5rem;
    font-weight: 700;
    line-height: 1.6;
  }

  .n {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 1.5rem;
    block-size: 1.5rem;
    border: 2px solid var(--ink);
    font-size: 0.8125rem;
  }

  .opt {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.8rem;
    border: 2px solid var(--line);
    font-size: 0.9375rem;
    line-height: 1.6;
    cursor: pointer;
  }

  .opt:has(input:checked) {
    border-color: var(--ink);
  }

  .opt input {
    flex: none;
    inline-size: 1.1rem;
    block-size: 1.1rem;
    margin: 0.2rem 0 0;
    accent-color: var(--ink);
  }

  .btn {
    inline-size: 100%;
    min-block-size: 3.25rem;
    font-size: 1.0625rem;
    margin-block-start: 0.35rem;
  }

  .done {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .mark {
    display: grid;
    place-items: center;
    inline-size: 2.6rem;
    block-size: 2.6rem;
    border: 2px solid var(--ink);
    border-radius: 50%;
    font-size: 1.4rem;
    animation: fade 0.22s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .brand {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
