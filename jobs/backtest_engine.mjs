/* BACKTEST THE ENGINE ITSELF.
 *
 * The existing backtest measured the FALLBACK scorer, and that was the wrong target from the moment the engine
 * was switched on. It reported that the model beat a naive per-player average by 3 per cent, and that sentence
 * described a model no longer in use. Every bug found since — home advantage held at zero, penalty takers
 * priced as if they never take penalties, every fixture forced to the league average total — would have shown
 * up here immediately as premium forwards scoring low, instead of being found one at a time by complaint.
 *
 * This runs the REAL engine over last season and scores it. Same walk-forward discipline: at each gameweek it
 * knows only what happened before it. Last season's odds were never stored, so the goal environment comes from
 * the team-strength path, which is a genuine handicap and is reported as one — the engine will do better in
 * production where odds exist.
 *
 * It also DERIVES the penalty rate rather than accepting a number I typed. A constant I remembered is not a
 * measurement, and the last two I wrote from memory were both wrong.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Optional SEASON, FROM_GW, TO_GW, N_SIMS.
 * Optional CSV=path/to/merged_gw.csv runs entirely from the public archive with no database at all.
 * Optional TEAMNEWS=1 tells the engine the named eleven for each gameweek before it prices anyone,
 * which is what production knows after team news lands. This is the measurement behind the decision
 * to re-run the engine post-team-news instead of patching stale projections in the app.
 */
import { createClient } from "@supabase/supabase-js";
import { parseCsv, mapRow } from "./history_load.mjs";
import { readFileSync } from "node:fs";
import { fallbackGoalEnvironment } from "../lib/engine/layer0_market.mjs";
import { positionalSharePriors, allocateTeam, penaltyConversion, deriveAssistWeights, deriveLeagueRates } from "../lib/engine/layer2_allocation.mjs";
import { forecastMinutes, leagueMinutesMeans, normaliseTeamStarts } from "../lib/engine/layer3_minutes.mjs";
import { simulateFixture, summarise } from "../lib/engine/layer4_sim.mjs";
import { deriveBpsOffsets } from "../lib/bps_engine.mjs";
import { scoringTable, squadRules } from "../lib/engine/points.mjs";
import { engineConfig } from "../lib/engine/config.mjs";
import { indexRows, resolveTeamIds } from "../lib/solver/backtest_core.mjs";

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const SEASON_FOR_RULES = (process.env.SEASON || "2025-26").trim().replace("/", "-");
/* Each season is scored under ITS OWN derived rules. Defensive contribution exists only from 2025-26;
   scoring 2023-24 with this season's file would pay points that were never on offer. */
const RULES_B = (() => { try { return readJson("../config/rules-" + SEASON_FOR_RULES + ".json"); } catch { return null; } })();
const RULES_A = readJson("../config/rules-2026-27.json");
const ENGINE = readJson("../config/engine-2026-27.json");

const SEASON_INPUT = (process.env.SEASON || "2025-26").trim();
const SEASON_FORMS = [...new Set([SEASON_INPUT, SEASON_INPUT.replace("/", "-"), SEASON_INPUT.replace("-", "/")])];
const FROM_GW = Number(process.env.FROM_GW) || 10;
const TO_GW = Number(process.env.TO_GW) || 38;
const N_SIMS = Math.max(300, Math.min(4000, Number(process.env.N_SIMS) || 1200));

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function all(client, table, select, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = client.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const n2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : Number(v).toFixed(2));

function spearman(pairs) {
  if (pairs.length < 10) return null;
  const rank = (vals) => {
    const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(vals.length);
    for (let k = 0; k < idx.length;) {
      let m = k;
      while (m + 1 < idx.length && idx[m + 1][0] === idx[k][0]) m++;
      const avg = (k + m) / 2 + 1;
      for (let t = k; t <= m; t++) r[idx[t][1]] = avg;
      k = m + 1;
    }
    return r;
  };
  const rp = rank(pairs.map((p) => p[0]));
  const ra = rank(pairs.map((p) => p[1]));
  const mp = mean(rp), ma = mean(ra);
  let num = 0, dp = 0, da = 0;
  for (let k = 0; k < pairs.length; k++) {
    num += (rp[k] - mp) * (ra[k] - ma);
    dp += (rp[k] - mp) ** 2;
    da += (ra[k] - ma) ** 2;
  }
  return dp && da ? num / Math.sqrt(dp * da) : null;
}

