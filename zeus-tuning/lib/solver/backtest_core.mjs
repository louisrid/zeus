/* THE MEASUREMENT CORE.
 *
 * jobs/backtest.mjs measured one setting per database read. A sweep of thousands of settings cannot afford
 * that: the read is the slow part and the archive it builds does not depend on the parameters at all. So the
 * work is split here.
 *
 *   indexRows    once per run. Turns raw player-gameweeks into running totals per player per season, so the
 *                record "before gameweek 20" is a subtraction rather than a scan. Nothing here knows about a
 *                parameter, which is why it can be reused by every combination the sweep tries.
 *   sliceFor     which player-gameweeks are judged, and on what population.
 *   evaluate     one parameter set against those slices. This is the only part that runs thousands of times.
 *
 * The discipline is unchanged and is the whole point: at every gameweek the model sees ONLY what happened
 * before it. History is keyed by season AND player, so a player's form in one season is never history for
 * another. Team strength is accumulated as the season goes, never from the final table.
 */
import { buildScorer } from "./score.mjs";
import { resolveTuning } from "./tuning.mjs";

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* Spearman rank correlation. Ties take the average rank, which matters because a lot of projections land on
   the same number. For FPL this is the number that counts: getting the order right beats being close. */
export function spearman(pairs) {
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
  const n = pairs.length;
  const mp = mean(rp), ma = mean(ra);
  let num = 0, dp = 0, da = 0;
  for (let k = 0; k < n; k++) {
    num += (rp[k] - mp) * (ra[k] - ma);
    dp += (rp[k] - mp) ** 2;
    da += (ra[k] - ma) ** 2;
  }
  return dp && da ? num / Math.sqrt(dp * da) : null;
}

const POSITIONS = ["GKP", "DEF", "MID", "FWD"];
const numOr = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ── RUNNING TOTALS ────────────────────────────────────────────────────────────────────────────────
 *
 * One record per player per season, holding cumulative totals indexed by gameweek. Everything the archive
 * needs at gameweek G is prefix[G-1], and everything a recent-form window needs is the difference between
 * two entries. Carried forward across gameweeks the player has no row for, so a blank does not reset him.
 */
