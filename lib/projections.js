"use client";
// Loads everything the scoring layer needs in one pass, on top of loadCore().
// Read-only anon key throughout; all writes go through /api routes holding the service key.

import { sb } from "./data";
import rulesJson from "../config/rules-2026-27.json";
import FITTED from "../config/fitted-params.json";
import { buildOpponentScale } from "./opponent";
import { buildScorer } from "./solver/score.mjs";
import { tuningFrom, calibrationFrom } from "./solver/tuning.mjs";
import { resolveLineups } from "./lineups.mjs";
import { resolveMinutes, lineupRolesOf, lineupVersionOf, lineupTrustOf, minutesInputVersion } from "./minutes_resolved.mjs";
import { engineConfig } from "./engine/config.mjs";
import { buildProjectionRuntime, assertCurrentEngineCoverage, projectionReadError } from "./projection_runtime.mjs";
import LINEUPS from "../config/lineups.json";
import ENGINE_JSON from "../config/engine-2026-27.json";

/* The same engine config the projection job runs on, so the shared minutes resolver receives the same
   earlySubShare on both sides of the wall. */
const ENGINE_CFG = engineConfig(ENGINE_JSON);

const val = (node) => (node && typeof node === "object" && "value" in node ? node.value : node);

/* Supabase responses are capped at 1,000 rows. Three gameweeks contain well over that, so the
   projections query must be paged or the browser silently loses part of the engine output. */
async function allProjectionRows(supabase, fromGw, toGw) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("projections").select("*")
      .gte("gw", fromGw).lte("gw", toGw).range(from, from + 999);
    if (error) throw projectionReadError(error, "projections");
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const GOAL_POINTS = {
  GKP: val(rulesJson.scoring.goal_gkp),
  DEF: val(rulesJson.scoring.goal_def),
  MID: val(rulesJson.scoring.goal_mid),
  FWD: val(rulesJson.scoring.goal_fwd),
};
const ASSIST_POINTS = val(rulesJson.scoring.assist);
const APPEARANCE_POINTS = val(rulesJson.scoring.appearance_60_plus);