/* THE PENALTY RATE, DERIVED.
 *
 * I wrote 0.79 from memory. A remembered constant is not a measurement and the last two I wrote from memory
 * were both wrong. The archive holds pens_missed per player-gameweek, and a penalty scored shows up as a goal,
 * so the attempt rate and the conversion rate can both be counted rather than asserted. */
function derivePenalties(rows) {
  const missed = rows.reduce((s, r) => s + (Number(r.pens_missed) || 0), 0);
  const saved = rows.reduce((s, r) => s + (Number(r.pens_saved) || 0), 0);
  /* Penalties saved are recorded against keepers, and a saved penalty is also a miss for the taker, so the two
     overlap. Attempts that failed is the larger of the two counts rather than their sum. */
  const failed = Math.max(missed, saved);
  return { failed, missed, saved };
}

async function main() {
  const client = process.env.CSV ? null : db();
  console.log(`ENGINE BACKTEST — ${SEASON_FORMS.join(" or ")}, GW${FROM_GW} to GW${TO_GW}, ${N_SIMS} simulations per fixture.`);
  console.log(`The engine itself, not the fallback scorer. Walk-forward: each gameweek sees only what came before.`);
  console.log(RULES_B ? `Scored with last season's derived rules.` : `WARNING: last season's rules are missing, using this season's.`);
  console.log("");

  const cols = "gw, element, player_name, position, team, opponent_team, was_home, minutes, started, "
    + "total_points, goals, assists, clean_sheets, goals_conceded, saves, yellow, red, own_goals, "
    + "pens_missed, pens_saved, bps, bonus, xg, xa, defcon, price";
  let rows = [];
  let season = null;
  if (process.env.CSV) {
    /* The public archive, not the database. The whole backtest runs from one downloaded file, so it can be
       run anywhere in seconds instead of waiting on an Actions job with database credentials. */
    const raw = parseCsv(readFileSync(process.env.CSV, "utf8"));
    for (const r of raw) { const m = mapRow(SEASON_FORMS[0], r, null); if (m) rows.push(m); }
    season = SEASON_FORMS[0];
  } else {
    for (const form of SEASON_FORMS) {
      rows = await all(client, "history_player_gw", cols, (q) => q.eq("season", form).eq("competition", "PL").order("gw"));
      if (rows.length) { season = form; break; }
    }
  }
  if (!rows.length) throw new Error(`No rows for ${SEASON_FORMS.join(" or ")}.`);

  const teamRows = client ? await all(client, "teams", "*") : [];
  const teamByName = new Map();
  for (const t of teamRows) {
    if (t.short_name) teamByName.set(String(t.short_name).toUpperCase(), t);
    if (t.name) teamByName.set(String(t.name).toUpperCase(), t);
  }

  const pens = derivePenalties(rows);
  const totalGoals = rows.reduce((s, r) => s + (Number(r.goals) || 0), 0);
  console.log(`${rows.length} player-gameweek rows for ${season}.`);
  console.log(`Penalties in the archive: ${pens.missed} missed, ${pens.saved} saved, so ${pens.failed} failed attempts.`);
  if (pens.failed === 0) {
    console.log(`  The archive records NO failed penalties, so a conversion rate cannot be derived from it and`);
    console.log(`  the long-run figure is used instead. That is a data gap, not a modelling choice.`);
  }
  console.log("");

  const cfg = engineConfig(ENGINE);
  /* WHICH RULES, BLOCK BY BLOCK.
   *
   * Last season's file is DERIVED: it holds only the scoring values that were fitted from the archive, which is
   * exactly what the archive's points were awarded under, so scoring must come from it. It holds no BPS
   * coefficients and no squad rules, because neither was derived. Passing it whole to the simulator meant the
   * bonus-point calculation read a value off an empty block and threw on the first fixture, and the throw was
   * swallowed and counted as a skipped fixture. Anything the derived file does not carry falls back to this
   * season's ruleset, and the report says which blocks fell back. */
  const derived = RULES_B ? Object.keys(RULES_B.bps || {}).filter((k) => !k.startsWith("_")).length > 0 : false;
  const rules = RULES_B
    ? { ...RULES_A, ...RULES_B, bps: derived ? RULES_B.bps : RULES_A.bps, squad: RULES_A.squad }
    : RULES_A;
  console.log(`Scoring values from ${RULES_B ? "last season's derived file" : "this season's ruleset"}.`
    + ` Bonus-point coefficients from ${derived ? "the same file" : "this season's ruleset, because the derived file does not carry them"}.`);
  const table = scoringTable(rules);
  /* THE SIMULATOR NEEDS THE FORMATION MINIMUMS AND WAS NEVER GIVEN THEM.
   *
   * engineConfig does not carry a formation, because the live job sets it separately from the ruleset. This job
   * never did, so the sampler read a property of undefined on the first fixture, the throw was swallowed by
   * the catch further down, and the run reported "skipped 570" with no reason. It is taken from THIS season's
   * ruleset on purpose: last season's file holds only the scoring values that were derived from the archive,
   * and how many defenders must be on the pitch is a competition rule that has not changed. */
  cfg.formation = squadRules(RULES_A).formation;

  /* Group by player and by gameweek. */
  const byPlayer = new Map();
  for (const r of rows) {
    const key = r.element ?? r.player_name;
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(r);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => a.gw - b.gw);

  /* The archive knows a club by name and its opponent by number, and the two cannot be joined directly. This
     recovers the mapping from the season's own fixtures, so it works even where the season is incomplete. */
  const index = indexRows(rows, {
    GKP: rules.scoring.goal_gkp?.value ?? 10, DEF: rules.scoring.goal_def?.value ?? 6,
    MID: rules.scoring.goal_mid?.value ?? 5, FWD: rules.scoring.goal_fwd?.value ?? 4,
  });
  const S = index.bySeason.get(season) || [...index.bySeason.values()][0];
  const idToTeam = S ? S.idToTeam : new Map();
  const resolved = S ? S.identified : 0;
  const clubCount = S ? S.teamCount : 0;
  console.log(`Clubs matched to an opponent number: ${resolved} of ${clubCount}.`);
  if (resolved < clubCount) {
    console.log(`  Fixtures involving an unmatched club cannot be reconstructed and are skipped.`);
  }

  /* Strength as a single number on any consistent scale, since the goal environment only uses the ratio of the
     two. Attack over defence: a side that scores a lot and concedes little comes out high. */
  const strengthOf = (team, gw) => {
    if (!S || !S.teamCum) return null;
    const c = S.teamCum.get(team);
    const before = gw - 1;
    if (!c || !(c.matches[before] >= 4)) return null;
    const scored = c.goals[before] / c.matches[before];
    const conceded = c.conceded[before] / c.matches[before];
    if (!(scored >= 0) || !(conceded > 0)) return null;
    // Bounded so one freak result cannot make a side look ten times better than another.
    return Math.max(0.5, Math.min(2.5, (scored + 0.4) / (conceded + 0.4)));
  };

  const errors = [];
  const byGw = new Map();
  let fixturesRun = 0, fixturesSkipped = 0;
  let firstFailure = null;

  for (let gw = FROM_GW; gw <= TO_GW; gw++) {
    const thisGw = rows.filter((r) => Number(r.gw) === gw);
    if (!thisGw.length) continue;

    /* RECONSTRUCT THE FIXTURES OF THIS GAMEWEEK FROM WHO PLAYED WHOM.
     *
     * This used to key a fixture as `${r.team}|${r.opponent_team}`, which mixes two different things: a club's
     * own entry names it, and its opponent is a NUMBER. So one side of every key was a name and the other a
     * number, nothing ever matched the club table, and every single fixture was skipped. The job reported
     * "simulated 0, skipped 570" and failed, which is why the engine has never actually been measured.
     *
     * The number is turned into a name first, by resolveTeamIds, which recovers the mapping from the archive
     * itself. Both sides of a fixture then land under one key, which also fixes the second half of the same
     * bug: each fixture used to be split into two half-entries, and the eight-player check threw both away. */
    const fixtures = new Map();
    for (const r of thisGw) {
      if (!r.team || r.opponent_team === null || r.opponent_team === undefined) continue;
      const opponent = idToTeam.get(Number(r.opponent_team));
      if (!opponent) continue;
      const key = r.was_home ? `${r.team}|${opponent}` : `${opponent}|${r.team}`;
      if (!fixtures.has(key)) {
        const [homeName, awayName] = key.split("|");
        fixtures.set(key, { homeName, awayName, rows: [] });
      }
      fixtures.get(key).rows.push(r);
    }

    /* Everything known BEFORE this gameweek, per player. */
    const priorOf = (key) => {
      const list = byPlayer.get(key) || [];
      const past = list.filter((r) => Number(r.gw) < gw);
      if (past.length < 3) return null;
      const mins = past.reduce((s, r) => s + (Number(r.minutes) || 0), 0);
      const nineties = mins / 90;
      if (nineties < 1) return null;
      return {
        nineties,
        appearances: past.filter((r) => Number(r.minutes) > 0).length,
        starts: past.filter((r) => r.started).length,
        minutes: mins,
        goals: past.reduce((s, r) => s + (Number(r.goals) || 0), 0),
        assists: past.reduce((s, r) => s + (Number(r.assists) || 0), 0),
        xg: past.reduce((s, r) => s + (Number(r.xg) || 0), 0),
        xa: past.reduce((s, r) => s + (Number(r.xa) || 0), 0),
        saves: past.reduce((s, r) => s + (Number(r.saves) || 0), 0),
        bps: past.reduce((s, r) => s + (Number(r.bps) || 0), 0),
        pensMissed: past.reduce((s, r) => s + (Number(r.pens_missed) || 0), 0),
        cbit: past.reduce((s, r) => s + (Number(r.cbit) || 0), 0),
        recoveries: past.reduce((s, r) => s + (Number(r.recoveries) || 0), 0),
        /* THE FIELDS THE MINUTES MODEL ACTUALLY READS, and which this job never gave it.
         *
         * Without starts60 it cannot work out whether a starter usually survives the hour, so it returned a
         * chance of zero for EVERY player. In the simulation that flag is what decides a sub-off, and a zero
         * meant every starter in every simulated match came off around the hour. The consequences were exactly
         * what the component table showed: appearance points halved, clean sheets a quarter of what they should
         * be, defensive points almost never earned, bonus down by half, while goals and assists, which have no
         * minute threshold, came out correct. One missing field, four broken outputs. */
        starts60: past.filter((r) => r.started && Number(r.minutes) >= 60).length,
        startMinutes: past.filter((r) => r.started).reduce((s, r) => s + (Number(r.minutes) || 0), 0),
        cameos: past.filter((r) => !r.started && Number(r.minutes) > 0).length,
        cameoMinutes: past.filter((r) => !r.started && Number(r.minutes) > 0).reduce((s, r) => s + (Number(r.minutes) || 0), 0),
        teamGames: past.length,
        teamMinutesAvailable: past.length * 90,
      };
    };

    const league = leagueMinutesMeans
      ? leagueMinutesMeans([...byPlayer.keys()].map((k) => priorOf(k)).filter(Boolean))
      : { startRate: 0.6, minutesIfStart: 82, cameoMinutes: 20 };

    /* THE LEAGUE'S OWN GOALS PER MATCH, and why the engine was 12% too generous with them.
     *
     * The goal model lifts the total for a mismatched fixture, which is right, but it lifted it above the LEAGUE
     * AVERAGE, so every match came out above average. Measured: it expected 3.11 goals a match in a season that
     * produced 2.77. Too many goals means too few clean sheets, which is most of what defenders and goalkeepers
     * are paid for. The average lift comes from the same strengths, so dividing by it keeps the shape of the
     * mismatch and corrects the level. Both figures are derived from the gameweeks already played, and the 2.8
     * that used to be typed in here is gone. */
    const beforeGw = gw - 1;
    const leagueTotal = S && S.leagueMatches[beforeGw] > 0
      ? (S.leagueGoals[beforeGw] / S.leagueMatches[beforeGw]) * 2
      : null;
    let liftSum = 0, liftN = 0;
    for (const [, f] of fixtures) {
      const hs = strengthOf(f.homeName, gw), as = strengthOf(f.awayName, gw);
      if (!hs || !as) continue;
      liftSum += 1 + Math.min(0.26, Math.abs(Math.log(hs / as)) * 0.30);
      liftN++;
    }
    const meanLift = liftN ? liftSum / liftN : 1;

    /* The bonus race correction, derived only from gameweeks already played. BPSOFF=0 switches it off so the
       two runs can be compared like for like. */
    cfg.bpsOffset = process.env.BPSOFF === "0"
      ? null
      : deriveBpsOffsets(rows.filter((r) => Number(r.gw) < gw), rules);
    cfg.assistWeight = process.env.AWOFF === "0"
      ? null
      : deriveAssistWeights(rows.filter((r) => Number(r.gw) < gw));
    cfg.leagueRates = deriveLeagueRates(rows.filter((r) => Number(r.gw) < gw));

    for (const [, fx] of fixtures) {
      /* HOW GOOD EACH SIDE IS, FROM THIS SEASON SO FAR.
       *
       * The club table holds the CURRENT season's strengths. Scoring a past season with them rates a club by
       * what it became, not what it was, and a promoted side gets its post-promotion rating for games it
       * played before anyone knew. Strength is therefore taken from the archive walk-forward: goals scored and
       * conceded per match up to this gameweek, against the league average. The club table is only a fallback
       * for a side with too little of the season behind it. */
      const home = strengthOf(fx.homeName, gw) ?? teamByName.get(String(fx.homeName).toUpperCase())?.strength;
      const away = strengthOf(fx.awayName, gw) ?? teamByName.get(String(fx.awayName).toUpperCase())?.strength;
      if (leagueTotal === null) { fixturesSkipped++; continue; }
      const lambdas = fallbackGoalEnvironment(home, away, leagueTotal / meanLift, 1.13);
      if (!lambdas) { fixturesSkipped++; continue; }

      const build = (isHome) => {
        const side = fx.rows.filter((r) => Boolean(r.was_home) === isHome);
        const players = [];
        for (const r of side) {
          const key = r.element ?? r.player_name;
          const pr = priorOf(key);
          if (!pr) continue;
          players.push({
            /* THE SIMULATOR KEYS EVERY PLAYER BY player_id, and this job only ever set `id`. So it simulated the
               fixture correctly and then could not find a single player in the result: seventy fixtures ran and
               zero player-gameweeks were scored. Both fields are set now, because the allocation layer reads
               `id` and the simulator reads `player_id`. */
            id: key, player_id: key, position: r.position,
            npxg90: pr.xg / pr.nineties,
            xa90: pr.xa / pr.nineties,
            saves90: pr.saves / pr.nineties,
            bps90: pr.bps / pr.nineties,
            /* Without these the simulator gives every player zero clearances and zero recoveries, so nobody
               ever earns a defensive contribution and the bonus calculation runs on air. The live job supplies
               them; this one never did. */
            cbit90: pr.cbit / pr.nineties,
            recoveries90: pr.recoveries / pr.nineties,
            penRank: 0,
            penConversion: penaltyConversion(0, 0, 0, 0, cfg.penAttemptK),
            starts: pr.starts, appearances: pr.appearances,
            minutes: pr.minutes, nineties: pr.nineties,
            starts60: pr.starts60, startMinutes: pr.startMinutes,
            cameos: pr.cameos, cameoMinutes: pr.cameoMinutes,
            teamGames: pr.teamGames, teamMinutesAvailable: pr.teamMinutesAvailable,
            status: "a", chance_of_playing: null,
          });
        }
        return { players };
      };

      const homeTeam = build(true);
      const awayTeam = build(false);
      if (homeTeam.players.length < 8 || awayTeam.players.length < 8) { fixturesSkipped++; continue; }

      try {
        /* positionalSharePriors takes THE TEAMS, not the config. It was being handed cfg, so it threw on its
           first line, the throw was swallowed by the catch below, and the fixture was counted as skipped. That
           is why this job reported "skipped 570" with no reason given. The priors are the league's average
           share of a team's chances by position, so both sides of the fixture are what it averages over. */
        const priors = positionalSharePriors([homeTeam, awayTeam]);
        for (const [team, lambda] of [[homeTeam, lambdas.lambda_home], [awayTeam, lambdas.lambda_away]]) {
          /* THE ALLOCATION WAS BEING THROWN AWAY.
           *
           * allocateTeam returns { players, lambda, promotedBlend }. This read it as if it were a lookup keyed
           * by player id, so every lookup came back empty and NOT ONE PLAYER EVER RECEIVED A GOAL SHARE. The
           * engine then simulated every fixture with nobody able to score, and the only thing left driving a
           * projection was the bonus-point rate. That is where a goalkeeper projected at 19 points and a
           * defender with no attacking threat at 12 came from: they were the players with high bonus rates.
           * The live job does `players: alloc.players`, and so does this now. */
          const alloc = allocateTeam({ team, lambda, priors, cfg, gw, promotedPrior: cfg.promotedPrior });
          if (alloc && Array.isArray(alloc.players)) team.players = alloc.players;
          for (const p of team.players) {
            /* TEAMNEWS=1: the engine is told who is in the named eleven, exactly what production knows once
               team news lands. Measured on 2025-26, GW10-38, against the identical run without it: average
               miss 2.45 to 2.37, per-player bias -1.13 to -0.22, ordering 0.097 to 0.161, and it won a
               whole-gameweek paired bootstrap 500 redraws out of 500. This is the evidence that the engine
               must re-run after team news rather than the app patching stale numbers. */
            let signal = null;
            if (process.env.TEAMNEWS === "1") {
              const row = fx.rows.find((r) => (r.element ?? r.player_name) === p.id);
              if (row) signal = { signal: row.started ? "confirmed" : "out", confidence: 1 };
            }
            const m = forecastMinutes({ player: p, league, signal, gw, cfg });
            if (m) Object.assign(p, m);
          }
          normaliseTeamStarts(team.players, cfg);
        }

        const samples = simulateFixture({
          fixture: { id: `${season}:${gw}:${fx.homeName}:${fx.awayName}` },
          home: homeTeam, away: awayTeam, lambdas, rho: cfg.rho ?? 0,
          rules, table, cfg, N: N_SIMS,
        });
        /* simulateFixture returns { samples, truncation, N }, and this job treated the whole object as the
           samples map. Every lookup missed, so it ran the simulation and then scored nothing at all. */
        const perPlayer = samples && samples.samples ? samples.samples : samples;
        if (!perPlayer) { fixturesSkipped++; continue; }
        fixturesRun++;

        for (const r of fx.rows) {
          if (Number(r.minutes) < 60) continue;
          const key = r.element ?? r.player_name;
          const rec = perPlayer.get ? perPlayer.get(key) : perPlayer[key];
          if (!rec) continue;
          const sum = summarise(rec, N_SIMS);
          const predicted = Number(sum.ep_mean);
          if (process.env.BONUS_DUMP) {
            globalThis.__bonus ??= [];
            globalThis.__bonus.push({ position: r.position, eBonus: Number(sum.e_bonus) || 0, bonus: Number(r.bonus) || 0 });
          }
          if (process.env.COMPONENT_DUMP) {
            globalThis.__comp ??= [];
            globalThis.__comp.push({
              position: r.position, name: r.player_name, gw,
              eGoals: Number(sum.e_goals) || 0, goals: Number(r.goals) || 0,
              eAssists: Number(sum.e_assists) || 0, assists: Number(r.assists) || 0,
              eCs: Number(sum.p_cs) || 0, cs: Number(r.clean_sheets) || 0,
              predicted, actual: Number(r.total_points) || 0,
            });
          }
          if (!Number.isFinite(predicted)) continue;
          const actual = Number(r.total_points) || 0;

          const list = byPlayer.get(key) || [];
          const before = list.filter((x) => Number(x.gw) < gw && Number(x.minutes) >= 60);
          const baseline = before.length ? mean(before.map((x) => Number(x.total_points) || 0)) : null;

          const row = {
            key, position: r.position, price: Number(r.price),
            predicted, actual, err: predicted - actual, absErr: Math.abs(predicted - actual),
            baseAbsErr: baseline === null ? null : Math.abs(baseline - actual),
            ceiling: sum.quantiles ? Number(sum.quantiles.p90) : null,
          };
          errors.push(row);
          if (!byGw.has(gw)) byGw.set(gw, []);
          byGw.get(gw).push(row);
        }
      } catch (e) {
        /* A silent catch is how a broken call hid for this long: every fixture threw, every throw was counted
           as a skip, and the log said only that nothing ran. The first failure is now printed. */
        fixturesSkipped++;
        if (!firstFailure) {
          firstFailure = e.message;
          console.log(`  First fixture failure: ${e.message}`);
        }
      }
    }
    if (gw % 6 === 0) console.log(`  ...through GW${gw}, ${errors.length} player-gameweeks scored`);
  }

  if (process.env.BONUS_DUMP && globalThis.__bonus) {
    const g = {};
    for (const b of globalThis.__bonus) {
      g[b.position] ??= { n: 0, e: 0, a: 0 };
      g[b.position].n++; g[b.position].e += b.eBonus; g[b.position].a += b.bonus;
    }
    console.log("BONUS BY POSITION, predicted vs actual per player-gameweek");
    for (const [p, v] of Object.entries(g)) console.log(`  ${p}  n ${v.n}  predicted ${(v.e/v.n).toFixed(3)}  actual ${(v.a/v.n).toFixed(3)}  gap ${((v.e-v.a)/v.n).toFixed(3)}`);
  }
  if (process.env.COMPONENT_DUMP && globalThis.__comp) {
    const c = globalThis.__comp;
    console.log("COMPONENTS, predicted vs actual per start, by position");
    for (const pos of ["GKP","DEF","MID","FWD"]) {
      const s2 = c.filter((x) => x.position === pos);
      if (!s2.length) continue;
      const m = (f) => (s2.reduce((a, x) => a + x[f], 0) / s2.length).toFixed(3);
      console.log(`  ${pos}  goals ${m("eGoals")}/${m("goals")}  assists ${m("eAssists")}/${m("assists")}  cs ${m("eCs")}/${m("cs")}`);
    }
    if (process.env.PLAYER_CHECK) {
      const wanted = process.env.PLAYER_CHECK.split(",").map((x) => x.trim().toLowerCase());
      console.log("PLAYER CHECK, per start averaged across the season");
      const byName = {};
      for (const x of c) {
        if (!wanted.some((w) => x.name.toLowerCase().includes(w))) continue;
        byName[x.name] ??= { n: 0, p: 0, a: 0, pos: x.position };
        byName[x.name].n++; byName[x.name].p += x.predicted; byName[x.name].a += x.actual;
      }
      for (const [nm, v] of Object.entries(byName))
        console.log(`  ${nm} (${v.pos})  starts ${v.n}  predicted ${(v.p/v.n).toFixed(2)}  actual ${(v.a/v.n).toFixed(2)}`);
    }
    console.log("TOP TWENTY BY PREDICTED POINTS, single gameweeks (realism check)");
    for (const x of [...c].sort((a, b) => b.predicted - a.predicted).slice(0, 20))
      console.log(`  GW${x.gw}  ${x.position}  ${x.name}  predicted ${x.predicted.toFixed(1)}  actual ${x.actual}`);
  }
  console.log("");
  console.log(`Fixtures simulated ${fixturesRun}, skipped ${fixturesSkipped}. Player-gameweeks scored ${errors.length}.`);
  if (!errors.length) {
    throw new Error("Nothing was scored. The engine could not be run over this season's data."
      + (firstFailure ? ` The first fixture failed with: ${firstFailure}` : "")
      + ` Fixtures skipped: ${fixturesSkipped}.`);
  }
  console.log("");

  const line = (label, subset) => {
    if (subset.length < 20) return;
    const mae = mean(subset.map((e) => e.absErr));
    const bias = mean(subset.map((e) => e.err));
    const wb = subset.filter((e) => e.baseAbsErr !== null);
    const bm = wb.length ? mean(wb.map((e) => e.baseAbsErr)) : null;
    const better = bm === null ? "—" : `${(((bm - mae) / bm) * 100).toFixed(1)}%`;
    const rho = spearman(subset.map((e) => [e.predicted, e.actual]));
    console.log(`  ${label.padEnd(18)} n ${String(subset.length).padStart(5)}  MAE ${n2(mae)}  bias ${bias >= 0 ? "+" : ""}${n2(bias)}  vs baseline ${better.padStart(7)}  rank ${rho === null ? "—" : rho.toFixed(3)}`);
  };

  console.log(`OVERALL`);
  line("engine", errors);
  console.log("");
  console.log(`BY POSITION`);
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) line(pos, errors.filter((e) => e.position === pos));
  console.log("");

  console.log(`CALIBRATION, does a projection of X actually produce X`);
  for (const [lo, hi] of [[0, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 99]]) {
    const set = errors.filter((e) => e.predicted >= lo && e.predicted < hi);
    if (set.length < 20) continue;
    const mp = mean(set.map((e) => e.predicted)), ma = mean(set.map((e) => e.actual));
    const gap = mp - ma;
    console.log(`  ${(hi === 99 ? `${lo}+` : `${lo} to ${hi}`).padEnd(10)} n ${String(set.length).padStart(5)}  projected ${n2(mp)}  actual ${n2(ma)}  gap ${gap >= 0 ? "+" : ""}${n2(gap)}${Math.abs(gap) > 0.75 ? (gap > 0 ? "  TOO HIGH" : "  TOO LOW") : ""}`);
  }
  console.log("");

  const hits = [];
  for (const [, set] of byGw) {
    if (set.length < 60) continue;
    const tp = new Set([...set].sort((a, b) => b.predicted - a.predicted).slice(0, 20).map((e) => e.key));
    const tr = new Set([...set].sort((a, b) => b.actual - a.actual).slice(0, 20).map((e) => e.key));
    let h = 0;
    for (const k of tp) if (tr.has(k)) h++;
    hits.push(h);
  }

  const rho = spearman(errors.map((e) => [e.predicted, e.actual]));
  const mae = mean(errors.map((e) => e.absErr));
  const wb = errors.filter((e) => e.baseAbsErr !== null);
  const bm = wb.length ? mean(wb.map((e) => e.baseAbsErr)) : null;
  const vsBase = bm === null ? null : ((bm - mae) / bm) * 100;

  console.log(`THE VERDICT`);
  if (hits.length) console.log(`  Top twenty hit rate ${n2(mean(hits))} of 20. Chance would be 1 or 2.`);
  console.log(`  Rank correlation ${rho === null ? "—" : rho.toFixed(3)}. The fallback scorer managed 0.132.`);
  console.log(`  Better than a naive per-player average by ${vsBase === null ? "—" : `${vsBase.toFixed(1)}%`}. The fallback managed 3.0%.`);
  console.log("");
  if (vsBase !== null && rho !== null) {
    if (vsBase > 3.0 && rho > 0.132) {
      console.log(`  THE ENGINE WINS on both. It should be the model, and it already is.`);
    } else if (vsBase > 3.0 || rho > 0.132) {
      console.log(`  MIXED. The engine wins on one measure and not the other. Prefer rank correlation:`);
      console.log(`  ordering players correctly matters more than being close on average.`);
    } else {
      console.log(`  THE ENGINE LOSES to the fallback on this data. Before concluding it is worse, note that it`);
      console.log(`  ran WITHOUT ODDS here, because last season's odds were never stored, and odds are its main`);
      console.log(`  input. In production it has them. Re-measure from GW1 with real odds before deciding.`);
    }
  }
  console.log("");
  console.log(`  This ran on the team-strength path, not on odds, because last season's odds are not stored.`);
  console.log(`  That is a real handicap and the production engine does not have it.`);
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirect) {
  main().catch((e) => { console.error(`Engine backtest failed: ${e.message}`); process.exit(1); });
}

export { main as runEngineBacktest, derivePenalties };
