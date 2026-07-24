// A-09 · The Odds API → odds_snapshots + implied_goals, with credit accounting in api_credits.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const JOB = "odds_pull";
const KEY = process.env.ODDS_API_KEY;

async function beat(status, message) {
  await supabase.from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}
const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null;
};
// Poisson helpers for implied goals
const pois = (k, l) => Math.exp(-l) * Math.pow(l, k) / [1,1,2,6,24,120,720,5040,40320,362880,3628800][k];
export function gridProbs(lh, la, cap = 10) {
  let pH = 0, pD = 0, pA = 0, over = 0;
  for (let h = 0; h <= cap; h++) for (let a = 0; a <= cap; a++) {
    const p = pois(h, lh) * pois(a, la);
    if (h > a) pH += p; else if (h === a) pD += p; else pA += p;
    if (h + a > 2.5) over += p;
  }
  return { pH, pD, pA, over };
}
// fit lambdas to de-overrounded market probs (proportional method)
export function impliedLambdas(oH, oD, oA, oOver, oUnder) {
  const inv = [1 / oH, 1 / oD, 1 / oA];
  const s = inv[0] + inv[1] + inv[2];
  const [pH, , pA] = [inv[0] / s, inv[1] / s, inv[2] / s];
  let pOver = null;
  if (oOver && oUnder) { const t = 1 / oOver + 1 / oUnder; pOver = (1 / oOver) / t; }
  let best = { err: 1e9, lh: 1.3, la: 1.1 };
  for (let lt = 1.6; lt <= 4.4; lt += 0.05) {
    for (let d = -1.6; d <= 1.6; d += 0.05) {
      const lh = (lt + d) / 2, la = (lt - d) / 2;
      if (lh <= 0.05 || la <= 0.05) continue;
      const g = gridProbs(lh, la);
      let err = (g.pH - pH) ** 2 + (g.pA - pA) ** 2;
      if (pOver !== null) err += (g.over - pOver) ** 2;
      if (err < best.err) best = { err, lh, la };
    }
  }
  return { lambda_home: +best.lh.toFixed(3), lambda_away: +best.la.toFixed(3), fit_residual: +Math.sqrt(best.err).toFixed(5) };
}

const ALIAS = { "manchester city": "man city", "manchester united": "man utd", "tottenham hotspur": "spurs",
  "nottingham forest": "nott'm forest", "newcastle united": "newcastle", "wolverhampton wanderers": "wolves",
  "brighton and hove albion": "brighton", "west ham united": "west ham", "leeds united": "leeds",
  "afc bournemouth": "bournemouth" };
const norm = (n) => { const l = (n || "").toLowerCase(); return ALIAS[l] || l; };

async function main() {
  if (!KEY) throw new Error("ODDS_API_KEY missing");
  const url = `https://api.the-odds-api.com/v4/sports/soccer_epl/odds/?apiKey=${KEY}&regions=eu,uk&markets=h2h,totals&oddsFormat=decimal`;
  const res = await fetch(url);
  const used = res.headers.get("x-requests-used"), remaining = res.headers.get("x-requests-remaining");
  if (!res.ok) throw new Error(`odds api ${res.status}`);
  const events = await res.json();
  await supabase.from("api_credits").insert({ source: "the-odds-api", used: used ? +used : null, remaining: remaining ? +remaining : null });

  const { data: teams } = await supabase.from("teams").select("id, name").eq("archive", false);
  const teamId = {}; for (const t of teams) teamId[norm(t.name)] = t.id;
  const { data: fixtures } = await supabase.from("fixtures").select("id, home_team, away_team, kickoff_utc, finished")
    .eq("season", "2026-27").eq("finished", false);

  let wrote = 0;
  for (const ev of events) {
    const h = teamId[norm(ev.home_team)], a = teamId[norm(ev.away_team)];
    if (!h || !a) continue;
    const fx = (fixtures || []).find((f) => f.home_team === h && f.away_team === a &&
      Math.abs(new Date(f.kickoff_utc) - new Date(ev.commence_time)) < 36e5 * 26);
    if (!fx) continue;
    const H = [], D = [], A = [], O = [], U = [];
    for (const bk of ev.bookmakers || []) {
      for (const m of bk.markets || []) {
        if (m.key === "h2h") for (const o of m.outcomes) {
          if (o.name === ev.home_team) H.push(o.price);
          else if (o.name === ev.away_team) A.push(o.price);
          else D.push(o.price);
        }
        if (m.key === "totals") for (const o of m.outcomes) {
          if (o.point === 2.5 && o.name === "Over") O.push(o.price);
          if (o.point === 2.5 && o.name === "Under") U.push(o.price);
        }
      }
    }
    if (!H.length || !D.length || !A.length) continue;
    const snap = { fixture_id: fx.id, source: "the-odds-api", bookmaker: "median",
      h: median(H), d: median(D), a: median(A), over25: median(O), under25: median(U) };
    const { data: sRow, error } = await supabase.from("odds_snapshots").insert(snap).select("id").single();
    if (error) throw new Error("odds_snapshots: " + error.message);
    const lam = impliedLambdas(snap.h, snap.d, snap.a, snap.over25, snap.under25);
    await supabase.from("implied_goals").insert({
      fixture_id: fx.id, odds_snapshot_id: sRow.id,
      lambda_home: lam.lambda_home, lambda_away: lam.lambda_away,
      deoverround_method: "proportional", fit_residual: lam.fit_residual,
    });
    wrote++;
  }
  await beat("ok", `fixtures priced ${wrote} · credits remaining ${remaining ?? "?"}`);
  console.log(`odds: ${wrote} fixtures priced, credits remaining ${remaining}`);
}
main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
