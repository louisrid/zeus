/* SERVER-SIDE LOADING, for the brief and the optimise endpoint.
 *
 * lib/data.js and lib/projections.js are marked "use client", because they are written for the browser and
 * hold React state alongside the fetching. A route handler cannot import them. Rather than unpick that, this
 * loads the same tables directly and hands the rows to the same scorer, so the numbers a chat sees are the
 * numbers the pages show. If the two ever disagree, that is a bug and the test compares them.
 */
import { createClient } from "@supabase/supabase-js";
import { buildScorer } from "../solver/score.mjs";
import { tuningFrom, calibrationFrom } from "../solver/tuning.mjs";
import { resolveLineups } from "../lineups.mjs";
import { resolveMinutes, lineupRolesOf, lineupVersionOf, lineupTrustOf, minutesInputVersion } from "../minutes_resolved.mjs";
import { buildOpponentScale } from "../opponent.js";
export { fixtureCounts, blanksAndDoubles } from "./fixtures.mjs";
import { ARCHIVE_OFFSET } from "./fixtures.mjs";
import LINEUPS from "../../config/lineups.json";
import RULES from "../../config/rules-2026-27.json";
import FITTED from "../../config/fitted-params.json";
import ENGINE_JSON from "../../config/engine-2026-27.json";
import { engineConfig } from "../engine/config.mjs";
import { buildProjectionRuntime, assertCurrentEngineCoverage } from "../projection_runtime.mjs";

/* The same engine config the projection job runs on, so the shared minutes resolver gets the same
   earlySubShare on both sides. Reading it here rather than passing a literal keeps one source. */
const ENGINE_CFG = engineConfig(ENGINE_JSON);

/* The service key is named SUPABASE_SERVICE_KEY in this project, which is what app/api/plans uses. Looking
   for SUPABASE_SERVICE_ROLE_KEY found nothing, fell back to the anon key, and the plans table is not
   readable with that, so the brief reported "no saved drafts" when there were two. Both names are accepted
   now so a rename cannot break it again. */
