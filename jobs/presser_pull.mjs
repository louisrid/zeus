// B-05 · presser pipeline via OpenRouter (STATUS.md standing decision: OpenRouter replaces
// Anthropic direct for both the parser and the Analyst). Implements 02 §6.
//
// This is the ONLY module in the repo that talks to an AI provider. The engine, the evaluation
// services and every API route are arithmetic over stored output — the guard test in
// tests/guards.test.mjs asserts that and fails the build if it ever stops being true.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENROUTER_API_KEY,
//      optional PRESSER_MODEL (default a cheap instruct model), PRESSER_MAX_USD (default 0.25).

import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "url";

// The client is built lazily and main() runs only when this file is executed directly, so the
// pure parsing and validation functions can be imported by the test suite without side effects.
let _db = null;
const supabaseClient = () => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
};
const JOB = "presser_pull";
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.PRESSER_MODEL || "google/gemini-2.0-flash-001";
const MAX_USD = Number(process.env.PRESSER_MAX_USD || 0.25);

const SOURCES = [
  { name: "BBC Sport injuries", url: "https://www.bbc.co.uk/sport/football/premier-league/injuries" },
  { name: "Fantasy Football Scout team news", url: "https://www.fantasyfootballscout.co.uk/team-news/" },
  { name: "Sky Sports PL news", url: "https://www.skysports.com/premier-league-news" },
];

const SIGNALS = new Set(["out", "doubt", "rested", "confirmed"]);

const SYSTEM = `You extract structured Fantasy Premier League team-news signals from press text.
Output JSON only. No prose, no markdown fences, no commentary.
Schema:
{"signals":[{"player":"string, must match a name in the provided squad list exactly","team":"string","signal":"out|doubt|rested|confirmed","confidence":0.0,"expected_absence_gws":null,"summary":"one sentence, paraphrased in your own words, no quoted text","source_url":"string"}]}
Rules:
- signal semantics: out = ruled out; doubt = fitness or selection doubt; rested = rotation rest signalled; confirmed = manager-confirmed available or starting.
- confidence in [0,1] calibrated to the source language: "definitely out" is about 0.95, "we will assess him" is about 0.5.
- Only include a player if the text actually says something about his availability. Never infer from silence.
- summary must be your own paraphrase. Never reproduce sentences from the source.
- If the text contains penalty-taker or set-piece news, add it as a separate object with signal "confirmed" and begin the summary with "SET PIECE:".
- If nothing usable is present, return {"signals":[]}.`;

async function beat(status, message) {
  await supabaseClient().from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

/* Crude but dependency-free HTML to text: strip scripts/styles/tags, collapse whitespace. */
export function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function chunk(text, size = 9000) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/* Strict validation: unknown player or bad enum means the row is logged, never inserted. */
export function validateSignals(payload, nameToId, sourceUrl) {
  const good = [];
  const bad = [];
  const list = payload && Array.isArray(payload.signals) ? payload.signals : null;
  if (!list) return { good, bad: [{ reason: "no signals array" }] };
  for (const s of list) {
    if (!s || typeof s.player !== "string") { bad.push({ reason: "no player", row: s }); continue; }
    if (!SIGNALS.has(s.signal)) { bad.push({ reason: `bad signal "${s.signal}"`, row: s }); continue; }
    // typeof first: Number(null) is 0, which would silently turn a missing confidence into a
    // zero-weight signal and neutralise an "out" in the minutes model.
    if (typeof s.confidence !== "number" || !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1) {
      bad.push({ reason: "bad confidence", row: s });
      continue;
    }
    const conf = s.confidence;
    const id = nameToId.get(s.player.toLowerCase().trim());
    if (!id) { bad.push({ reason: `unknown player "${s.player}"`, row: s }); continue; }
    good.push({
      player_id: id,
      signal: s.signal,
      confidence: +conf.toFixed(2),
      summary: typeof s.summary === "string" ? s.summary.slice(0, 400) : null,
      source_url: typeof s.source_url === "string" && s.source_url.startsWith("http") ? s.source_url : sourceUrl,
      setPiece: typeof s.summary === "string" && s.summary.startsWith("SET PIECE:"),
    });
  }
  return { good, bad };
}

async function askOpenRouter(text, squadNames, gw, sourceUrl) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "X-Title": "FPLBot presser pipeline",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Gameweek: ${gw}\nSource: ${sourceUrl}\nSquad list (names you may use, exact):\n${squadNames.join(", ")}\n\nText:\n${text}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "{}";
  const usage = json.usage || {};
  let parsed = null;
  try {
    parsed = JSON.parse(content.replace(/^```json/i, "").replace(/```$/, "").trim());
  } catch {
    parsed = null;
  }
  return { parsed, usage, raw: content };
}

