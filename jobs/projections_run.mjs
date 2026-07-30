// B-02/B-03/B-04/B-06/B-07 · the projection run: Layer 0 → 1 → 2 → 3 → 4 end to end.
// Reads the ruleset and the engine config, writes minutes_forecasts, projections,
// model_versions, engine_run_params and a heartbeat.
//
// Zero AI calls. Deterministic: same data + same seed = same numbers.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, optional PROJECTION_GWS (default 3), N_SIMS.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { engineConfig, interimParameters } from "../lib/engine/config.mjs";
import { impliedGoalEnvironment, fallbackGoalEnvironment } from "../lib/engine/layer0_market.mjs";
import {
  positionalSharePriors,
  allocateTeam,
  penaltyConversion,
  deriveAssistWeights,
  deriveRoleAssistWeights,
  deriveLeagueRates,
  shrunkPenaltyAwardRate,
  fixturePenaltyAwardRate,
  penaltyAttemptsFromExpectedGoals,
} from "../lib/engine/layer2_allocation.mjs";
import { forecastMinutes, leagueMinutesMeans, MINUTES_MODEL, normaliseTeamStarts } from "../lib/engine/layer3_minutes.mjs";
import { simulateFixture, summarise, } from "../lib/engine/layer4_sim.mjs";
import { scoringTable, squadRules } from "../lib/engine/points.mjs";
import { deriveBpsOffsets } from "../lib/bps_engine.mjs";
import { resolveLineups } from "../lib/lineups.mjs";
import { resolveMinutes, lineupRolesOf, lineupVersionOf, lineupTrustOf, minutesInputVersion, expectedMinutesOf } from "../lib/minutes_resolved.mjs";

import { resolvePlayerRates } from "../lib/engine/player_rate_resolver.mjs";
import { matchExpectedMetricsRow } from "../lib/engine/player_data_matcher.mjs";
import { aggregateHistoryProfiles, mergeHistoricalProfile } from "../lib/engine/history_profiles.mjs";
import { buildRoleModel, attachPlayerRole } from "../lib/engine/player_roles.mjs";
import { cleanupStaleProjections } from "./projection_integrity_v14.mjs";
let _db = null;
const supabaseClient = () => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
};
const JOB = "projections_run";
const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url)));
const engineJson = JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url)));
const lineupJson = JSON.parse(readFileSync(new URL("../config/lineups.json", import.meta.url)));
const LINEUPS = JSON.parse(readFileSync(new URL("../config/lineups.json", import.meta.url)));
const cfg = engineConfig(engineJson);
if (process.env.N_SIMS) cfg.N = Number(process.env.N_SIMS);
const HORIZON = Number(process.env.PROJECTION_GWS || 3);
const MODEL_VERSION = `${cfg.engineVersion}+${rules.metadata.ruleset_version}`;

async function beat(status, message) {
  await supabaseClient().from("pipeline_heartbeats").upsert({
    job_name: JOB, last_run_at: new Date().toISOString(),
    ...(status === "ok" ? { last_success_at: new Date().toISOString() } : {}), status, message,
  });
}

