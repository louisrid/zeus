/* SERVER-SIDE LOADING, for the brief and the optimise endpoint.
 *
 * lib/data.js and lib/projections.js are marked "use client", because they are written for the browser and
 * hold React state alongside the fetching. A route handler cannot import them. Rather than unpick that, this
 * loads the same tables directly and hands the rows to the same scorer, so the numbers a chat sees are the
 * numbers the pages show. If the two ever disagree, that is a bug and the test compares them.
 */
import { createClient } from "@supabase/supabase-js";
import { buildScorer } from "../solver/score.mjs";
import { minutesWithLineups } from "../lineups.mjs";
import { buildOpponentScale } from "../opponent.js";
export { fixtureCounts, blanksAndDoubles } from "./fixtures.mjs";
import { ARCHIVE_OFFSET } from "./fixtures.mjs";
import LINEUPS from "../../config/lineups.json";
import RULES from "../../config/rules-2026-27.json";
import FITTED from "../../config/fitted-params.json";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("The database is not configured on the server.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* Read every row of a table, not just the first page. Supabase caps a response at 1000. */
async function all(client, table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/* Everything the brief and the optimiser need, in one round of queries. */
export async function loadForServer() {
  const client = db();
  const [teamRows, playerRows, fixtureRows, priorRows, minRows, dutyRows, planRows] = await Promise.all([
    all(client, "teams", "*"),
    all(client, "players", "*"),
    all(client, "fixtures", "*"),
    all(client, "player_prior_season", "player_id, points, minutes, nineties, points_per_90, goals, assists, saves, starts, starts60, cameos"),
    all(client, "minutes_forecasts", "*"),
    all(client, "set_piece_duty", "player_id, kind, rank").catch(() => []),
    all(client, "plans", "*").catch(() => []),
  ]);

  /* Only clubs in this season. A relegated club stays in the table and would otherwise appear in the brief. */
  const liveTeams = teamRows.filter((t) => t && t.archive !== true);
  const teamById = Object.fromEntries(liveTeams.map((t) => [t.id, t]));
  const players = playerRows
    .filter((p) => p.archive !== true)
    .map((p) => ({
      ...p,
      team: teamById[p.team_id] ? teamById[p.team_id].short_name : "—",
      own: p.selected_by_pct === null || p.selected_by_pct === undefined ? 0 : Number(p.selected_by_pct),
      price: Number(p.price),
    }));

  /* ARCHIVE_OFFSET marks rows written by the 2025/26 archive job. Those store one side of a match only, so
     including them double-counted fixtures and invented a double gameweek for half the league. */
  const fixtures = fixtureRows
    .filter((f) => f.gw !== null && f.gw !== undefined)
    .filter((f) => Number(f.fpl_id) < ARCHIVE_OFFSET)
    .filter((f) => f.home_team !== null && f.away_team !== null)
    .filter((f) => teamById[f.home_team] && teamById[f.away_team])
    .sort((a, b) => Number(a.gw) - Number(b.gw));

  /* The gameweek we are in: the first with a fixture that has not kicked off, else the lowest present. */
  const now = Date.now();
  const upcoming = fixtures.filter((f) => !f.kickoff_utc || new Date(f.kickoff_utc).getTime() > now);
  const gw = upcoming.length ? Number(upcoming[0].gw) : (fixtures.length ? Number(fixtures[0].gw) : 1);

  /* The same three-way split the pages use, so a chat and a screen cannot disagree. */
  /* The prior-season view keys on the internal id, not the FPL id. Matching the wrong one found nothing for
     most players, so they fell back to the position mean and every forward read the same figure. */
  const byInternalId = new Map(players.map((p) => [p.id, p]));
  const archivePer90 = new Map();
  for (const r of priorRows) {
    const p = byInternalId.get(r.player_id);
    if (!p) continue;
    const nineties = Number(r.nineties) || 0;
    const points = Number(r.points) || 0;
    const goalPts = { GKP: 10, DEF: 6, MID: 5, FWD: 4 }[p.position] ?? 4;
    const appearance = (Number(r.starts60) || 0) * 2
      + Math.max(0, (Number(r.starts) || 0) - (Number(r.starts60) || 0))
      + (Number(r.cameos) || 0);
    const attacking = (Number(r.goals) || 0) * goalPts + (Number(r.assists) || 0) * 3;
    const savePts = Math.floor((Number(r.saves) || 0) / 3);
    const rest = Math.max(0, points - appearance - attacking - savePts);
    archivePer90.set(p.fpl_id, {
      pointsPer90: Number(r.points_per_90) || 0, nineties, points,
      appearPer90: nineties > 0 ? appearance / nineties : 0,
      attackPer90: nineties > 0 ? attacking / nineties : 0,
      defencePer90: nineties > 0 ? (rest + savePts) / nineties : 0,
    });
  }

  const minutes = new Map();
  for (const r of minRows) {
    if (Number(r.gw) !== gw) continue;
    const p = byInternalId.get(r.player_id);
    if (p) minutes.set(p.fpl_id, r);
  }
  for (const [k, v] of minutesWithLineups(LINEUPS.clubs, minutes, players, liveTeams)) minutes.set(k, v);

  const penaltyTakers = new Set();
  for (const r of dutyRows) {
    if (r.kind !== "pen") continue;
    if (!(r.rank === null || r.rank === undefined || Number(r.rank) <= 1)) continue;
    const p = byInternalId.get(r.player_id);
    if (p) penaltyTakers.add(p.fpl_id);
  }

  /* Club quality, exactly as the pages compute it. */
  const teamQuality = new Map();
  {
    const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    const attackOf = (t) => (num(t.strength_attack_home) !== null && num(t.strength_attack_away) !== null
      ? (num(t.strength_attack_home) + num(t.strength_attack_away)) / 2 : num(t.strength));
    const defenceOf = (t) => (num(t.strength_defence_home) !== null && num(t.strength_defence_away) !== null
      ? (num(t.strength_defence_home) + num(t.strength_defence_away)) / 2 : num(t.strength));
    const mean = (fn) => { const v = liveTeams.map(fn).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const aM = mean(attackOf), dM = mean(defenceOf);
    const clampQ = (v) => Math.max(0.78, Math.min(1.28, v));
    for (const t of liveTeams) {
      const a = attackOf(t), d = defenceOf(t);
      teamQuality.set(t.id, {
        attack: a !== null && aM ? clampQ(1 + ((a - aM) / aM) * 0.9) : 1,
        defence: d !== null && dM ? clampQ(1 + ((d - dM) / dM) * 0.9) : 1,
      });
    }
  }

  const scale = buildOpponentScale(teamById);
  const scorer = buildScorer({
    projections: new Map(), perGw: new Map(), archivePer90, understat: new Map(),
    envByTeam: null, leagueMeanGoals: null,
    goalPoints: {
      GKP: RULES.scoring.goal_gkp?.value ?? 10, DEF: RULES.scoring.goal_def?.value ?? 6,
      MID: RULES.scoring.goal_mid?.value ?? 5, FWD: RULES.scoring.goal_fwd?.value ?? 4,
    },
    assistPoints: RULES.scoring.assist?.value ?? 3,
    appearancePoints: RULES.scoring.appearance_60_plus?.value ?? 2,
    shrinkageNineties: FITTED.rate_shrinkage.S_nineties,
    positionMeans: FITTED.position_points_per_start,
    promotionFactor: FITTED.promotion_factor,
    players, minutesForecasts: minutes, penaltyTakers, teamQuality,
  });

  return { teamRows: liveTeams, teamById, players, fixtures, gw, scorer, scale, minutes, lineupsCaptured: LINEUPS.captured };
}