export function indexRows(rows, goalPointsByPosition) {
  const bySeason = new Map();

  for (const r of rows) {
    const season = String(r.season);
    if (!bySeason.has(season)) bySeason.set(season, { players: new Map(), fixtures: new Map(), maxGw: 0 });
    const S = bySeason.get(season);
    const gw = Number(r.gw);
    if (!Number.isFinite(gw)) continue;
    if (gw > S.maxGw) S.maxGw = gw;

    const key = String(r.element ?? r.player_name);
    if (!S.players.has(key)) S.players.set(key, { key, season, rows: new Map(), position: r.position, team: r.team });
    const P = S.players.get(key);
    P.rows.set(gw, r);
    // The last position and club seen are the current ones. A midfielder reclassified mid-season is scored
    // as what he is now, which is what the live model does.
    if (r.position) P.position = r.position;
    if (r.team) P.team = r.team;

    /* One row per club per gameweek, for team strength. goals_conceded is the same for every player in a
       match, so the largest value across players who actually played is that club's goals against. Rows for
       players who did not play carry zero and would drag it down, hence the minutes filter. */
    if (r.team && Number(r.minutes) > 0) {
      const fk = `${gw}|${r.team}`;
      const f = S.fixtures.get(fk) || { gw, team: r.team, conceded: 0, goals: 0, opponents: new Set(), matches: 1 };
      f.conceded = Math.max(f.conceded, numOr(r.goals_conceded));
      f.goals += numOr(r.goals);
      if (r.opponent_team !== null && r.opponent_team !== undefined) f.opponents.add(Number(r.opponent_team));
      S.fixtures.set(fk, f);
    }
  }

  for (const S of bySeason.values()) {
    for (const P of S.players.values()) {
      const goalPts = numOr(goalPointsByPosition[P.position], 4);
      const n = S.maxGw;
      const z = () => new Float64Array(n + 2);
      const c = {
        rows: z(), minutes: z(), points: z(), goals: z(), assists: z(), saves: z(), bonus: z(),
        xg: z(), xa: z(), starts: z(), starts60: z(), cameos: z(), apps: z(),
        startMinutes: z(), cameoMinutes: z(),
      };
      for (let gw = 1; gw <= n; gw++) {
        for (const k of Object.keys(c)) c[k][gw] = c[k][gw - 1];
        const r = P.rows.get(gw);
        if (!r) continue;
        const mins = numOr(r.minutes);
        const started = r.started === true || r.started === "true";
        c.rows[gw] += 1;
        c.minutes[gw] += mins;
        c.points[gw] += numOr(r.total_points);
        c.goals[gw] += numOr(r.goals);
        c.assists[gw] += numOr(r.assists);
        c.saves[gw] += numOr(r.saves);
        c.bonus[gw] += numOr(r.bonus);
        c.xg[gw] += numOr(r.xg);
        c.xa[gw] += numOr(r.xa);
        if (started) { c.starts[gw] += 1; if (mins >= 60) c.starts60[gw] += 1; c.startMinutes[gw] += mins; }
        else if (mins > 0) { c.cameos[gw] += 1; c.cameoMinutes[gw] += mins; }
        if (mins > 0) c.apps[gw] += 1;
      }
      P.cum = c;
      P.goalPts = goalPts;
    }

    /* Team strength, accumulated as the season goes. Attack is goals scored per match against the league
       average, defence is goals conceded per match against it. Both are one at average, and both use only
       matches already played. Goals scored come from the club's own players, which misses an own goal by the
       opposition: those are about one in every forty goals and are not worth a join to recover. */
    const teamCum = new Map();
    const league = new Float64Array(S.maxGw + 2);
    const leagueMatches = new Float64Array(S.maxGw + 2);
    const teams = [...new Set([...S.fixtures.values()].map((f) => f.team))];
    for (const t of teams) teamCum.set(t, { goals: new Float64Array(S.maxGw + 2), conceded: new Float64Array(S.maxGw + 2), matches: new Float64Array(S.maxGw + 2) });
    for (let gw = 1; gw <= S.maxGw; gw++) {
      league[gw] = league[gw - 1];
      leagueMatches[gw] = leagueMatches[gw - 1];
      for (const t of teams) {
        const c = teamCum.get(t);
        c.goals[gw] = c.goals[gw - 1];
        c.conceded[gw] = c.conceded[gw - 1];
        c.matches[gw] = c.matches[gw - 1];
        const f = S.fixtures.get(`${gw}|${t}`);
        if (!f) continue;
        c.goals[gw] += f.goals;
        c.conceded[gw] += f.conceded;
        c.matches[gw] += 1;
        league[gw] += f.conceded;
        leagueMatches[gw] += 1;
      }
    }
    S.teamCum = teamCum;
    S.leagueGoals = league;
    S.leagueMatches = leagueMatches;

    /* WHICH CLUB IS WHICH ID. The dataset names a player's own club and numbers his opponent, and the two
       cannot be joined directly. They can be recovered: over a season a club faces every id except its own,
       so the one id missing from its opponents is itself. Where that does not resolve to exactly one, the
       club simply has no opponent strength and its fixture reads as average, which is honest rather than
       guessed. */
    const allIds = new Set();
    for (const f of S.fixtures.values()) for (const o of f.opponents) allIds.add(o);
    const facedBy = new Map();
    for (const f of S.fixtures.values()) {
      if (!facedBy.has(f.team)) facedBy.set(f.team, new Set());
      for (const o of f.opponents) facedBy.get(f.team).add(o);
    }
    const idToTeam = new Map();
    for (const [team, faced] of facedBy) {
      const missing = [...allIds].filter((i) => !faced.has(i));
      if (missing.length === 1) idToTeam.set(missing[0], team);
    }
    S.idToTeam = idToTeam;
    S.identified = idToTeam.size;
    S.teamCount = teams.length;
  }

  return { bySeason };
}

/* ── WHO IS JUDGED ─────────────────────────────────────────────────────────────────────────────────
 *
 * "starters" keeps the original population: a player who started and played an hour, with his minutes held
 * at certain. That isolates the points model, which is what the backtest was built to measure.
 *
 * "all" judges every player with a fixture and some record behind him, and forecasts his minutes from how
 * often he has been starting. That is the real problem the tool faces on a Friday, and it is the only
 * population in which a parameter about rotation risk can be measured at all. The numbers are not comparable
 * between the two: "all" includes players who scored nothing because they did not play.
 */
