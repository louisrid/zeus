/* GW1 PREVIEW AND NAMED-PLAYER SANITY CHECK.
 *
 * Real fixtures from the FPL API, per-player history from last season's public archive, the actual engine
 * end to end, no database needed. Run before any gameweek one to see whether the numbers pass the eye test
 * against real opponents. Two bugs were caught by exactly this in July 2026: a promoted club's entire attack
 * concentrated onto its two players with a Premier League record (Diop, a centre-back, projected 9.3 and top
 * of the league), and new signings priced as players their club never picks, so the lineup sampler benched
 * real starters for them.
 *
 * Usage: download last season's merged_gw.csv, then
 *   ARCHIVE=/path/merged_gw.csv node jobs/gw1_preview.mjs
 * Optional PLAYERS="palmer,neto,haaland" for the named batch. Requires network for the FPL API.
 */
import { readFileSync } from "node:fs";
import { parseCsv, mapRow } from "./history_load.mjs";
import { positionalSharePriors, allocateTeam, deriveAssistWeights } from "../lib/engine/layer2_allocation.mjs";
import { forecastMinutes, leagueMinutesMeans } from "../lib/engine/layer3_minutes.mjs";
import { simulateFixture, summarise } from "../lib/engine/layer4_sim.mjs";
import { scoringTable, squadRules } from "../lib/engine/points.mjs";
import { engineConfig } from "../lib/engine/config.mjs";
import { fallbackGoalEnvironment } from "../lib/engine/layer0_market.mjs";
import { deriveBpsOffsets } from "../lib/bps_engine.mjs";

const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url), "utf8"));
const cfg = engineConfig(JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url), "utf8")));
cfg.formation = squadRules(rules).formation;
const table = scoringTable(rules);

const boot = await (await fetch("https://fantasy.premierleague.com/api/bootstrap-static/")).json();
const fixtures = await (await fetch("https://fantasy.premierleague.com/api/fixtures/?event=" + (process.env.GW || 1))).json();
const teamName = Object.fromEntries(boot.teams.map((t) => [t.id, t.name]));
let teamStrength = {}; // filled from the archive below, pre-season API strengths are all zero
const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

// Last season's archive, aggregated per player by name.
const rows = [];
for (const r of parseCsv(readFileSync(process.env.ARCHIVE || "/tmp/gw2526.csv", "utf8"))) { const m = mapRow("2025-26", r, null); if (m) rows.push(m); }
cfg.bpsOffset = deriveBpsOffsets(rows, rules);
cfg.assistWeight = deriveAssistWeights(rows);
const hist = new Map();
for (const r of rows) {
  const k = r.player_name.toLowerCase();
  hist.set(k, hist.get(k) || []);
  hist.get(k).push(r);
}
const agg = (list) => {
  const mins = list.reduce((s, r) => s + r.minutes, 0);
  if (mins < 90) return null;
  const n = mins / 90;
  const f = (fn) => list.reduce((s, r) => s + (fn(r) || 0), 0);
  return {
    nineties: n, minutes: mins,
    appearances: list.filter((r) => r.minutes > 0).length,
    starts: list.filter((r) => r.started).length,
    starts60: list.filter((r) => r.started && r.minutes >= 60).length,
    startMinutes: list.filter((r) => r.started).reduce((s, r) => s + r.minutes, 0),
    cameos: list.filter((r) => !r.started && r.minutes > 0).length,
    cameoMinutes: list.filter((r) => !r.started && r.minutes > 0).reduce((s, r) => s + r.minutes, 0),
    teamGames: list.length, teamMinutesAvailable: list.length * 90,
    npxg90: f((r) => r.xg) / n, xa90: f((r) => r.xa) / n, saves90: f((r) => r.saves) / n,
    bps90: f((r) => r.bps) / n, cbit90: f((r) => r.cbit) / n, recoveries90: f((r) => r.recoveries) / n,
    goals: f((r) => r.goals), assists: f((r) => r.assists), xg: f((r) => r.xg), xa: f((r) => r.xa),
    yellow90: f((r) => r.yellow) / n,
  };
};

// League goals per match from last season for the goal environment.
const totalGoals = rows.reduce((s, r) => s + (r.goals || 0), 0);
const leagueTotal = 2.77;

