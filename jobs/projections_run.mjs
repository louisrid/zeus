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
import { positionalSharePriors, allocateTeam, penaltyConversion } from "../lib/engine/layer2_allocation.mjs";
import { reallocate } from "../lib/engine/role_reallocation.mjs";
import { forecastMinutes, leagueMinutesMeans, MINUTES_MODEL } from "../lib/engine/layer3_minutes.mjs";
import { simulateFixture, summarise, } from "../lib/engine/layer4_sim.mjs";
import { scoringTable, squadRules } from "../lib/engine/points.mjs";

let _db = null;
const supabaseClient = () => {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
};
const JOB = "projections_run";
const rules = JSON.parse(readFileSync(new URL("../config/rules-2026-27.json", import.meta.url)));
const engineJson = JSON.parse(readFileSync(new URL("../config/engine-2026-27.json", import.meta.url)));
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
  const teams = await pageAll("teams", "id, fpl_id, name, short_name, strength, archive");
  const live = teams.filter((t) => !t.archive);
  // Archive players belong to last season's relegated clubs and cannot score in 2026/27. Projecting
  // them wasted the run on roughly 400 people and inflated every coverage measure: 950 forecasts
  // existed against 558 live players.
  const players = await pageAll(
    "players",
    "id, fpl_id, team_id, position, web_name, price, status, chance_of_playing, minutes",
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

  // League mean goals per match, derived — never a literal. Preference order matters because the
  // 2025/26 archive loader does not populate fixture scorelines, so the scoreline route is only
  // available for finished 2026/27 fixtures. The fallback sums actual player goals over the
  // archive, which the loader does populate.
  const scored = allFixtures.filter((f) => f.home_goals !== null && f.away_goals !== null);
  const archiveFixtures = allFixtures.filter((f) => f.season === "2025-26");
  const archiveGoals = priorRows.reduce((s, r) => s + (r.goals || 0), 0);
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
    (await pageAll("understat_player_season", "player_id, season, minutes, xg, xa, npxg, shots, key_passes"))
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
  const duty = await pageAll("set_piece_duty", "player_id, team_id, kind, rank");
  const penRank = new Map(duty.filter((d) => d.kind === "pen").map((d) => [d.player_id, d.rank]));
  const signals = await pageAll("presser_signals", "player_id, gw, signal, confidence");

  // League penalty totals from the archive, for the conversion shrinkage.
  const leaguePenScored = priorRows.reduce((s, r) => s + (r.pens_scored || 0), 0);
  const leaguePenTaken = priorRows.reduce((s, r) => s + (r.pens_taken || 0), 0);

  // Team penalty award rate per match, derived per team from the archive.
  const teamPens = new Map();
  for (const p of players) {
    const a = prior.get(p.id);
    if (!a) continue;
    const cur = teamPens.get(p.team_id) || { taken: 0 };
    cur.taken += a.pens_taken || 0;
    teamPens.set(p.team_id, cur);
  }
  const archiveGamesPerTeam = archiveFixtures.length ? (2 * archiveFixtures.length) / Math.max(1, live.length) : null;

  // ── per-player rate profile
  const profileOf = (p) => {
    const a = prior.get(p.id);
    const u = understat.get(p.id);
    const nineties = a && a.minutes ? a.minutes / 90 : 0;
    const per90 = (v) => (nineties > 0 ? (v || 0) / nineties : 0);
    const uNineties = u && u.minutes ? u.minutes / 90 : 0;
    const npxg90 = uNineties > 0 ? (Number(u.npxg) || 0) / uNineties : per90(a ? a.goals : 0);
    const xa90 = uNineties > 0 ? (Number(u.xa) || 0) / uNineties : per90(a ? a.assists : 0);
    return {
      player_id: p.id,
      fpl_id: p.fpl_id,
      position: p.position,
      team_id: p.team_id,
      npxg90,
      xa90,
      cbit90: per90(a ? a.cbit : 0),
      recoveries90: per90(a ? a.recoveries : 0),
      keyPasses90: per90(a ? a.key_passes : 0),
      yellow90: per90(a ? a.yellow : 0),
      red90: per90(a ? a.red : 0),
      og90: per90(a ? a.own_goals : 0),
      nineties,
      goals: a ? a.goals : 0,
      xg: u ? Number(u.xg) || 0 : 0,
      shots: u ? Number(u.shots) || 0 : 0,
      penRank: penRank.get(p.id) || 0,
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

  const profiles = players.map(profileOf);
  const league = leagueMinutesMeans(profiles);
  const byTeam = new Map();
  for (const pr of profiles) {
    if (!byTeam.has(pr.team_id)) byTeam.set(pr.team_id, []);
    byTeam.get(pr.team_id).push(pr);
  }
  const priors = positionalSharePriors([...byTeam.entries()].map(([, ps]) => ({ players: ps })));

  // ── Layer 3 for every target gameweek
  const minutesRows = [];
  const minutesByGw = new Map();
  for (const gw of targetGws) {
    const forGw = new Map();
    for (const pr of profiles) {
      const signal = signals.find((s) => s.player_id === pr.player_id && s.gw === gw) || null;
      const f = forecastMinutes({ player: pr, league, signal, gw, cfg });
      forGw.set(pr.player_id, f);
      minutesRows.push({
        player_id: pr.player_id, gw, model_version: MINUTES_MODEL.version,
        p_start: f.p_start, p_cameo: f.p_cameo, p60: f.p60, p60_given_start: f.p60_given_start,
        exp_min_start: f.exp_min_start, exp_min_cameo: f.exp_min_cameo, wc_load_flag: f.wc_load_flag,
      });
    }
    minutesByGw.set(gw, forGw);
  }

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
    const build = (teamId, isPromoted) => {
      const list = (byTeam.get(teamId) || []).map((pr) => {
        const m = minutesForGw.get(pr.player_id) || {};
        return { ...pr, p_start: m.p_start ?? 0, p_cameo: m.p_cameo ?? 0, p60_given_start: m.p60_given_start ?? 1, exp_min_start: m.exp_min_start ?? 0, exp_min_cameo: m.exp_min_cameo ?? 0 };
      }).filter((pr) => pr.p_start > 0 || pr.p_cameo > 0);
      const penTaken = teamPens.get(teamId)?.taken || 0;
      return {
        teamId,
        players: list,
        promoted: isPromoted,
        penAwardRate: archiveGamesPerTeam && penTaken > 0 ? penTaken / archiveGamesPerTeam : null,
      };
    };

    const homeTeam = build(fx.home_team, false);
    const awayTeam = build(fx.away_team, false);
    // ROLE REALLOCATION (DECISIONS 9.12). Before allocation, an unavailable player's goal and assist
    // share transfers to available teammates in the same position group, and penalty duty passes to
    // the next available taker, with the club total conserved. Without this, an injured striker's
    // share simply vanished and the club's expected output under-allocated.
    const withReallocation = (team) => {
      const clubDuties = (duty || []).filter((d) => d.team_id === team.teamId && d.kind === "pen");
      const shift = reallocate({ players: team.players, duties: clubDuties, shareOf: (pl) => pl.goalShare });
      const aShift = reallocate({ players: team.players, duties: [], shareOf: (pl) => pl.assistShare });
      return {
        ...team,
        players: team.players.map((pl) => {
          const g = shift.get(pl.id), a = aShift.get(pl.id);
          return {
            ...pl,
            goalShare: g ? g.share : pl.goalShare,
            assistShare: a ? a.share : pl.assistShare,
            onPenalties: g ? g.onPenalties : pl.onPenalties,
          };
        }),
      };
    };
    const homeAlloc = allocateTeam({ team: withReallocation(homeTeam), lambda: lambdas.lambda_home, priors, cfg, gw: fx.gw, promotedPrior: cfg.promotedPrior });
    const awayAlloc = allocateTeam({ team: withReallocation(awayTeam), lambda: lambdas.lambda_away, priors, cfg, gw: fx.gw, promotedPrior: cfg.promotedPrior });

    const { samples } = simulateFixture({
      fixture: fx,
      home: { ...homeTeam, players: homeAlloc.players },
      away: { ...awayTeam, players: awayAlloc.players },
      lambdas, rho: cfg.rho, rules, table, cfg, N: cfg.N,
    });

    for (const [playerId, rec] of samples) {
      const s = summarise(rec, cfg.N);
      const isHome = rec.side === "home";
      projRows.push({
        player_id: playerId, gw: fx.gw, model_version: MODEL_VERSION,
        ep_mean: s.ep_mean, ep_sd: s.ep_sd,
        p_goal: s.p_goal, p_assist: s.p_assist, p_cs: s.p_cs,
        e_bonus: s.e_bonus, e_defcon: s.e_defcon,
        e_goals: s.e_goals, e_assists: s.e_assists,
        quantiles: s.quantiles, p_12plus: s.p_12plus,
        ep_home: isHome ? s.ep_mean : null,
        ep_away: isHome ? null : s.ep_mean,
        prior_blend: isHome ? homeAlloc.promotedBlend : awayAlloc.promotedBlend,
        odds_backed: odds,
        computed_at: new Date().toISOString(),
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
  if (leaguePenTaken === 0) gaps.push("archive carries no penalty attempts: penalty EV is zero, not estimated");
  if (priorRows.every((r) => !r.key_passes)) gaps.push("archive carries no key passes: that BPS component reads zero");

  const msg = `gws ${targetGws.join(",")} · rows ${projRows.length} · fixtures ${fixtures.length} (odds ${oddsBacked}, fallback ${fallbackUsed}) · goals from ${goalSource} · N=${cfg.N} · ${interim.length} interim params${gaps.length ? ` · ${gaps.length} data gaps` : ""}`;
  await beat("ok", msg);
  console.log("PROJECTION RUN — " + msg);
  if (gaps.length) console.log("Data gaps, stated rather than papered over:\n- " + gaps.join("\n- "));
  console.log(`xP gate: projections are stored but the UI shows them as INTERIM SCORE until model_gates.xp_visible flips (walk-forward calibration, 7 Aug).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await beat("error", String(e.message || e)); process.exit(1); });
}