export function sliceFor(index, { seasons, fromGw, toGw, population = "starters", minHistory = 4 }) {
  const slices = [];
  for (const season of seasons) {
    const S = index.bySeason.get(season);
    if (!S) continue;
    const top = Math.min(toGw, S.maxGw);
    for (let gw = fromGw; gw <= top; gw++) {
      const cases = [];
      for (const P of S.players.values()) {
        const now = P.rows.get(gw);
        if (!now) continue;
        if (P.cum.rows[gw - 1] < minHistory) continue;
        const mins = numOr(now.minutes);
        if (population === "starters" && mins < 60) continue;
        cases.push({ key: P.key, rec: P, position: P.position, team: P.team,
          price: numOr(now.price, null), actual: numOr(now.total_points),
          opponentId: now.opponent_team === null || now.opponent_team === undefined ? null : Number(now.opponent_team) });
      }
      if (cases.length) slices.push({ season, gw, cases, S });
    }
  }
  return slices;
}

/* The record a player carries into this gameweek, built from running totals. Everything is per ninety
   minutes played, which is what the scorer expects. */
function archiveEntry(P, gw, window) {
  const c = P.cum, before = gw - 1;
  const minutes = c.minutes[before];
  if (!(minutes > 0)) return null;
  const nineties = minutes / 90;
  const pts = c.points[before];
  const starts = c.starts[before], starts60 = c.starts60[before], cameos = c.cameos[before];
  const appearance = starts60 * 2 + Math.max(0, starts - starts60) + cameos;
  const attacking = c.goals[before] * P.goalPts + c.assists[before] * 3;
  const savePts = Math.floor(c.saves[before] / 3);
  const rest = Math.max(0, pts - appearance - attacking - savePts);

  const entry = {
    pointsPer90: pts / nineties, nineties, points: pts,
    appearPer90: appearance / nineties,
    attackPer90: attacking / nineties,
    defencePer90: (rest + savePts) / nineties,
    bonusPer90: c.bonus[before] / nineties,
    xgAttackPer90: (c.xg[before] * P.goalPts + c.xa[before] * 3) / nineties,
  };

  const from = Math.max(0, before - window);
  const winMinutes = c.minutes[before] - c.minutes[from];
  if (winMinutes > 0) entry.recentPer90 = (c.points[before] - c.points[from]) / (winMinutes / 90);

  return entry;
}

/* Expected minutes from the record so far, on the same shape the live minutes model produces. Only used in
   the "all" population: the original population holds minutes certain on purpose. */
function minutesEntry(P, gw) {
  const c = P.cum, before = gw - 1;
  const apps = c.apps[before], rowsBefore = c.rows[before];
  if (!(rowsBefore > 0)) return null;
  const starts = c.starts[before];
  const pStart = Math.max(0, Math.min(1, starts / rowsBefore));
  const expStart = starts > 0 ? c.startMinutes[before] / starts : 0;
  const cameoCount = c.cameos[before];
  const pCameo = Math.max(0, Math.min(1, cameoCount / rowsBefore));
  const expCameo = cameoCount > 0 ? c.cameoMinutes[before] / cameoCount : 0;
  if (apps === 0) return { p_start: 0, exp_min_start: 0, p_cameo: 0, exp_min_cameo: 0 };
  return { p_start: pStart, exp_min_start: expStart || 90, p_cameo: pCameo, exp_min_cameo: expCameo };
}

/* The goal environment for one fixture, from strength accumulated before it. Returns null where the club or
   its opponent cannot be read, and the scorer then treats the fixture as average. */
function envFor(S, team, opponentId, gw) {
  if (!S.teamCum || !team) return null;
  const before = gw - 1;
  const matches = S.leagueMatches[before];
  if (!(matches >= 20)) return null;             // too little of the season to say anything about a club
  const leagueHalf = S.leagueGoals[before] / matches;
  if (!(leagueHalf > 0)) return null;
  const own = S.teamCum.get(team);
  const oppTeam = opponentId === null ? null : S.idToTeam.get(opponentId);
  const opp = oppTeam ? S.teamCum.get(oppTeam) : null;
  if (!own || !opp || !(own.matches[before] >= 3) || !(opp.matches[before] >= 3)) return null;
  const rate = (c, field) => c[field][before] / c.matches[before] / leagueHalf;
  const forGoals = leagueHalf * rate(own, "goals") * rate(opp, "conceded");
  const againstGoals = leagueHalf * rate(opp, "goals") * rate(own, "conceded");
  if (!Number.isFinite(forGoals) || !Number.isFinite(againstGoals)) return null;
  return { forGoals, againstGoals, leagueMean: leagueHalf * 2 };
}