export async function loadModel(core) {
  // Built once, lazily, so the scorer can read fixture strength beyond the odds window.
  let _oppScale;
  const oppScale = () => {
    if (_oppScale === undefined) _oppScale = buildOpponentScale(core.teamById);
    return _oppScale;
  };
  const supabase = sb();
  const gw = core.currentGw;
  const idToFpl = new Map();
  for (const p of core.players) idToFpl.set(p.id, p.fpl_id);

  const [projRes, minRes, dutyRes, priorRes, usRes, envRes, gateRes] = await Promise.all([
    allProjectionRows(supabase, gw, gw + 11),
    supabase.from("minutes_forecasts").select("*").eq("gw", gw),
    supabase.from("set_piece_duty").select("player_id, kind, rank"),
    supabase.from("player_prior_season").select("player_id, points, minutes, nineties, points_per_90, goals, assists, saves, starts, starts60, cameos"),
    supabase.from("understat_player_season").select("player_id, season, minutes, xg, xa").eq("season", "2025-26"),
    supabase.from("fixture_goal_env").select("*").gte("gw", gw).lte("gw", gw + 11),
    supabase.from("model_gates").select("key, passed, upgrade_date").eq("key", "xp_visible").maybeSingle(),
  ]);

  // Projection reads are mandatory. A failed or truncated engine read must never become plausible fallback xPTS.
  const projRows = projRes || [];
  const minRows = minRes.error ? [] : minRes.data || [];

  /* PENALTY DUTY. The job has been collecting this since day one and the scorer never read it, so a
     confirmed penalty taker projected exactly the same as anyone else in his position. A penalty is worth
     roughly 0.79 goals on conversion rate alone, and the taker is on maybe a quarter of his side's spot
     kicks over a season, so the uplift is real but small: a few tenths, not a point. */
  const penaltyTakers = new Set();
  for (const r of (dutyRes && !dutyRes.error ? dutyRes.data || [] : [])) {
    if (r.kind === "pen" && (r.rank === null || r.rank === undefined || Number(r.rank) <= 1)) {
      const fpl = idToFpl.get(r.player_id);
      if (fpl) penaltyTakers.add(fpl);
    }
  }
  const priorRows = priorRes.error ? [] : priorRes.data || [];
  const usRows = usRes.error ? [] : usRes.data || [];
  const envRows = envRes.error ? [] : envRes.data || [];
  const gateOpen = Boolean(!gateRes.error && gateRes.data && gateRes.data.passed);

  // Select one coherent latest generation per gameweek. Raw database order is never allowed to choose.
  const projectionRuntime = buildProjectionRuntime(projRows, { currentGw: gw, idToFpl });
  const { projections, perGw } = projectionRuntime;
  const currentFixtureTeams = new Set();
  for (const fixture of core.fixtures || []) {
    if (Number(fixture.gw) !== Number(gw)) continue;
    currentFixtureTeams.add(Number(fixture.home_team));
    currentFixtureTeams.add(Number(fixture.away_team));
  }
  const projectionEligiblePlayers = currentFixtureTeams.size
    ? core.players.filter((player) => currentFixtureTeams.has(Number(player.team_id)))
    : core.players;
  assertCurrentEngineCoverage({ projections, players: projectionEligiblePlayers, currentGw: gw });

  /* minutes_forecasts is keyed by (player_id, gw, model_version). Without choosing a version, the
     last row returned wins arbitrarily, which means the scorer could silently use a stale model.
     The newest version per player is taken; model_version strings are chronological by convention,
     and a row with no version loses to one that has it. */
  const minutes = new Map();
  const minutesVersion = new Map();
  for (const r of minRows) {
    const fpl = idToFpl.get(r.player_id);
    if (!fpl) continue;
    const v = r.model_version || "";
    const seen = minutesVersion.get(fpl);
    if (seen !== undefined && seen >= v) continue;
    minutesVersion.set(fpl, v);
    minutes.set(fpl, r);
  }

  /* MINUTES ARE RESOLVED BY THE SAME FUNCTION THE ENGINE USED. THIS IS THE PAGE-FACING PATH.
   *
   * Every screen loads this file: app/players, app/builder, the Squad and Line-ups views and the Dashboard.
   * It used to merge the predicted elevens into the stored forecasts AFTER the engine had already simulated
   * without them, so the engine and the screen held different minutes for the same player and the scorer
   * settled the disagreement by discarding the engine's projection. Osula, GW1 2026-27: engine 1.584 at a
   * 28.6% chance of starting, displayed 5.3 from his last season's 8.497 points per 90.
   *
   * lib/minutes_resolved.mjs is now the one place minutes are decided, and jobs/projections_run.mjs calls it
   * with these same inputs before simulating. Resolving again here is idempotent, which is precisely what
   * makes "the engine and the screen agree" a property of the code rather than a thing to remember. */
  const lineupVersion = lineupVersionOf(LINEUPS);
  const lineupTrust = lineupTrustOf(LINEUPS);
  const lineupRoles = lineupRolesOf(
    resolveLineups(LINEUPS.clubs, core.players, Object.values(core.teamById)),
    core.players,
  );
  const minutesMeta = new Map();
  {
    const base = new Map(minutes);
    minutes.clear();
    for (const p of core.players) {
      const b = base.get(p.fpl_id);
      const role = lineupRoles.get(p.fpl_id) || null;
      if (!b && !role) continue;
      const m = resolveMinutes({
        base: b, lineup: role, status: p.status,
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
  }

  /* CLUB QUALITY, two figures per club centred on one.
   *
   * Without this, every player with no prior-season record scored the same number regardless of who he
   * plays for: four backup keepers identical at 0.6, and a confirmed Arsenal centre back rated level with a
   * confirmed Hull one. Built from FPL's own per-venue ratings where they exist and overall strength where
   * they do not, so it works today and improves when the next pull lands. */
  const teamQuality = new Map();
  {
    const list = Object.values(core.teamById || {});
    const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    const attackOf = (t) => num(t.strength_attack_home) !== null && num(t.strength_attack_away) !== null
      ? (num(t.strength_attack_home) + num(t.strength_attack_away)) / 2 : num(t.strength);
    const defenceOf = (t) => num(t.strength_defence_home) !== null && num(t.strength_defence_away) !== null
      ? (num(t.strength_defence_home) + num(t.strength_defence_away)) / 2 : num(t.strength);
    const mean = (fn) => {
      const vals = list.map(fn).filter((v) => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const aMean = mean(attackOf), dMean = mean(defenceOf);
    /* Bounded, because a rating is a proxy and should nudge rather than dominate. The best side is worth
       about a quarter more than average to its attackers, not double. */
    const clampQ = (v) => Math.max(0.78, Math.min(1.28, v));
    for (const t of list) {
      const a = attackOf(t), d = defenceOf(t);
      teamQuality.set(t.id, {
        attack: a !== null && aMean ? clampQ(1 + (a - aMean) / aMean * 0.9) : 1,
        defence: d !== null && dMean ? clampQ(1 + (d - dMean) / dMean * 0.9) : 1,
      });
    }
  }

  const archivePer90 = new Map();
  for (const r of priorRows) {
    const fpl = idToFpl.get(r.player_id);
    if (!fpl) continue;
    /* THE SPLIT. A player's points come from three sources that respond to the opponent differently, and
       treating them as one number is what a rate model gets wrong.

         appearance  fixed, he collects it whoever he plays
         attacking   goals and assists, driven by how many his side scores
         the rest    clean sheets, saves, goals conceded and bonus, driven by what the opponent scores

       Splitting them here, from his own record, lets the scorer apply the right multiplier to each. A
       defender who chips in with goals no longer has that attacking value scaled by clean-sheet odds, and
       a midfielder's bonus no longer swings on his own side's goal environment alone. */
    const nineties = Number(r.nineties) || 0;
    const points = Number(r.points) || 0;
    const goals = Number(r.goals) || 0;
    const assists = Number(r.assists) || 0;
    const saves = Number(r.saves) || 0;
    const starts60 = Number(r.starts60) || 0;
    const starts = Number(r.starts) || 0;
    const cameos = Number(r.cameos) || 0;

    const pl = core.players.find((x) => x.fpl_id === fpl);
    const pos = pl ? pl.position : "MID";
    const goalPts = { GKP: 10, DEF: 6, MID: 5, FWD: 4 }[pos] ?? 4;

    const appearance = starts60 * 2 + Math.max(0, starts - starts60) * 1 + cameos * 1;
    const attacking = goals * goalPts + assists * 3;
    const savePts = Math.floor(saves / 3);
    // Whatever is left is clean sheets, goals conceded, bonus and cards. Never negative.
    const rest = Math.max(0, points - appearance - attacking - savePts);

    archivePer90.set(fpl, {
      pointsPer90: Number(r.points_per_90) || 0,
      nineties,
      points,
      // Per ninety, so the scorer can rebuild the rate from parts.
      appearPer90: nineties > 0 ? appearance / nineties : 0,
      attackPer90: nineties > 0 ? attacking / nineties : 0,
      defencePer90: nineties > 0 ? (rest + savePts) / nineties : 0,
    });
  }
  const understat = new Map();
  for (const r of usRows) {
    const fpl = idToFpl.get(r.player_id);
    if (fpl) understat.set(fpl, r);
  }

  // Next fixture goal environment per team, and the league mean the market itself implies.
  const envByTeam = new Map();
  const sorted = [...envRows].sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc));
  for (const r of sorted) {
    if (!envByTeam.has(r.home_team)) {
      envByTeam.set(r.home_team, { forGoals: Number(r.lambda_home), againstGoals: Number(r.lambda_away), home: true, gw: r.gw });
    }
    if (!envByTeam.has(r.away_team)) {
      envByTeam.set(r.away_team, { forGoals: Number(r.lambda_away), againstGoals: Number(r.lambda_home), home: false, gw: r.gw });
    }
  }
  // Per-gameweek goal environment, so a fixture run can be scored fixture by fixture. envByTeam above
  // keeps only each team's next fixture, which is all the current-gameweek score needs.
  const envByTeamGw = new Map();
  for (const r of envRows) {
    envByTeamGw.set(`${r.home_team}|${r.gw}`, { forGoals: Number(r.lambda_home), againstGoals: Number(r.lambda_away), home: true, gw: r.gw });
    envByTeamGw.set(`${r.away_team}|${r.gw}`, { forGoals: Number(r.lambda_away), againstGoals: Number(r.lambda_home), home: false, gw: r.gw });
  }

  const leagueMeanGoals = envRows.length
    ? envRows.reduce((s, r) => s + Number(r.lambda_home) + Number(r.lambda_away), 0) / envRows.length
    : null;

  const scorer = buildScorer({
    projections,
    engineOnly: true,
    currentGw: gw,
    archivePer90,
    understat,
    envByTeam,
    leagueMeanGoals,
    goalPoints: GOAL_POINTS,
    assistPoints: ASSIST_POINTS,
    appearancePoints: APPEARANCE_POINTS,
    minutesForecasts: minutes,
    minutesMeta,
    lineupVersion,
    shrinkageNineties: FITTED.rate_shrinkage.S_nineties,
    positionMeans: FITTED.position_points_per_start,
    promotionFactor: FITTED.promotion_factor,
    /* The measured parameters, and only the measured ones: anything still marked UNMEASURED is read as the
       setting the model has always used, so the app cannot start running on a value nobody has checked. */
    tuning: tuningFrom(FITTED),
    calibration: calibrationFrom(FITTED),
    players: core.players,
    // INTERIM, flagged for the Batch 3 backtest. See the compression note in lib/solver/score.mjs.
    engineShrinkNineties: 6,
    penaltyTakers,
    teamQuality,
    envByTeamGw,
    perGw,
    // Beyond the odds window, fixture strength comes from the same scale the fixture tags use.
    hasFixture: (p, gw) => (core.fixtures || []).some((r) => r.gw === gw && (r.home_team === p.team_id || r.away_team === p.team_id)),
    difficultyOf: (p, gw) => {
      const f = (core.fixtures || []).find((r) => r.gw === gw && (r.home_team === p.team_id || r.away_team === p.team_id));
      if (!f) return null;
      const oppId = f.home_team === p.team_id ? f.away_team : f.home_team;
      const scale = oppScale();
      const d = scale ? scale.difficultyOf(oppId, f.home_team === p.team_id) : null;
      return d ? d.difficulty : null;
    },
  });

  const engineRows = projections.size;
  // How much of the player list the engine actually covers. A list that is half engine and half
  // interim must not describe itself as an engine list: the two are the same units but the interim
  // path is shrunk toward the position mean, so their spread differs.
  const livePlayers = core.players.length;
  const engineCoverage = livePlayers > 0 ? engineRows / livePlayers : 0;
  return {
    ...scorer,
    minutes,
    perGw,
    // Minutes accessors belong on the MODEL, not in buildScorer's options: the scorer ignores what it
    // does not recognise, so these were silently discarded and every caller got undefined.
    minutesForecasts: minutes,
    minutesOf: (pl) => minutes.get(pl.fpl_id) || null,
    startProbOf: (pl) => {
      const m = minutes.get(pl.fpl_id);
      if (!m) return null;
      const v = Number(m.p_start);
      return Number.isFinite(v) ? v : null;
    },
    // Last season's total points, for X£. From the archive, not players.total_points, because the
    // live field becomes THIS season's total the moment play starts.
    lastSeasonPoints: (pl) => {
      const a = archivePer90.get(pl.fpl_id);
      return a && a.points > 0 ? a.points : null;
    },
    envByTeam,
    envByTeamGw,
    gateOpen,
    engineRows,
    engineCoverage,
    livePlayers,
    oddsRows: envRows.length,
    projectionGeneration: projectionRuntime.currentGeneration,
    staleProjectionRowsExcluded: projectionRuntime.staleRows.length,
    gw,
  };
}

/* Where the numbers currently come from, in one line of user language for the panel footer. */
// provenanceLine lives in lib/solver/score.mjs, which owns what a number is called.
export { provenanceLine } from "./solver/score.mjs";
