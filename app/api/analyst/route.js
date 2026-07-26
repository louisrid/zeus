import { createClient } from "@supabase/supabase-js";

/* THE ANALYST. On-demand only: fires on an explicit press, never on a schedule. The key lives here
   on the server and never reaches the browser. Spend is a ledger, not an estimate of an estimate:
   every call writes what it cost, and the monthly cap is checked against the ledger before any
   tokens are spent. */

const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
const CAP = Number(process.env.ANALYST_MONTHLY_CAP_USD || 5);
// Estimated rates for the default model, dollars per million tokens. Overridable so a model change
// does not silently mis-price the ledger.
const IN_PER_M = Number(process.env.ANALYST_IN_PER_M || 0.10);
const OUT_PER_M = Number(process.env.ANALYST_OUT_PER_M || 0.40);

const RULES = `You are the FPLBot Analyst. Rules, in order:
1. Answer only from the payload and memory below. If something needed is absent, say so. Never estimate a number that is not given.
2. Projected points are called xP. Use the payload's figures verbatim, never rounded further.
3. Rank one is the objective. Judge every option by rank impact, not by comfort.
4. Ownership is template exposure, not quality. Say when a pick protects rank and when it can gain it.
5. Be direct. Verdict first, then the numbers behind it. No hedging language.
6. Flag risk plainly: minutes, availability, one-fixture samples.
7. Respect the model's stated limits. If the payload marks a figure interim or unscoreable, carry that caveat.
8. Keep it under 200 words unless the question genuinely needs more.`;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad request body." }, 400); }
  const { question, payload } = body || {};
  if (!question || !payload) return json({ ok: false, error: "A question and the payload are both required." }, 400);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ ok: false, error: "OPENROUTER_API_KEY is not set in Vercel. Settings, Environment Variables, then redeploy." }, 500);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const month = new Date().toISOString().slice(0, 7);

  // Cap check against the ledger, fail closed: no table means no spend.
  const spent = await sb.from("ai_spend").select("usd").eq("month", month);
  if (spent.error) return json({ ok: false, error: "The ai_spend table is missing. Run supabase/migration-019.sql once." }, 500);
  const monthSpend = (spent.data || []).reduce((a, r) => a + Number(r.usd), 0);
  if (monthSpend >= CAP) return json({ ok: false, error: `The monthly Analyst cap of $${CAP.toFixed(2)} is reached. It resets on the 1st.` }, 429);

  // Season memory, newest first. Optional: a missing table degrades to no memory, stated in the reply.
  const mem = await sb.from("analyst_memory").select("gw, note").order("created_at", { ascending: false }).limit(20);
  const memory = mem.error ? null : (mem.data || []).map((m) => `GW${m.gw ?? "-"}: ${m.note}`).join("\n");

  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: RULES + (memory ? `\n\nSEASON MEMORY:\n${memory}` : "") },
        { role: "user", content: `${payload}\n\nQUESTION: ${question}` },
      ],
      max_tokens: 700,
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return json({ ok: false, error: `OpenRouter ${r.status}. ${detail.slice(0, 200)}` }, 502);
  }
  const data = await r.json();
  const answer = data.choices?.[0]?.message?.content || "";
  const tin = data.usage?.prompt_tokens ?? null;
  const tout = data.usage?.completion_tokens ?? null;
  const usd = tin !== null && tout !== null
    ? Math.round(((tin * IN_PER_M + tout * OUT_PER_M) / 1e6) * 10000) / 10000
    : 0.01; // no usage returned: ledger a conservative penny rather than zero

  await sb.from("ai_spend").insert({ month, usd, tokens_in: tin, tokens_out: tout, model: MODEL });

  return json({
    ok: true,
    answer,
    usd,
    monthSpend: Math.round((monthSpend + usd) * 100) / 100,
    cap: CAP,
    model: MODEL,
    memoryLoaded: memory !== null,
  });
}