/* Price bands, because being accurate about 4.5m players and wrong about 12m ones is the expensive failure. */
export const BANDS = ["under 5.0", "5.0 to 6.5", "6.5 to 8.5", "8.5 to 11.0", "11.0 and up"];

export function band(price) {
  // Number(null) is zero, which used to file a player with no price under the cheapest band and quietly
  // put him in a table he does not belong in.
  if (price === null || price === undefined || price === "") return "unknown";
  const p = Number(price);
  if (!Number.isFinite(p)) return "unknown";
  if (p < 5) return "under 5.0";
  if (p < 6.5) return "5.0 to 6.5";
  if (p < 8.5) return "6.5 to 8.5";
  if (p < 11) return "8.5 to 11.0";
  return "11.0 and up";
}

/* ── ONE PARAMETER SET ─────────────────────────────────────────────────────────────────────────────
 *
 * Runs the real scorer, the same module the app and the brief use, over every judged player-gameweek.
 * Returns one row per projection so every table the report prints can be built from it.
 */
export function evaluate(slices, tuning, opts) {
  const TUNE = resolveTuning(tuning);
  const {
    shrinkage, positionMeans, promotionFactor, goalPoints, assistPoints, appearancePoints,
    testSeason, population = "starters", useFixtures = false, calibration = null,
  } = opts;

  const errors = [];
  let capped = 0;
  let envHits = 0, envMisses = 0;

  for (const slice of slices) {
    const { S, gw, season } = slice;
    const players = [];
    const archive = new Map();
    const minutes = new Map();
    const envByTeam = useFixtures ? new Map() : null;
    let leagueMeanGoals = null;

    for (const c of slice.cases) {
      players.push({
        fpl_id: c.key, web_name: c.rec.key, name: c.rec.key, position: c.position,
        team_id: c.team, status: "a", chance_of_playing: null, price: c.price,
      });
      const entry = archiveEntry(c.rec, gw, TUNE.recentFormWindow);
      if (entry) archive.set(c.key, entry);

      if (population === "starters") {
        /* He started and played an hour, so the minutes question is answered. Holding it fixed isolates the
           points model, which is what this population is for. */
        minutes.set(c.key, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 });
      } else {
        const m = minutesEntry(c.rec, gw);
        if (m) minutes.set(c.key, m);
      }

      if (useFixtures) {
        const env = envFor(S, c.team, c.opponentId, gw);
        if (env) {
          envByTeam.set(c.team, { forGoals: env.forGoals, againstGoals: env.againstGoals, gw });
          leagueMeanGoals = env.leagueMean;
          envHits++;
        } else envMisses++;
      }
    }

    /* The average attacking output per position in this gameweek's field, so a player's own attacking rate
       can be read as a multiple of it. Derived from the rows in hand, never a typed figure. */
    const positionAttackMeans = {};
    for (const pos of POSITIONS) {
      const vals = [];
      for (const c of slice.cases) {
        if (c.position !== pos) continue;
        const a = archive.get(c.key);
        if (a && Number.isFinite(a.attackPer90)) vals.push(a.attackPer90);
      }
      const m = mean(vals);
      if (m !== null && m > 0) positionAttackMeans[pos] = m;
    }

    const scorer = buildScorer({
      projections: new Map(), perGw: new Map(), archivePer90: archive, understat: new Map(),
      envByTeam, leagueMeanGoals,
      goalPoints, assistPoints, appearancePoints,
      shrinkageNineties: shrinkage,
      positionMeans, promotionFactor,
      players, minutesForecasts: minutes,
      tuning: TUNE, calibration, positionAttackMeans,
    });
    capped += scorer.rateCapped ? scorer.rateCapped() : 0;

    const byKey = new Map(players.map((p) => [p.fpl_id, p]));
    for (const c of slice.cases) {
      const predicted = Number(scorer.scoreOf(byKey.get(c.key)));
      if (!Number.isFinite(predicted)) continue;

      /* The baseline: his own average from the matches he actually played. Anything that cannot beat this is
         not worth running. */
      const cum = c.rec.cum, before = gw - 1;
      const playedBefore = cum.apps[before];
      const baseline = playedBefore > 0 ? cum.points[before] / playedBefore : null;
      const rowsBefore = cum.rows[before];
      const startRate = rowsBefore > 0 ? cum.starts[before] / rowsBefore : 0;

      errors.push({
        key: c.key, season, gw, isTest: season === testSeason,
        position: c.position, band: band(c.price), startRate,
        predicted, actual: c.actual,
        err: predicted - c.actual, absErr: Math.abs(predicted - c.actual),
        baseAbsErr: baseline === null ? null : Math.abs(baseline - c.actual),
      });
    }
  }

  return { errors, capped, envHits, envMisses };
}