async function pageAll(table, select, apply) {
  let from = 0;
  let all = [];
  for (;;) {
    let q = supabaseClient().from(table).select(select).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const table = scoringTable(rules);
  const sq = squadRules(rules);
  cfg.formation = sq.formation;

  // ── reference data
  const teams = await pageAll("teams", "*");
  const live = teams.filter((t) => !t.archive);
  // Archive players belong to last season's relegated clubs and cannot score in 2026/27. Projecting
  // them wasted the run on roughly 400 people and inflated every coverage measure: 950 forecasts
  // existed against 558 live players.
  const players = await pageAll(
    "players",
    "id, fpl_id, team_id, position, name, web_name, price, status, chance_of_playing, minutes",
    (q) => q.not("archive", "is", true),
  );
  const gws = (await pageAll("gameweeks", "gw, deadline_utc, finished")).filter((g) => !g.finished).sort((a, b) => a.gw - b.gw);
  if (!gws.length) throw new Error("no unfinished gameweeks — run fpl_bootstrap first");
  const targetGws = gws.slice(0, HORIZON).map((g) => g.gw);

  // One pull of the fixtures table serves both the target list and the league-level derivations.
  const allFixtures = await pageAll("fixtures", "id, gw, home_team, away_team, kickoff_utc, finished, season, home_goals, away_goals");
  const fixtures = allFixtures.filter((f) => f.season === "2026-27" && targetGws.includes(f.gw) && !f.finished);
  if (!fixtures.length) throw new Error("no upcoming fixtures for the target gameweeks");

  const priorRows = await pageAll("player_prior_season", "*");

  /* The id-backed player_prior_season view historically omitted xG and xA, and its archive loader
     matched names exactly. That combination forced hundreds of established players onto one broad
     positional rate. The independent history table already contains last season's expected metrics,
     so aggregate and conservatively name/team-match it at run time. This needs no manual migration. */
  const historyCore = "element, player_name, position, team, minutes, started, total_points, goals, assists, xg, xa, saves, yellow, red, own_goals, pens_missed, pens_saved";
  let priorHistoryGameweeks = [];
  try {
    priorHistoryGameweeks = await pageAll("history_player_gw", `${historyCore}, cbit, recoveries`,
      (q) => q.eq("season", "2025-26").eq("competition", "PL"));
  } catch (e) {
    console.log(`history cbit/recoveries unavailable (${e.message}); continuing with attacking metrics`);
    priorHistoryGameweeks = await pageAll("history_player_gw", historyCore,
      (q) => q.eq("season", "2025-26").eq("competition", "PL"));
  }
  const priorHistoryProfiles = aggregateHistoryProfiles(priorHistoryGameweeks);
  const roleModel = buildRoleModel(priorHistoryProfiles);
  cfg.roleRates = roleModel.rates;
  cfg.assistRoleWeight = deriveRoleAssistWeights(
    priorHistoryProfiles.map((profile) => attachPlayerRole(profile, roleModel)),
  );
  console.log(`prior history profiles: ${priorHistoryProfiles.length}; role priors: ${Object.keys(roleModel.rates.npxg90 || {}).length}`);

  // League mean goals per match, derived — never a literal. Preference order matters because the
  // 2025/26 archive loader does not populate fixture scorelines, so the scoreline route is only
  // available for finished 2026/27 fixtures. The fallback sums actual player goals over the
  // archive, which the loader does populate.
  const scored = allFixtures.filter((f) => f.home_goals !== null && f.away_goals !== null);
  const archiveFixtures = allFixtures.filter((f) => f.season === "2025-26");
  const archiveGoals = priorHistoryProfiles.reduce((s, r) => s + (r.goals || 0), 0);
  let leagueMeanGoals = null;
  let goalSource = "unavailable";
  if (scored.length >= 20) {
    leagueMeanGoals = scored.reduce((s, f) => s + f.home_goals + f.away_goals, 0) / scored.length;
    goalSource = "fixture scorelines";
  } else if (archiveFixtures.length && archiveGoals > 0) {
    /* Archive fixture rows store one side of a match each, so the row count is twice the number of matches
       and dividing by it would halve the average. */
    leagueMeanGoals = archiveGoals / (archiveFixtures.length / 2);
    goalSource = "archive player goals";
  } else {
    /* THE REASON THE ENGINE HAS NEVER PRODUCED ANYTHING.
     *
     * Without this figure the strength-based fallback returns nothing, every fixture is skipped, and the run
     * finishes having written zero projections. The app then silently falls back to scaling one blended
     * season average, which measured against 2025/26 beats a naive per-player average by only 3 per cent.
     * Every number on every screen came from that, for months, because a single figure was missing.
     *
     * Before a ball is kicked there are no scorelines to average and the archive may not resolve either, so
     * there has to be a floor. The Premier League has averaged close to 2.8 goals a match for a decade and it
     * moves very little, so this is a safe starting point that is replaced by real scorelines as soon as
     * twenty matches have been played. */
    leagueMeanGoals = 2.8;
    goalSource = "long-run league average, no scorelines or archive available yet";
  }
  // Home advantage needs scorelines; without them the split stays neutral rather than invented.
  const homeGoals = scored.reduce((s, f) => s + f.home_goals, 0);
  const awayGoals = scored.reduce((s, f) => s + f.away_goals, 0);
  /* HOME ADVANTAGE. It was held at exactly 1, meaning none at all, whenever fewer than twenty matches had
     been played. Before a season starts that is always, so every fixture was priced as if venue did not
     matter. City at home to a promoted side got no lift, which is part of why a premium striker in a soft home
     fixture read like a mid-price one.
     Home sides have scored roughly 1.13 goals for every 1 an away side scores for over a decade. It is one of
     the most stable numbers in the sport, so a starting value is far better than pretending it is 1. */
  const homeAdvantage = scored.length >= 20 && awayGoals > 0 ? homeGoals / awayGoals : 1.13;
  const prior = new Map(priorRows.map((r) => [r.player_id, r]));
  const understat = new Map(
    (await pageAll("understat_player_season", "*"))
      .filter((r) => r.season === "2025-26")
      .map((r) => [r.player_id, r])
  );
  const env = new Map((await pageAll("fixture_goal_env", "*")).map((r) => [r.fixture_id, r]));
  const fixtureIds = new Set(fixtures.map((f) => f.id));
  const latestOdds = new Map();
  for (const row of await pageAll("odds_snapshots", "id, fixture_id, fetched_at, h, d, a, over25, under25")) {
    if (!fixtureIds.has(row.fixture_id)) continue;
    const cur = latestOdds.get(row.fixture_id);
    if (!cur || new Date(row.fetched_at) > new Date(cur.fetched_at)) latestOdds.set(row.fixture_id, row);
  }
  const duty = await pageAll("set_piece_duty", "player_id, team_id, kind, rank, confidence, evidence, source, updated_at");
  const penDuty = new Map(duty.filter((d) => d.kind === "pen").map((d) => [d.player_id, d]));
  const signals = await pageAll("presser_signals", "player_id, gw, signal, confidence");

  /* THE BONUS RACE CORRECTION, derived fresh from this season's archive on every run. The BPS formula cannot
     see pass completion or chances created, so goalkeepers won simulated bonus midfielders win in reality:
     measured on 2025-26, keepers projected 0.57 bonus a match against an actual 0.23. Adding the measured
     per-position gap back cut that to 0.27 vs 0.23, midfielders from 0.13 short to 0.06, lifted ordering
     0.161 to 0.180, and won a whole-gameweek paired bootstrap 500 redraws of 500. Early season, before 30
     starts per position exist, the derivation returns 0 and nothing is applied: no guessing. */
  let bpsRows = [];
  /* The archive table may predate the cbit and recoveries columns (migration-025 adds them). A missing
     column must degrade the correction, never kill the run: the first version of this query took the whole
     projection pipeline down over exactly that. */
  const bpsCols = "position, minutes, goals, assists, xg, xa, goals_conceded, saves, pens_saved, pens_missed, yellow, red, own_goals, bps";
  for (const form of ["2026-27", "2026/27"]) {
    try {
      bpsRows = await pageAll("history_player_gw", bpsCols + ", cbit, recoveries",
        (q) => q.eq("season", form).eq("competition", "PL"));
    } catch (e) {
      console.log(`cbit/recoveries columns missing (${e.message}); run supabase/migration-026.sql, then re-run history-load. Continuing without them.`);
      bpsRows = await pageAll("history_player_gw", bpsCols,
        (q) => q.eq("season", form).eq("competition", "PL"));
    }
    if (bpsRows.length) break;
  }
  cfg.bpsOffset = deriveBpsOffsets(bpsRows, rules);
  /* Same discipline for assists: xA overrates forwards and underrates midfielders as a predictor of who
     really assists. The weight is each position's share of actual assists over its share of xA, derived from
     this season's own rows; below 50 assists in the sample it returns null and nothing is applied.
     Measured on 2025-26 walk-forward: midfielder assist shortfall 23% to 10%, forward excess 22% to 5%,
     and the change won a whole-gameweek paired bootstrap. */
  cfg.assistWeight = deriveAssistWeights(bpsRows);
  /* Unmeasured players priced at the league positional rate, not zero: without this, promoted clubs
     concentrated their whole attack onto the two or three players with any Premier League record. Early
     season, before 10 full matches of league data exist, this returns empty and last season's stored rates
     in config are used instead. */
  const seasonRates = deriveLeagueRates(bpsRows);
  const pick = (k) => Object.keys(seasonRates[k] || {}).length === 4 ? seasonRates[k] : cfg.leagueRates?.[k];
  cfg.leagueRates = { npxg90: pick("npxg90"), xa90: pick("xa90"), cbit90: pick("cbit90"), recoveries90: pick("recoveries90") };

  // League penalty totals. Some historical loaders do not carry scored-penalty attempts. Understat does
  // carry both total xG and non-penalty xG, so their difference recovers the missing penalty-event volume.
  const archiveLeaguePenScored = priorRows.reduce((s, r) => s + (Number(r.pens_scored) || 0), 0);
  const archiveLeaguePenTaken = priorRows.reduce((s, r) => s + (Number(r.pens_taken) || 0), 0);
  const spotPenaltyXg = Math.max(0.01, Number(cfg.penaltySpotXg) || 0.76);
  const understatLeaguePenTaken = [...understat.values()].reduce((sum, row) =>
    sum + penaltyAttemptsFromExpectedGoals(row.xg, row.npxg, spotPenaltyXg), 0);
  const leaguePenTaken = archiveLeaguePenTaken > 0 ? archiveLeaguePenTaken : understatLeaguePenTaken;
  const leaguePenScored = archiveLeaguePenTaken > 0
    ? archiveLeaguePenScored
    : leaguePenTaken * 0.79;

  const archiveGamesPerTeam = archiveFixtures.length ? (2 * archiveFixtures.length) / Math.max(1, live.length) : null;

  // ── per-player rate profile
  let historicalMatches = 0;
  let understatMatches = 0;
  const profileOf = (p) => {
    const directPrior = prior.get(p.id);
    const directUnderstat = understat.get(p.id);
    const ratePlayer = { ...p, team_name: teams.find((t) => t.id === p.team_id)?.name, short_name: teams.find((t) => t.id === p.team_id)?.short_name };
    const historyMatch = matchExpectedMetricsRow({ player: ratePlayer, source: priorHistoryProfiles });
    const a = mergeHistoricalProfile(directPrior, historyMatch);
    if (historyMatch) historicalMatches++;
    const u = matchExpectedMetricsRow({ player: ratePlayer, direct: directUnderstat, source: understat });
    if (u) understatMatches++;
    const nineties = a && a.minutes ? a.minutes / 90 : 0;
    const per90 = (v) => (nineties > 0 ? (v || 0) / nineties : 0);
    /* Understat is preferred. When it is absent, the name/team-matched history profile supplies
       real prior-season xG and xA. Actual goals and assists are still never substituted for expected
       metrics; only a genuinely data-free player reaches the broad positional fallback. */
    const resolvedRates = resolvePlayerRates({
      archive: a,
      understat: u,
      player: p,
      position: p.position,
      leagueRates: cfg.leagueRates,
    });
    return {
      player_id: p.id,
      rate_source: resolvedRates.source,
      fpl_id: p.fpl_id,
      position: p.position,
      team_id: p.team_id,
      web_name: p.web_name,
      npxg90: resolvedRates.npxg90,
      xa90: resolvedRates.xa90,
      rateNineties: resolvedRates.nineties,
      xaNineties: resolvedRates.xaNineties,
      npxgNineties: resolvedRates.npxgNineties,
      cbit90: per90(a ? a.cbit : 0),
      recoveries90: per90(a ? a.recoveries : 0),
      keyPasses90: per90(a ? a.key_passes : 0),
      yellow90: per90(a ? a.yellow : 0),
      red90: per90(a ? a.red : 0),
      og90: per90(a ? a.own_goals : 0),
      nineties,
      goals: a ? a.goals : 0,
      xg: resolvedRates.xgTotal,
      shots: resolvedRates.shots,
      penRank: Number(penDuty.get(p.id)?.rank) || 0,
      penConfidence: Number.isFinite(Number(penDuty.get(p.id)?.confidence)) ? Number(penDuty.get(p.id).confidence) : null,
      penEvidence: penDuty.get(p.id)?.evidence || null,
      penSource: penDuty.get(p.id)?.source || null,
      pensTaken: a ? Number(a.pens_taken) || 0 : 0,
      pensScored: a ? Number(a.pens_scored) || 0 : 0,
      estimatedPenAttempts: penaltyAttemptsFromExpectedGoals(u?.xg, u?.npxg, spotPenaltyXg),
      penConversion: penaltyConversion(
        a ? a.pens_scored || 0 : 0,
        a ? a.pens_taken || 0 : 0,
        leaguePenScored,
        leaguePenTaken,
        cfg.penAttemptK
      ),
      // Layer 3 inputs
      status: p.status,
      chance_of_playing: p.chance_of_playing,
      minutes: a ? a.minutes : 0,
      starts: a ? a.starts : 0,
      starts60: a ? a.starts60 : 0,
      startMinutes: a ? a.start_minutes : 0,
      cameos: a ? a.cameos : 0,
      cameoMinutes: a ? a.cameo_minutes : 0,
      appearances: a ? (a.starts || 0) + (a.cameos || 0) : 0,
      teamGames: archiveGamesPerTeam,
      teamMinutesAvailable: archiveGamesPerTeam ? archiveGamesPerTeam * 90 : 0,
      wc_load_flag: false,
    };
  };

  /* Resolve the current predicted lineups before team profiles are grouped. A player named for a new club
     can still carry his old team_id in the upstream player table; the lineup supplies a temporary engine
     team override so he does not become a second goalkeeper at the old club and leave the new club empty. */
  const lineupResolution = resolveLineups(LINEUPS.clubs, players, live);
  const lineupVersion = lineupVersionOf(LINEUPS);
  const lineupTrust = lineupTrustOf(LINEUPS);
  const lineupGameweek = Number.isFinite(Number(LINEUPS.gameweek)) ? Number(LINEUPS.gameweek) : targetGws[0];
  const invalidLineups = [...lineupResolution.byClub.values()]
    .filter((x) => !x.valid)
    .map((x) => `${x.row.short}: ${x.problems.join(", ")}`);
  console.log(`lineup trust: ${lineupTrust.source || "none"} captured ${lineupTrust.captured || "-"}, GW${lineupGameweek}, official ${lineupTrust.official}, confidence ${lineupTrust.confidence}`);
  console.log(`lineup team overrides: ${lineupResolution.teamOverrideByFplId.size}`);
  if (invalidLineups.length) console.log(`invalid lineups kept as named-player evidence only: ${invalidLineups.join(" | ")}`);

  const profiles = players.map(profileOf).map((pr) => {
    const withRole = attachPlayerRole(pr, roleModel);
    const override = lineupResolution.teamOverrideByFplId.get(withRole.fpl_id);
    return override ? { ...withRole, team_id: override, lineup_team_override: true } : withRole;
  });
  console.log(`player expected-metric coverage: history ${historicalMatches}/${players.length}, understat ${understatMatches}/${players.length}`);
  const league = leagueMinutesMeans(profiles);
  const byTeam = new Map();
  for (const pr of profiles) {
    if (!byTeam.has(pr.team_id)) byTeam.set(pr.team_id, []);
    byTeam.get(pr.team_id).push(pr);
  }
  const teamPenaltyAttempts = new Map();
  for (const pr of profiles) {
    const attempts = (Number(pr.pensTaken) || 0) > 0
      ? Number(pr.pensTaken)
      : Number(pr.estimatedPenAttempts) || 0;
    teamPenaltyAttempts.set(pr.team_id, (teamPenaltyAttempts.get(pr.team_id) || 0) + attempts);
  }
  const priors = positionalSharePriors([...byTeam.entries()].map(([, ps]) => ({ players: ps })));
  const lineupRoles = lineupRolesOf(lineupResolution, profiles);
  console.log(`predicted elevens: ${lineupVersion}, ${lineupRoles.size} players carry a lineup role`);

  const isPromotedTeam = (teamId) => {
    const team = teams.find((t) => t.id === teamId);
    const configured = new Set((cfg.promotedTeamIds || []).map(Number));
    return Boolean(
      configured.has(Number(teamId))
      || team?.promoted
      || team?.is_promoted
      || team?.promoted_club
    );
  };
  // ── Layer 3 for every target gameweek
  const minutesRows = [];
  const minutesByGw = new Map();
  const minutesMetaByGw = new Map();
  for (const gw of targetGws) {
    const forGw = new Map();
    const metaGw = new Map();
    const byTeamGw = new Map();
    for (const pr of profiles) {
      const signal = signals.find((s) => s.player_id === pr.player_id && s.gw === gw) || null;
      const base = forecastMinutes({ player: pr, league, signal, gw, cfg });
      /* ONE resolver, shared with the app. Precedence: hard unavailability, then the predicted eleven,
         then the press signal already folded into the base forecast, then the forecast itself. */
      const lineupRole = gw === lineupGameweek ? (lineupRoles.get(pr.fpl_id) || null) : null;
      const f = resolveMinutes({
        base, lineup: lineupRole,
        status: pr.status, earlySubShare: cfg.earlySubShare ?? 0,
        confidence: lineupTrust.confidence, official: lineupTrust.official,
      });
      forGw.set(pr.player_id, f);
      metaGw.set(pr.player_id, {
        minutes_source: f.minutes_source,
        minutes_input_version: minutesInputVersion({
          lineupVersion, status: pr.status, chanceOfPlaying: pr.chance_of_playing,
          minutesSource: f.minutes_source, confidence: lineupTrust.confidence,
        }),
      });
      if (!byTeamGw.has(pr.team_id)) byTeamGw.set(pr.team_id, []);
      byTeamGw.get(pr.team_id).push(f);
    }
    /* Eleven players start, so each team's start chances are scaled to sum to eleven BEFORE anything is
       stored or simulated. Without this, a squad full of unknowns showed a 26% start chance beside a
       projection from a simulation that started the player nearly every time: the number on screen and the
       number in the maths disagreed. */
    for (const [, fs] of byTeamGw) normaliseTeamStarts(fs, cfg);
    for (const pr of profiles) {
      const f = forGw.get(pr.player_id);
      minutesRows.push({
        player_id: pr.player_id, gw, model_version: MINUTES_MODEL.version,
        p_start: f.p_start, p_cameo: f.p_cameo, p60: f.p60, p60_given_start: f.p60_given_start,
        exp_min_start: f.exp_min_start, exp_min_cameo: f.exp_min_cameo, wc_load_flag: f.wc_load_flag,
      });
    }
    minutesByGw.set(gw, forGw);
    minutesMetaByGw.set(gw, metaGw);
  }

  /* WHICH CLUBS ARE PROMOTED, derived rather than typed. A hardcoded list goes stale every August. A club
     with no meaningful prior Premier League minutes across its whole squad was not in the league last
     season. The threshold is deliberately low: one loaned-out returnee should not make a promoted club look
     established. */
  const priorMinutesByTeam = new Map();
  for (const p of players) {
    const a = prior.get(p.id);
    if (!a) continue;
    priorMinutesByTeam.set(p.team_id, (priorMinutesByTeam.get(p.team_id) || 0) + (Number(a.minutes) || 0));
  }
  const PROMOTED_UNDER_MINUTES = 9000; // a settled squad clears this many league minutes several times over
  const isPromoted = (teamId) => (priorMinutesByTeam.get(teamId) || 0) < PROMOTED_UNDER_MINUTES;
  const promotedNames = live.filter((t) => isPromoted(t.id)).map((t) => t.short_name || t.name);
  console.log(`promoted clubs detected: ${promotedNames.length ? promotedNames.join(", ") : "none"}`);

  // ── Layer 0/1/2/4 per fixture
  const projRows = [];
  let oddsBacked = 0;
  let fallbackUsed = 0;

  for (const fx of fixtures) {
    const raw = latestOdds.get(fx.id);
    const snapshot = env.get(fx.id);
    let lambdas = null;
    let odds = false;
    if (raw) {
      // Layer 0 proper: power-method de-overround, then means solved against the Dixon-Coles
      // grid so they are consistent with the model that consumes them. The odds pull's own
      // proportional-Poisson lambdas stay untouched in implied_goals; this is the engine's fit.
      const solved = impliedGoalEnvironment(raw, cfg.rho);
      if (solved) {
        lambdas = solved;
        odds = true;
        oddsBacked++;
        await supabaseClient().from("implied_goals").insert({
          fixture_id: fx.id, odds_snapshot_id: raw.id,
          lambda_home: solved.lambda_home, lambda_away: solved.lambda_away,
          deoverround_method: solved.deoverround_method, fit_residual: solved.fit_residual,
        });
      }
    } else if (snapshot && snapshot.lambda_home && snapshot.lambda_away) {
      lambdas = { lambda_home: Number(snapshot.lambda_home), lambda_away: Number(snapshot.lambda_away), fit_residual: snapshot.fit_residual };
      odds = true;
      oddsBacked++;
    }
    if (!lambdas) {
      const home = teams.find((t) => t.id === fx.home_team);
      const away = teams.find((t) => t.id === fx.away_team);
      lambdas = fallbackGoalEnvironment(home?.strength, away?.strength, leagueMeanGoals, homeAdvantage);
      if (!lambdas) continue;
      fallbackUsed++;
    }

    const minutesForGw = minutesByGw.get(fx.gw);
    const build = (teamId, isPromoted, lambda) => {
      const list = (byTeam.get(teamId) || []).map((pr) => {
        const m = minutesForGw.get(pr.player_id) || {};
        /* minutes_source travels with the player so the lineup lock reaches normaliseTeamStarts and so the
           route can be persisted next to the projection it produced. */
        return { ...pr, p_start: m.p_start ?? 0, p_cameo: m.p_cameo ?? 0, p60: m.p60 ?? 0, p60_given_start: m.p60_given_start ?? 1, exp_min_start: m.exp_min_start ?? 0, exp_min_cameo: m.exp_min_cameo ?? 0, minutes_source: m.minutes_source || "forecast" };
      });
      const basePenaltyRate = shrunkPenaltyAwardRate({
        teamAttempts: teamPenaltyAttempts.get(teamId) || 0,
        teamMatches: archiveGamesPerTeam || 0,
        leagueAttempts: leaguePenTaken,
        leagueTeamMatches: archiveGamesPerTeam ? archiveGamesPerTeam * live.length : 0,
        priorMatches: cfg.penRateShrinkMatches,
      });
      return {
        teamId,
        players: list,
        promoted: isPromoted,
        penaltyBaseRate: basePenaltyRate,
        penAwardRate: fixturePenaltyAwardRate({
          baseRate: basePenaltyRate,
          lambda,
          leagueGoalsPerTeam: leagueMeanGoals / 2,
          exponent: cfg.penLambdaExponent,
          minScale: cfg.penLambdaMinScale,
          maxScale: cfg.penLambdaMaxScale,
        }),
      };
    };

    /* PROMOTED CLUBS WERE NEVER FLAGGED. Both call sites passed the literal false, so promotedBlend was 0
       for every club in the league and cfg.promotedPrior could never be applied: every stored projection
       carried prior_blend = 0, which is how the bug was confirmed. A club is promoted when it has no
       Premier League archive of its own, which is exactly what the prior-season table records. */
    const homeTeam = build(fx.home_team, isPromoted(fx.home_team), lambdas.lambda_home);
    const awayTeam = build(fx.away_team, isPromoted(fx.away_team), lambdas.lambda_away);
    // Allocation already renormalises goal and assist weights among the players
    // who are actually on the pitch in each simulation. Do not pre-reallocate
    // undefined shares through the broken legacy role-reallocation path.
    const homeAlloc = allocateTeam({ team: homeTeam, lambda: lambdas.lambda_home, priors, cfg, gw: fx.gw, promotedPrior: cfg.promotedPrior });
    const awayAlloc = allocateTeam({ team: awayTeam, lambda: lambdas.lambda_away, priors, cfg, gw: fx.gw, promotedPrior: cfg.promotedPrior });
    const { samples } = simulateFixture({
      fixture: fx,
      home: { ...homeTeam, players: homeAlloc.players },
      away: { ...awayTeam, players: awayAlloc.players },
      lambdas, rho: cfg.rho, rules, table, cfg, N: cfg.N,
    });

    /* DIAGNOSTIC INPUTS, PERSISTED WITH THE PROJECTION.
     *
     * None of this existed. Tracing Osula's 5.3 needed the team lambda, the rates used, their source and
     * the shares, and every one of them was computed inside this loop and then discarded, so the trace had
     * to be reconstructed by rerunning the engine by hand. Anything that decides a projection is now
     * written next to it. */
    const allocById = new Map();
    for (const alloc of [homeAlloc, awayAlloc]) {
      for (const pl of alloc.players || []) allocById.set(pl.player_id ?? pl.id, pl);
    }
    const metaForGw = minutesMetaByGw.get(fx.gw) || new Map();

    for (const [playerId, rec] of samples) {
      const s = summarise(rec, cfg.N);
      const isHome = rec.side === "home";
      const pl = allocById.get(playerId) || {};
      const meta = metaForGw.get(playerId) || {};
      const m = minutesForGw.get(playerId) || {};
      const teamContext = isHome ? homeTeam : awayTeam;
      projRows.push({
        player_id: playerId, gw: fx.gw, model_version: MODEL_VERSION,
        ep_mean: s.ep_mean, ep_sd: s.ep_sd,
        p_goal: s.p_goal, p_assist: s.p_assist, p_cs: s.p_cs,
        e_bonus: s.e_bonus, e_defcon: s.e_defcon,
        e_goals: s.e_goals, e_assists: s.e_assists,
        /* Keep Step 5 component diagnostics inside the existing JSON column so the live run is auditable
           without requiring Louis to apply a manual database migration. Existing p10/p50/p90 readers ignore
           the extra key. */
        quantiles: {
          ...s.quantiles,
          diagnostics: {
            e_pen_goals: s.e_pen_goals,
            penalty_share: Number(pl.penaltyShare) || 0,
            team_penalty_rate: Number.isFinite(Number(teamContext.penAwardRate)) ? Number(teamContext.penAwardRate) : null,
            team_penalty_base_rate: Number.isFinite(Number(teamContext.penaltyBaseRate)) ? Number(teamContext.penaltyBaseRate) : null,
            assist_role_weight: Number.isFinite(Number(cfg.assistRoleWeight?.[pl.role])) ? Number(cfg.assistRoleWeight[pl.role]) : null,
            resolved_team_id: teamContext.teamId,
          },
        }, p_12plus: s.p_12plus,
        ep_home: isHome ? s.ep_mean : null,
        ep_away: isHome ? null : s.ep_mean,
        prior_blend: isHome ? homeAlloc.promotedBlend : awayAlloc.promotedBlend,
        odds_backed: odds,
        computed_at: new Date().toISOString(),
        // resolved minutes, exactly as the simulation saw them
        r_p_start: m.p_start ?? null, r_p_cameo: m.p_cameo ?? null, r_p60: m.p60 ?? null,
        r_exp_min_start: m.exp_min_start ?? null, r_exp_min_cameo: m.exp_min_cameo ?? null,
        r_exp_minutes: expectedMinutesOf(m),
        minutes_source: meta.minutes_source ?? null,
        minutes_input_version: meta.minutes_input_version ?? null,
        lineup_version: lineupVersion,
        lineup_source: lineupTrust.source,
        lineup_captured: lineupTrust.captured,
        lineup_confidence: minutesForGw.get(playerId)?.lineup_confidence ?? null,
        // the fixture environment this player was priced in
        lambda_team: isHome ? lambdas.lambda_home : lambdas.lambda_away,
        lambda_opponent: isHome ? lambdas.lambda_away : lambdas.lambda_home,
        // the rates actually used, and where they came from
        used_npxg90: Number.isFinite(Number(pl.used_npxg90)) ? Number(pl.used_npxg90) : null,
        used_xa90: Number.isFinite(Number(pl.used_xa90)) ? Number(pl.used_xa90) : null,
        rate_source: pl.role ? `${pl.rate_source || "unknown"}|role:${pl.role}` : (pl.rate_source ?? null),
        goal_share: Number.isFinite(Number(pl.goalShare)) ? Number(pl.goalShare) : null,
        assist_share: Number.isFinite(Number(pl.assistShare)) ? Number(pl.assistShare) : null,
      });
    }
  }

  // ── write
  const chunk = async (tbl, rows, conflict) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseClient().from(tbl).upsert(rows.slice(i, i + 500), { onConflict: conflict });
      if (error) throw new Error(`${tbl}: ${error.message}`);
    }
  };
  await chunk("minutes_forecasts", minutesRows, "player_id,gw,model_version");
  await chunk("projections", projRows, "player_id,gw,model_version");

  await supabaseClient().from("model_versions").upsert({
    version: MODEL_VERSION,
    git_sha: process.env.GITHUB_SHA || null,
    data_snapshot_at: new Date().toISOString(),
    ruleset_version: rules.metadata.ruleset_version,
    notes: `N=${cfg.N} seed=${cfg.seed} gws=${targetGws.join(",")} odds_backed=${oddsBacked} fallback=${fallbackUsed} minutes=${MINUTES_MODEL.version}`,
  }, { onConflict: "version" });

  const interim = interimParameters(engineJson);
  await supabaseClient().from("engine_run_params").insert(
    interim.map((p) => ({ model_version: MODEL_VERSION, param_key: p.key, upgrade_date: p.upgrade_date }))
  );

  const gaps = [];
  if (!oddsBacked) gaps.push("no odds rows: every fixture used the team-strength fallback");
  if (leagueMeanGoals === null) gaps.push("league mean goals unavailable: odds-free fixtures were skipped");
  if (goalSource.startsWith("long-run")) gaps.push("goal environment came from the long-run league average, not from odds or scorelines, so every fixture is priced on team strength alone");
  if (scored.length < 20) gaps.push(`no scorelines yet, so home advantage uses the long-run figure of ${homeAdvantage} rather than one measured this season`);
  if (!(leaguePenTaken > 0)) gaps.push("neither archive nor Understat carries penalty-event volume: penalty EV unavailable");
  if (priorRows.every((r) => !r.key_passes)) gaps.push("archive carries no key passes: that BPS component reads zero");

  /* One engine route is only real if every active player was actually written. Run the same current-generation
     selector and integrity checks the app uses before marking this pipeline successful. This also removes stale
     rows from older runs, so a completed workflow cannot leave a mixed table behind. */
  /* A live validation run must keep the newly generated rows available even when the integrity audit finds
     football-quality failures. Otherwise the validator cannot export the exact bad generation it needs to
     diagnose. Scheduled production runs still enforce the gate and fail closed. GitHub supplies
     GITHUB_WORKFLOW automatically, so the existing workflow needs no secret or manual setting change. */
  const validationMode = process.env.GITHUB_WORKFLOW === "xpts-live-validation"
    || process.env.PROJECTION_INTEGRITY_ENFORCE === "0";
  const integrity = await cleanupStaleProjections({ enforce: !validationMode });

  const msg = `gws ${targetGws.join(",")} · rows ${projRows.length} · fixtures ${fixtures.length} (odds ${oddsBacked}, fallback ${fallbackUsed}) · goals from ${goalSource} · N=${cfg.N} · ${interim.length} interim params · integrity checked ${integrity.gameweeks.length} gameweeks with ${integrity.failures.length} issue(s)${gaps.length ? ` · ${gaps.length} data gaps` : ""}`;
  await beat("ok", msg);
  console.log("PROJECTION RUN — " + msg);
  if (gaps.length) console.log("Data gaps, stated rather than papered over:\n- " + gaps.join("\n- "));
  console.log(`xP gate: projections are stored but the UI shows them as INTERIM SCORE until model_gates.xp_visible flips (walk-forward calibration, 7 Aug).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
}