// Strengths from last season's results: scored+0.4 over conceded+0.4 per match, same bounds as the backtest.
const clubGoals = {};
const seen = new Set();
for (const r of rows) {
  const k = `${r.gw}|${r.team}`;
  clubGoals[r.team] ??= { scored: 0, conceded: 0, matches: 0 };
  if (!seen.has(k)) { seen.add(k); clubGoals[r.team].matches++; clubGoals[r.team].conceded += r.goals_conceded > 0 && r.position === "GKP" ? 0 : 0; }
}
// scored: sum player goals per club; conceded: from GK rows
for (const r of rows) { clubGoals[r.team].scored += r.goals || 0; if (r.position === "GKP" && r.minutes >= 60) clubGoals[r.team].conceded += r.goals_conceded || 0; }
const strengths = {};
for (const [club, v] of Object.entries(clubGoals)) if (v.matches >= 20)
  strengths[club] = Math.max(0.5, Math.min(2.5, ((v.scored / v.matches) + 0.4) / ((v.conceded / v.matches) + 0.4)));
const promotedStrength = 0.62; // the archive's own bottom-three average, the standard promoted prior
for (const t of boot.teams) teamStrength[t.id] = strengths[t.name] ?? promotedStrength;

const league = leagueMinutesMeans([...hist.values()].map(agg).filter(Boolean));

const results = new Map();
for (const fx of fixtures) {
  const sides = [];
  for (const [tid, isHome] of [[fx.team_h, true], [fx.team_a, false]]) {
    const squad = boot.elements.filter((e) => e.team === tid && e.status !== "u");
    const players = squad.map((e) => {
      const nm = `${e.first_name} ${e.second_name}`.toLowerCase();
      const h = agg(hist.get(nm) || hist.get(e.web_name.toLowerCase()) || []);
      return {
        id: e.id, player_id: e.id, name: `${e.first_name} ${e.second_name}`, web: e.web_name,
        position: POS[e.element_type], team: teamName[tid],
        ...(h || { nineties: 0, minutes: 0, appearances: 0, starts: 0, starts60: 0, startMinutes: 0, cameos: 0, cameoMinutes: 0, teamGames: 0, teamMinutesAvailable: 0, npxg90: 0, xa90: 0, saves90: 0, bps90: 0, cbit90: 0, recoveries90: 0, goals: 0, assists: 0, xg: 0, xa: 0, yellow90: 0 }),
        status: e.status, chance: e.chance_of_playing_next_round,
      };
    });
    sides.push({ name: teamName[tid], isHome, players, promoted: false, strength: teamStrength[tid] });
  }
  const [home, away] = sides;
  const lambdas = fallbackGoalEnvironment(home.strength, away.strength, leagueTotal, 1.13);
  const priors = positionalSharePriors([home, away]);
  for (const [team, lambda] of [[home, lambdas.lambda_home], [away, lambdas.lambda_away]]) {
    const alloc = allocateTeam({ team, lambda, priors, cfg, gw: 1, promotedPrior: cfg.promotedPrior });
    if (alloc?.players) team.players = alloc.players;
    for (const p of team.players) {
      const avail = p.status === "a" ? null : p.status === "i" || p.status === "s" || p.status === "n" ? { signal: "out", confidence: 1 } : p.chance !== null ? { signal: "doubt", confidence: 1 - p.chance / 100 } : null;
      const m = forecastMinutes({ player: p, league, signal: avail, gw: 1, cfg });
      if (m) Object.assign(p, m);
    }
  }
  const sim = simulateFixture({ fixture: { id: `gw1:${home.name}` }, home, away, lambdas, rho: cfg.rho ?? 0, rules, table, cfg, N: 2000 });
  const per = sim.samples || sim;
  for (const team of [home, away]) for (const p of team.players) {
    const rec = per.get ? per.get(p.player_id) : null;
    if (!rec) continue;
    const s = summarise(rec, 2000);
    results.set(p.web.toLowerCase(), { name: p.name, web: p.web, pos: p.position, team: p.team, opp: team === home ? `${away.name} (H)` : `${home.name} (A)`, xp: s.ep_mean, pStart: p.p_start, nineties: p.nineties });
  }
}

const show = (r) => console.log(`${r.xp.toFixed(2).padStart(6)}  start ${(r.pStart * 100).toFixed(0).padStart(3)}%  ${r.pos}  ${r.name} (${r.team}) v ${r.opp}`);
console.log("== THE BATCH ==");
const BATCH = (process.env.PLAYERS || "palmer,neto,diop,fernandes,gabriel,haaland,salah,saka").split(",").map((x) => x.trim().toLowerCase());
for (const w of BATCH) {
  const hit = [...results.values()].filter((r) => r.web.toLowerCase().includes(w) || r.name.toLowerCase().includes(w));
  for (const h of hit.slice(0, 2)) show(h);
}
console.log("\n== TOP 20 OVERALL, GW1 ==");
for (const r of [...results.values()].sort((a, b) => b.xp - a.xp).slice(0, 20)) show(r);