/* The numbers a sweep ranks on. Rank correlation first because ordering is what a manager acts on, mean
   error as the tiebreak. Computed on whichever rows are handed in, which is the held-out season alone when
   the sweep calls it. */
export function metricsFor(rows) {
  if (!rows.length) return { n: 0, mae: null, bias: null, rank: null, vsBase: null };
  const withBase = rows.filter((e) => e.baseAbsErr !== null);
  const baseMae = withBase.length ? mean(withBase.map((e) => e.baseAbsErr)) : null;
  const mae = mean(rows.map((e) => e.absErr));
  return {
    n: rows.length, mae, bias: mean(rows.map((e) => e.err)),
    rank: spearman(rows.map((e) => [e.predicted, e.actual])),
    vsBase: baseMae === null ? null : ((baseMae - mae) / baseMae) * 100,
  };
}

export const CALIBRATION_BUCKETS = [[0, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 99]];

/* What each projected band actually returned. This is the table that exposed the six-to-seven problem. */
export function calibrationBands(rows) {
  const out = [];
  for (const [lo, hi] of CALIBRATION_BUCKETS) {
    const set = rows.filter((e) => e.predicted >= lo && e.predicted < hi);
    if (set.length < 20) continue;
    const projected = mean(set.map((e) => e.predicted));
    const actual = mean(set.map((e) => e.actual));
    out.push({ lo, hi, n: set.length, projected, actual, gap: projected - actual });
  }
  return out;
}

/* THE CORRECTION FOR A BAND THAT PROJECTS TOO HIGH.
 *
 * Not a number typed into the model. Each band contributes one point: what the model said, and what those
 * players really scored. The curve through those points is forced to rise, so it can resize a projection but
 * never reorder two players. Fitted on the tuning seasons only, because a correction fitted on the held-out
 * season would make that season no longer held out. */
export function fitCalibrationKnots(rows) {
  const bands = calibrationBands(rows);
  if (bands.length < 2) return null;
  const pairs = bands.map((b) => [b.projected, b.actual]);
  const weights = bands.map((b) => b.n);
  return { pairs, weights, bands };
}

/* WHY A DROP BETWEEN SEASONS IS NOT AUTOMATICALLY MEMORISATION.
 *
 * The old wording called any fall in ordering on unseen data memorisation. That is wrong when nothing has
 * been fitted: with no parameter chosen from the tuning seasons there is nothing to overfit with, and the
 * gap is the seasons differing. It matters because the false verdict argued against trusting a result that
 * was sound. The number of fitted parameters is now part of the verdict. */
export function generaliseVerdict({ tuneRank, testRank, fittedCount }) {
  if (tuneRank === null || testRank === null) return null;
  const drop = tuneRank - testRank;
  const size = Math.abs(drop).toFixed(3);
  if (drop < -0.02) {
    return { drop, verdict: "better on unseen", say: [
      `It does BETTER on the unseen season by ${size}, which usually means the tuning seasons are the harder`,
      `ones rather than that the model is improving. Not a problem.`,
    ] };
  }
  if (drop <= 0.04) {
    return { drop, verdict: "held up", say: [
      `Held up on unseen data, ${size} apart, so what it learned is real rather than memorised.`,
    ] };
  }
  if (fittedCount === 0) {
    return { drop, verdict: "seasons differ", say: [
      `Ordering is ${size} lower on the unseen season. NOTHING has been fitted to the tuning seasons, so this`,
      `cannot be memorisation: there is no parameter that could have absorbed them. It is the seasons`,
      `differing, and the tuning-season figure is the optimistic one to quote.`,
    ] };
  }
  return { drop, verdict: "possible overfitting", say: [
    `Ordering is ${size} lower on the unseen season, and ${fittedCount} parameter${fittedCount === 1 ? " was" : "s were"}`,
    `chosen using the tuning seasons. That is enough to overfit with, so treat the tuning-season figure as`,
    `flattering and re-run the sweep with a wider held-out period before trusting those values.`,
  ] };
}