async function main() {
  if (!KEY) throw new Error("OPENROUTER_API_KEY missing");

  const { data: gwRow } = await supabase
    .from("gameweeks").select("gw").eq("finished", false).order("gw").limit(1).single();
  const gw = gwRow ? gwRow.gw : 1;

  const { data: players, error: pe } = await supabase
    .from("players").select("id, web_name, name, team_id").order("selected_by_pct", { ascending: false }).limit(800);
  if (pe) throw new Error("players: " + pe.message);
  const nameToId = new Map();
  for (const p of players) {
    nameToId.set(p.web_name.toLowerCase().trim(), p.id);
    nameToId.set(p.name.toLowerCase().trim(), p.id);
    const last = p.name.split(" ").slice(-1)[0];
    if (last && !nameToId.has(last.toLowerCase())) nameToId.set(last.toLowerCase(), p.id);
  }
  const squadNames = players.slice(0, 400).map((p) => p.web_name);
  const teamOf = new Map(players.map((p) => [p.id, p.team_id]));

  let inTokens = 0;
  let outTokens = 0;
  let inserted = 0;
  let rejected = 0;
  const rejectLog = [];

  for (const src of SOURCES) {
    let text;
    try {
      const html = await fetch(src.url, { headers: { "User-Agent": "FPLBot personal project" } }).then((r) => {
        if (!r.ok) throw new Error(`${src.name} ${r.status}`);
        return r.text();
      });
      text = toText(html);
    } catch (e) {
      rejectLog.push(`${src.name}: fetch failed (${e.message})`);
      continue;
    }
    if (text.length < 400) {
      rejectLog.push(`${src.name}: page had no usable text`);
      continue;
    }

    for (const part of chunk(text).slice(0, 2)) {
      const { parsed, usage } = await askOpenRouter(part, squadNames, gw, src.url);
      inTokens += usage.prompt_tokens || 0;
      outTokens += usage.completion_tokens || 0;
      const { good, bad } = validateSignals(parsed, nameToId, src.url);
      rejected += bad.length;
      for (const b of bad.slice(0, 5)) rejectLog.push(`${src.name}: ${b.reason}`);

      for (const g of good) {
        const { error } = await supabaseClient().from("presser_signals").insert({
          player_id: g.player_id, gw, signal: g.signal, confidence: g.confidence,
          source_url: g.source_url, summary: g.summary,
        });
        if (error) { rejected++; rejectLog.push(`insert: ${error.message}`); continue; }
        inserted++;
        if (g.setPiece) {
          await supabaseClient().from("set_piece_duty").upsert({
            team_id: teamOf.get(g.player_id), player_id: g.player_id, kind: "pen",
            rank: 1, as_of: new Date().toISOString(), source: "presser",
          }, { onConflict: "team_id,player_id,kind" });
        }
      }
    }
  }

  // Cost is reported, never estimated silently. Rates come from the response, tokens are real.
  const msg = `signals ${inserted} · rejected ${rejected} · tokens ${inTokens} in / ${outTokens} out · model ${MODEL}`;
  await beat(rejectLog.length && !inserted ? "error" : "ok", msg);
  console.log("PRESSER PULL — " + msg);
  if (rejectLog.length) console.log("Rejections (logged, not inserted):\n" + rejectLog.slice(0, 20).join("\n"));
  if (MAX_USD && outTokens > 0) console.log(`Cap reference: PRESSER_MAX_USD=${MAX_USD} per run; this run's token counts are above for reconciliation against the OpenRouter dashboard.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
}