function db(needsAdmin = false) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = service || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("The database is not configured on the server.");
  if (needsAdmin && !service) {
    throw new Error(
      "SUPABASE_SERVICE_KEY is not set on the server, so the saved drafts cannot be read. "
      + "The anon key cannot see the plans table.",
    );
  }
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
  const client = db(true);
  const [teamRows, playerRows, fixtureRows, priorRows, minRows, projRows, dutyRows, planRows] = await Promise.all([
    all(client, "teams", "*"),
    all(client, "players", "*"),
    all(client, "fixtures", "*"),
    all(client, "player_prior_season", "player_id, points, minutes, nineties, points_per_90, goals, assists, saves, starts, starts60, cameos"),
    all(client, "minutes_forecasts", "*"),
    /* THE ENGINE'S OWN PROJECTIONS. Never loaded here, so the brief passed an empty set to the scorer and
       could only ever report zero engine coverage, whatever the database actually held. The browser has always
       read this table; the server loader simply did not. */
    all(client, "projections", "*"),
    all(client, "set_piece_duty", "player_id, kind, rank").catch(() => []),  // optional, absent is fine
    /* No .catch here on purpose. Swallowing a failed read reported "no saved drafts" when the real problem
       was a missing key, which is far harder to diagnose than an error message. */
    all(client, "plans", "*"),
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

  /* One coherent latest generation per gameweek, shared with the browser loader. */
  const idToFpl = new Map(players.map((p) => [p.id, p.fpl_id]));
  const projectionRuntime = buildProjectionRuntime(projRows, { currentGw: gw, idToFpl });
  const { projections, perGw } = projectionRuntime;
  const currentFixtureTeams = new Set();
  for (const fixture of fixtures) {
    if (Number(fixture.gw) !== Number(gw)) continue;
    currentFixtureTeams.add(Number(fixture.home_team));
    currentFixtureTeams.add(Number(fixture.away_team));
  }
  const projectionEligiblePlayers = currentFixtureTeams.size
    ? players.filter((player) => currentFixtureTeams.has(Number(player.team_id)))
    : players;
  assertCurrentEngineCoverage({ projections, players: projectionEligiblePlayers, currentGw: gw });

  /* MINUTES ARE RESOLVED BY THE SAME FUNCTION THE ENGINE USED.
   *
   * This used to call minutesWithLineups, which merged the predicted elevens into the stored rows AFTER the
   * engine had already simulated without them. The engine and the screen therefore held different minutes
   * for the same player, and the scorer resolved the disagreement by discarding the engine's projection:
   * Osula, engine 1.584, displayed 5.3. lib/minutes_resolved.mjs is now the only place minutes are decided,
   * it is pure, and jobs/projections_run.mjs calls it with the same inputs before simulating, so both sides
   * necessarily agree. Resolving again here is idempotent and is what makes that guarantee checkable. */
  const lineupGameweek = Number(LINEUPS.gameweek ?? 1);
  const lineupApplies = Number(gw) === lineupGameweek;
  const lineupResolution = resolveLineups(LINEUPS.clubs, players, liveTeams);
  const lineupVersion = lineupApplies ? lineupVersionOf(LINEUPS) : "none";
  const lineupTrust = lineupApplies
    ? lineupTrustOf(LINEUPS)
    : { confidence: 0, official: false };
  const lineupRoles = lineupApplies
    ? lineupRolesOf(lineupResolution, players)
    : new Map();
  const statusOf = new Map(players.map((p) => [p.fpl_id, p]));

  const baseMinutes = new Map();
  for (const r of minRows) {
    if (Number(r.gw) !== gw) continue;
    const p = byInternalId.get(r.player_id);
    if (p) baseMinutes.set(p.fpl_id, r);
  }
  const minutes = new Map();
  const minutesMeta = new Map();
  for (const p of players) {
    const base = baseMinutes.get(p.fpl_id);
    const role = lineupRoles.get(p.fpl_id) || null;
    if (!base && !role) continue;
    const m = resolveMinutes({
      base, lineup: role, status: p.status,
      earlySubShare: ENGINE_CFG.earlySubShare ?? 0,
      confidence: lineupTrust.confidence, official: lineupTrust.official,
    });
    minutes.set(p.fpl_id, m);
    minutesMeta.set(p.fpl_id, {
      minutes_source: m.minutes_source,
      minutes_input_version: minutesInputVersion({
        lineupVersion, status: p.status, chanceOfPlaying: p.chance_of_playing,
        minutesSource: m.minutes_source, confidence: lineupTrust.confidence,
      }),
    });
  }

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
    projections, perGw, engineOnly: true, currentGw: gw, archivePer90, understat: new Map(),
    envByTeam: null, leagueMeanGoals: null,
    goalPoints: {
      GKP: RULES.scoring.goal_gkp?.value ?? 6, DEF: RULES.scoring.goal_def?.value ?? 6,
      MID: RULES.scoring.goal_mid?.value ?? 5, FWD: RULES.scoring.goal_fwd?.value ?? 4,
    },
    assistPoints: RULES.scoring.assist?.value ?? 3,
    appearancePoints: RULES.scoring.appearance_60_plus?.value ?? 2,
    shrinkageNineties: FITTED.rate_shrinkage.S_nineties,
    positionMeans: FITTED.position_points_per_start,
    promotionFactor: FITTED.promotion_factor,
    /* The measured parameters only. An UNMEASURED entry is an open question, not a setting, so the brief and
       the pages agree with each other and with whatever the sweep last proved. */
    tuning: tuningFrom(FITTED),
    calibration: calibrationFrom(FITTED),
    players, minutesForecasts: minutes, minutesMeta, lineupVersion, penaltyTakers, teamQuality,

    /* FIXTURE DIFFICULTY, PER GAMEWEEK.
     *
     * Without these two the per-gameweek projection is flat: every week returns the same number regardless
     * of the opponent, which is exactly what Louis saw when three strikers each read the same figure six
     * times. Pre-season there are no odds, so envByTeam is null and the multiplier defaults to one; the
     * scorer's fallback is difficultyOf, and the server loader was not passing it. The browser always did,
     * which is why the pages looked right and a chat did not. */
    hasFixture: (pl, g) => fixtures.some((f) => Number(f.gw) === g
      && (f.home_team === pl.team_id || f.away_team === pl.team_id)),
    difficultyOf: (pl, g) => {
      const f = fixtures.find((x) => Number(x.gw) === g
        && (x.home_team === pl.team_id || x.away_team === pl.team_id));
      if (!f) return null;
      const home = f.home_team === pl.team_id;
      const oppId = home ? f.away_team : f.home_team;
      const d = scale ? scale.difficultyOf(oppId, home) : null;
      return d ? d.difficulty : null;
    },
  });

  /* The saved drafts, newest first. The brief needs Louis's OWN squad, not just the market: almost every
     question he asks is about the team he owns. These rows were already being fetched and thrown away. */
  const plans = (planRows || []).slice().sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  return { teamRows: liveTeams, teamById, players, fixtures, gw, scorer, scale, minutes, plans,
    byInternalId, lineupsCaptured: LINEUPS.captured,
    projectionGeneration: projectionRuntime.currentGeneration,
    staleProjectionRowsExcluded: projectionRuntime.staleRows.length };
}
