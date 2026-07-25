// Package 3 verification suite. Run once, whole: `npm run verify`.
// Prose only on failure. Exit code is the result.
//
// Client-side modules (lib/squad.js, lib/interim.js, lib/solver.js) import JSON directly, which
// webpack resolves and bare Node does not. Rather than skip them, the suite copies each into a
// temp directory with the JSON imports rewritten to generated ES modules, so the code under test
// is the real source, byte for byte apart from those import lines.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

import { deoverround, deoverroundTwo, solveLambdas, impliedGoals } from "../lib/engine/market.mjs";
import { scorelineGrid, gridProbs, pois, makeSampler, fitRho, gameStateShares } from "../lib/engine/dixon_coles.mjs";
import { goalShares, finishingMultiplier, penaltyModel, promotedBlend } from "../lib/engine/allocation.mjs";
import { pStart, minutesForecast, lineupScenarios } from "../lib/engine/minutes.mjs";
import { pointsFor, simulateFixture, summarise, covariance, mulberry32 } from "../lib/engine/simulate.mjs";
import { bpsFor, allocateBonus } from "../lib/bps_engine.mjs";
import { toText, chunk, parseSignals } from "../jobs/presser_pull.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rules = JSON.parse(readFileSync(path.join(ROOT, "config/rules-2026-27.json")));
const params = JSON.parse(readFileSync(path.join(ROOT, "config/model-params.json")));

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => { if (cond) pass++; else failures.push(`${name}${detail ? " — " + detail : ""}`); };
const near = (name, a, b, tol, detail) => ok(name, Math.abs(a - b) <= tol, detail || `got ${a}, expected ~${b} (tol ${tol})`);

/* ═══════════════════════════ LAYER 0 ═══════════════════════════ */
{
  const fair = [3, 3, 3];                       // no overround: probs must come out 1/3 each
  const d = deoverround(fair, params);
  near("layer0 · fair odds recover fair probs", d.probs[0], 1 / 3, 1e-6);
  ok("layer0 · probs sum to one", Math.abs(d.probs.reduce((a, b) => a + b, 0) - 1) < 1e-9);

  const juiced = deoverround([2.0, 3.4, 4.2], params);
  ok("layer0 · power method converged", juiced.method === "power", `method was ${juiced.method}`);
  ok("layer0 · juiced probs sum to one", Math.abs(juiced.probs.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  ok("layer0 · favourite keeps the largest probability", juiced.probs[0] > juiced.probs[1] && juiced.probs[0] > juiced.probs[2]);

  near("layer0 · two-way de-overround", deoverroundTwo(2, 2), 0.5, 1e-9);
  ok("layer0 · two-way handles missing line", deoverroundTwo(null, 2) === null);

  // round trip: build odds from known lambdas, then recover them
  const LH = 1.72, LA = 1.11;
  const g = gridProbs(LH, LA, params.layer1.rho.value, params.layer1.grid_cap.value);
  const fit = solveLambdas({ pH: g.pH, pD: g.pD, pA: g.pA, pOver: g.pOver25 }, params);
  near("layer0 · lambda round trip (home)", fit.lambda_home, LH, 0.05);
  near("layer0 · lambda round trip (away)", fit.lambda_away, LA, 0.05);
  ok("layer0 · round-trip residual is tiny", fit.fit_residual < 0.01, `residual ${fit.fit_residual}`);
  ok("layer0 · truncation mass is measured and tiny", fit.truncation_mass < 1e-4, `mass ${fit.truncation_mass}`);
  ok("layer0 · truncation shrinks as the grid grows",
    scorelineGrid(LH, LA, params.layer1.rho.value, 14).truncated < scorelineGrid(LH, LA, params.layer1.rho.value, 6).truncated);

  const full = impliedGoals({ h: 1.9, d: 3.6, a: 4.0, over25: 1.85, under25: 1.95 }, params);
  ok("layer0 · full pipeline returns lambdas", full && full.lambda_home > 0 && full.lambda_away > 0);
  ok("layer0 · home favourite gets the higher lambda", full.lambda_home > full.lambda_away);
}

/* ═══════════════════════════ LAYER 1 ═══════════════════════════ */
{
  const { grid, truncated } = scorelineGrid(1.5, 1.2, -0.05, 10);
  const mass = grid.flat().reduce((a, b) => a + b, 0);
  near("layer1 · grid normalised", mass, 1, 1e-9);
  ok("layer1 · truncation recorded", truncated >= 0);

  // rho = 0 must reduce exactly to independent Poisson
  const indep = scorelineGrid(1.4, 1.1, 0, 10);
  near("layer1 · rho zero reduces to independent Poisson", indep.grid[1][1], pois(1, 1.4) * pois(1, 1.1), 1e-6);

  // negative rho lifts the draw-heavy low scores, which is the whole point of the correction
  const withRho = scorelineGrid(1.4, 1.1, -0.08, 10);
  ok("layer1 · negative rho lifts 0-0", withRho.grid[0][0] > indep.grid[0][0]);
  ok("layer1 · negative rho lifts 1-1", withRho.grid[1][1] > indep.grid[1][1]);
  ok("layer1 · negative rho lowers 1-0", withRho.grid[1][0] < indep.grid[1][0]);
  ok("layer1 · negative rho lowers 0-1", withRho.grid[0][1] < indep.grid[0][1]);

  const p = gridProbs(1.6, 1.0, -0.05, 10);
  near("layer1 · outcome probs sum to one", p.pH + p.pD + p.pA, 1, 1e-9);
  near("layer1 · clean sheet equals P(opponent scores none)", p.csHome, grid.length ? p.csHome : 0, 1e-9);
  ok("layer1 · stronger side wins more often", p.pH > p.pA);

  // rho recovery on synthetic matches drawn from a planted rho
  const rand = mulberry32(11);
  const sample = makeSampler(1.5, 1.2, -0.09, 10);
  const matches = [];
  for (let i = 0; i < 1500; i++) {
    const [x, y] = sample(rand);
    matches.push({ lh: 1.5, la: 1.2, home_goals: x, away_goals: y });
  }
  const fitted = fitRho(matches, 10, -0.2, 0.02, 0.01);
  near("layer1 · rho recovered from synthetic draws", fitted.rho, -0.09, 0.06, `fitted ${fitted.rho}`);

  const gs = gameStateShares([20], [70], 94);
  near("layer1 · game state shares sum to one", gs.home.leading + gs.home.level + gs.home.trailing, 1, 1e-9);
  ok("layer1 · leading before the equaliser is credited", gs.home.leading > 0.4 && gs.away.trailing > 0.4);
}

/* ═══════════════════════════ LAYER 2 ═══════════════════════════ */
{
  const squad = [
    { player_id: 1, position: "FWD", npxg_current: 9, minutes_window: 1800 },
    { player_id: 2, position: "MID", npxg_current: 3, minutes_window: 1700 },
    { player_id: 3, position: "DEF", npxg_current: 0.4, minutes_window: 1900 },
    { player_id: 4, position: "GKP", npxg_current: 0, minutes_window: 1980 },
    { player_id: 5, position: "FWD", npxg_current: 0.2, minutes_window: 90 },
  ];
  const shares = goalShares(squad, params);
  near("layer2 · shares renormalise to one", shares.reduce((s, p) => s + p.share, 0), 1, 1e-9);
  ok("layer2 · the main scorer holds the biggest share", shares[0].share === Math.max(...shares.map((s) => s.share)));
  const lowMinutes = shares.find((s) => s.player_id === 5);
  ok("layer2 · a 90-minute sample is shrunk toward the prior",
    Math.abs(lowMinutes.share - lowMinutes.share_raw) > 0.01,
    `raw ${lowMinutes.share_raw.toFixed(3)} vs shrunk ${lowMinutes.share.toFixed(3)}`);

  const [lo, hi] = params.layer2.finishing_clamp.value;
  const hot = finishingMultiplier({ career_goals: 60, career_xg: 30, career_shots: 400 }, params);
  const cold = finishingMultiplier({ career_goals: 10, career_xg: 30, career_shots: 400 }, params);
  ok("layer2 · finishing multiplier clamped high", hot <= hi + 1e-9, `got ${hot}`);
  ok("layer2 · finishing multiplier clamped low", cold >= lo - 1e-9, `got ${cold}`);
  ok("layer2 · no history means no adjustment", finishingMultiplier({}, params) === 1);

  const pen = penaltyModel({}, [
    { player_id: 1, pen_rank: 1 }, { player_id: 2, pen_rank: 2 },
  ], params);
  ok("layer2 · rank one holds most of the duty", pen.duty.get(1) > pen.duty.get(2));
  ok("layer2 · duty never exceeds one", [...pen.duty.values()].reduce((a, b) => a + b, 0) <= 1 + 1e-9);
  ok("layer2 · conversion falls back to the league prior",
    Math.abs(pen.conversion({}) - params.layer2.pen_conversion.value) < 1e-9);

  ok("layer2 · promoted blend is full in GW1", promotedBlend({ promoted: true }, 1, params).blend === 1);
  ok("layer2 · promoted blend is spent by GW10", promotedBlend({ promoted: true }, 11, params).blend === 0);
  ok("layer2 · established clubs get no prior", promotedBlend({ promoted: false }, 1, params).blend === 0);
}

/* ═══════════════════════════ LAYER 3 ═══════════════════════════ */
{
  const base = { price: 9.0, recent_apps: 20, recent_starts: 19, status: "a" };
  const p = pStart(base, params);
  ok("layer3 · a nailed starter scores high", p > 0.85, `got ${p}`);
  ok("layer3 · an injury flag zeroes P(start)", pStart({ ...base, status: "i" }, params) === 0);
  ok("layer3 · chance_of_playing scales P(start)",
    pStart({ ...base, status: "d", chance_of_playing: 25 }, params) < p * 0.4);
  ok("layer3 · an out signal collapses P(start)",
    pStart({ ...base, presser_signal: { signal: "out", confidence: 0.95 } }, params) < 0.15);
  ok("layer3 · a confirmed signal does not exceed one",
    pStart({ ...base, presser_signal: { signal: "confirmed", confidence: 1 } }, params) <= 1);
  ok("layer3 · a cheap unknown sits near the price prior",
    pStart({ price: 4.5, recent_apps: 0, recent_starts: 0, status: "a" }, params) < 0.6);

  const mf = minutesForecast(base, params);
  ok("layer3 · forecast fields all present",
    ["p_start", "p_cameo", "p60", "exp_min_start", "exp_min_cameo", "source"].every((k) => mf[k] !== undefined));
  ok("layer3 · P(60+) does not exceed P(appears)", mf.p60 <= mf.p_start + mf.p_cameo + 1e-9);
  ok("layer3 · the model source is stamped", mf.source === "empirical_bayes_v1");

  const pool = [];
  const shape = { GKP: 2, DEF: 6, MID: 7, FWD: 4 };
  let id = 1;
  for (const [pos, n] of Object.entries(shape)) {
    for (let i = 0; i < n; i++) pool.push({ player_id: id++, position: pos, p_start: 0.95 - i * 0.12, p_cameo: 0.1 });
  }
  const scenarios = lineupScenarios(pool, rules, params, 20);
  ok("layer3 · scenarios generated", scenarios.length > 0);
  near("layer3 · scenario weights sum to one", scenarios.reduce((s, x) => s + x.p, 0), 1, 1e-6);
  ok("layer3 · every scenario is a legal XI", scenarios.every((s) => {
    const c = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p2 of s.xi) c[p2.position]++;
    const m = rules.squad.formation_minimums.value;
    return s.xi.length === 11 && c.GKP === m.GKP_exact && c.DEF >= m.DEF_min && c.MID >= m.MID_min && c.FWD >= m.FWD_min;
  }));
  ok("layer3 · the likeliest scenario ranks first", scenarios[0].p >= scenarios[scenarios.length - 1].p);
}

/* ═══════════════════════ SCORING AND BPS ═══════════════════════ */
{
  const sc = rules.scoring;
  const defCleanGoal = pointsFor({ minutes: 90, goals: 1, goals_conceded: 0 }, "DEF", rules);
  const expected = sc.appearance_60_plus.value + sc.goal_def.value + sc.clean_sheet_def.value;
  ok("scoring · defender goal plus clean sheet", defCleanGoal === expected, `got ${defCleanGoal}, expected ${expected}`);

  const cameo = pointsFor({ minutes: 20, goals: 0, goals_conceded: 0 }, "MID", rules);
  ok("scoring · a cameo earns one point and no clean sheet", cameo === sc.appearance_under_60.value, `got ${cameo}`);
  ok("scoring · zero minutes scores nothing", pointsFor({ minutes: 0, goals: 2 }, "FWD", rules) === 0);

  const keeper = pointsFor({ minutes: 90, saves: 6, goals_conceded: 2 }, "GKP", rules);
  const keeperExpected = sc.appearance_60_plus.value + 2 * sc.saves_per_3.value + 1 * sc.goals_conceded_per_2_gkp_def.value;
  ok("scoring · keeper saves and concessions", keeper === keeperExpected, `got ${keeper}, expected ${keeperExpected}`);

  const dc = sc.defensive_contribution;
  const atThreshold = pointsFor({ minutes: 90, goals_conceded: 1, clearances_blocks_interceptions: dc.def_threshold_cbit.value, tackles: 0 }, "DEF", rules);
  const belowThreshold = pointsFor({ minutes: 90, goals_conceded: 1, clearances_blocks_interceptions: dc.def_threshold_cbit.value - 1, tackles: 0 }, "DEF", rules);
  ok("scoring · DefCon awarded at the threshold", atThreshold - belowThreshold === dc.points.value, `delta ${atThreshold - belowThreshold}`);

  const midAt = pointsFor({ minutes: 90, goals_conceded: 1, clearances_blocks_interceptions: 6, tackles: 2, recoveries: dc.mid_fwd_threshold_cbirt.value - 8 }, "MID", rules);
  const midBelow = pointsFor({ minutes: 90, goals_conceded: 1, clearances_blocks_interceptions: 6, tackles: 2, recoveries: dc.mid_fwd_threshold_cbirt.value - 9 }, "MID", rules);
  ok("scoring · midfield DefCon uses the CBIRT threshold", midAt - midBelow === dc.points.value, `delta ${midAt - midBelow}`);

  ok("bps · a save is worth the 2026/27 value", bpsFor({ minutes: 90, saves: 1 }, "GKP", rules)
    - bpsFor({ minutes: 90, saves: 0 }, "GKP", rules) === rules.bps.save_any.value);
  ok("bps · CBI is one per three", bpsFor({ minutes: 90, clearances_blocks_interceptions: 3 }, "DEF", rules)
    - bpsFor({ minutes: 90, clearances_blocks_interceptions: 0 }, "DEF", rules) === rules.bps.cbi_bps.value);

  const clear = allocateBonus([{ key: "a", bps: 40 }, { key: "b", bps: 30 }, { key: "c", bps: 20 }, { key: "d", bps: 10 }]);
  ok("bps · clean three two one", clear.get("a") === 3 && clear.get("b") === 2 && clear.get("c") === 1 && clear.get("d") === 0);
  const tiedTop = allocateBonus([{ key: "a", bps: 40 }, { key: "b", bps: 40 }, { key: "c", bps: 30 }]);
  ok("bps · tie for first shares three, next gets one",
    tiedTop.get("a") === 3 && tiedTop.get("b") === 3 && tiedTop.get("c") === 1,
    `got ${tiedTop.get("a")}/${tiedTop.get("b")}/${tiedTop.get("c")}`);
  const tiedSecond = allocateBonus([{ key: "a", bps: 40 }, { key: "b", bps: 30 }, { key: "c", bps: 30 }]);
  ok("bps · tie for second shares two",
    tiedSecond.get("a") === 3 && tiedSecond.get("b") === 2 && tiedSecond.get("c") === 2);
}

/* ═══════════════════════════ LAYER 4 ═══════════════════════════ */
{
  const mk = (id, pos, extra = {}) => ({
    player_id: id, position: pos, p_start: 0.95, p_cameo: 0.03,
    exp_min_start: 85, exp_min_cameo: 20,
    share: pos === "GKP" ? 0 : 0.15, assist_share: 0.12, finishing: 1,
    cbi_per90: pos === "DEF" ? 5 : 1.5, tackles_per90: 2, recoveries_per90: 6,
    yellow_per90: 0.12, red_per90: 0.004, og_per90: 0.01, prior_blend: 0, ...extra,
  });
  const buildSide = (offset) => {
    const list = [mk(offset + 1, "GKP")];
    for (let i = 0; i < 5; i++) list.push(mk(offset + 10 + i, "DEF"));
    for (let i = 0; i < 5; i++) list.push(mk(offset + 20 + i, "MID"));
    for (let i = 0; i < 3; i++) list.push(mk(offset + 30 + i, "FWD"));
    return list;
  };
  const homeP = buildSide(100), awayP = buildSide(200);
  const penFor = (list) => penaltyModel({}, list.map((p, i) => ({ ...p, pen_rank: i === 11 ? 1 : null })), params);
  const scen = (list) => lineupScenarios(list, rules, params, 12);
  const home = { team_id: 1, lambda: 1.8, players: homeP, pen: penFor(homeP), scenarios: scen(homeP) };
  const away = { team_id: 2, lambda: 1.1, players: awayP, pen: penFor(awayP), scenarios: scen(awayP) };

  const SIMS = 400;
  const samples = simulateFixture({ home, away, rules, params, sims: SIMS, seed: 4242 });
  ok("layer4 · every player got a sample series", [...samples.values()].every((r) => r.pts.length === SIMS));

  const striker = summarise(samples.get(130), SIMS, params);
  ok("layer4 · mean points are finite and sane", striker.ep_mean > 0 && striker.ep_mean < 20, `mean ${striker.ep_mean}`);
  ok("layer4 · spread is positive", striker.ep_sd > 0);
  ok("layer4 · P(12+) is a probability", striker.p_12plus >= 0 && striker.p_12plus <= 1);
  ok("layer4 · quantiles are ordered",
    striker.quantiles.p10 <= striker.quantiles.p50 && striker.quantiles.p50 <= striker.quantiles.p90,
    JSON.stringify(striker.quantiles));
  ok("layer4 · clean-sheet probability is a probability", striker.p_cs >= 0 && striker.p_cs <= 1);

  const keeperHome = summarise(samples.get(101), SIMS, params);
  const keeperAway = summarise(samples.get(201), SIMS, params);
  ok("layer4 · the stronger side keeps more clean sheets", keeperHome.p_cs > keeperAway.p_cs,
    `home ${keeperHome.p_cs} vs away ${keeperAway.p_cs}`);
  ok("layer4 · bonus is distributed, not assumed", keeperHome.e_bonus >= 0 && keeperHome.e_bonus <= 3);

  const { player_ids, cov } = covariance([130, 131, 132, 999], samples);
  ok("layer4 · a player with no series is left out of the matrix", !player_ids.includes(999) && player_ids.length === 3);
  ok("layer4 · covariance matrix is square", cov.length === 3 && cov.every((r) => r.length === 3));
  ok("layer4 · covariance is symmetric", Math.abs(cov[0][1] - cov[1][0]) < 1e-6);
  ok("layer4 · diagonal variances are non-negative", cov.every((r, i) => r[i] >= 0), JSON.stringify(cov));
  ok("layer4 · no NaN reaches the stored artifact", cov.flat().every((x) => Number.isFinite(x)));

  // reproducibility: the same seed must give the same numbers
  const again = simulateFixture({ home, away, rules, params, sims: 120, seed: 99 });
  const twice = simulateFixture({ home, away, rules, params, sims: 120, seed: 99 });
  ok("layer4 · runs are reproducible from the seed",
    JSON.stringify(again.get(130).pts) === JSON.stringify(twice.get(130).pts));
}

/* ═══════════════════════ PRESSER PARSER ═══════════════════════ */
{
  ok("presser · html stripped to text", toText("<p>Hello <b>world</b></p><script>bad()</script>") === "Hello world");
  ok("presser · chunking respects the size", chunk("x".repeat(2500), 1000).length === 3);

  const names = ["Saka", "Haaland"];
  const good = parseSignals('```json\n{"signals":[{"player":"Saka","team":"ARS","signal":"doubt","confidence":0.6,"summary":"Carrying a knock.","source_url":"u"}],"pen_duty":[{"player":"Haaland","team":"MCI","rank":1}]}\n```', names, "u");
  ok("presser · fenced json is parsed", good.signals.length === 1 && good.pen_duty.length === 1);
  ok("presser · no false rejections on valid input", good.rejected.length === 0, good.rejected.join("; "));

  const bad = parseSignals('{"signals":[{"player":"Nobody","signal":"out","confidence":0.9},{"player":"Saka","signal":"maybe","confidence":0.5},{"player":"Haaland","signal":"out","confidence":7}]}', names, "u");
  ok("presser · unknown player rejected, not inserted", bad.signals.length === 0, `kept ${bad.signals.length}`);
  ok("presser · all three rejections logged", bad.rejected.length === 3, bad.rejected.join("; "));
  ok("presser · unparseable output fails closed", parseSignals("I could not comply", names, "u").signals.length === 0);
  ok("presser · empty result is valid", parseSignals('{"signals":[],"pen_duty":[]}', names, "u").rejected.length === 0);
}

/* ══════════════ CLIENT LOGIC: squad rules, interim, solver ══════════════ */
const TMP = path.join(ROOT, ".verify-tmp");
{
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(path.join(TMP, "lib"), { recursive: true });
  mkdirSync(path.join(TMP, "config"), { recursive: true });
  for (const f of ["rules-2026-27.json", "model-params.json"]) {
    const json = readFileSync(path.join(ROOT, "config", f), "utf8");
    writeFileSync(path.join(TMP, "config", f.replace(".json", ".mjs")), `export default ${json};\n`);
  }
  for (const f of ["squad.js", "interim.js", "solver.js"]) {
    let src = readFileSync(path.join(ROOT, "lib", f), "utf8");
    src = src.replace(/from\s+"\.\.\/config\/(rules-2026-27|model-params)\.json"/g, 'from "../config/$1.mjs"');
    src = src.replace(/from\s+"\.\/(squad|interim|solver)"/g, 'from "./$1.mjs"');
    writeFileSync(path.join(TMP, "lib", f.replace(".js", ".mjs")), src);
  }
}
const squadMod = await import(path.join(TMP, "lib/squad.mjs"));
const interimMod = await import(path.join(TMP, "lib/interim.mjs"));
const solverMod = await import(path.join(TMP, "lib/solver.mjs"));

{
  const { addBlocker, splitSquad, feasibleFormations, autosubPaths, BUDGET, COMPOSITION, MAX_PER_CLUB, bankOf } = squadMod;

  const mk = (id, position, price, team_id, extra = {}) => ({
    id, position, price, team_id, team: "T" + team_id, web_name: "P" + id,
    score: 5, status: "a", ppg: 4, form: 4, total_points: 40, ...extra,
  });

  const three = [mk(1, "MID", 5, 9), mk(2, "MID", 5, 9), mk(3, "MID", 5, 9)];
  ok("squad · third from a club is allowed", addBlocker(three.slice(0, 2), mk(3, "MID", 5, 9)) === null);
  ok("squad · fourth from a club is refused", addBlocker(three, mk(4, "MID", 5, 9)) !== null);
  ok("squad · refusal names the club", (addBlocker(three, mk(4, "MID", 5, 9)) || "").includes("T9"));

  const fiveMids = [1, 2, 3, 4, 5].map((i) => mk(i, "MID", 5, i));
  ok("squad · a sixth midfielder is refused", addBlocker(fiveMids, mk(6, "MID", 5, 6)) !== null);
  ok("squad · duplicates are refused", addBlocker(fiveMids, mk(1, "MID", 5, 1)) !== null);
  ok("squad · over budget is refused", addBlocker([mk(1, "FWD", 99, 1)], mk(2, "MID", 5, 2)) !== null);
  ok("squad · the budget message states the overrun",
    (addBlocker([mk(1, "FWD", 99, 1)], mk(2, "MID", 5, 2)) || "").includes("over"));

  const full = [
    mk(1, "GKP", 5, 1), mk(2, "GKP", 4, 2),
    ...[1, 2, 3, 4, 5].map((i) => mk(10 + i, "DEF", 5, i)),
    ...[1, 2, 3, 4, 5].map((i) => mk(20 + i, "MID", 6, i + 5)),
    ...[1, 2, 3].map((i) => mk(30 + i, "FWD", 7, i + 12)),
  ];
  ok("squad · a full squad is fifteen", full.length === 15);
  const split = splitSquad(full, "3-5-2");
  ok("squad · XI is eleven", split.xi.length === 11, `got ${split.xi.length}`);
  ok("squad · bench is four", split.bench.length === 4);
  ok("squad · exactly one keeper starts", split.xi.filter((p) => p.position === "GKP").length === 1);
  ok("squad · the bench keeper is listed first", split.bench[0].position === "GKP");
  ok("squad · GK sits at the bottom of the rows",
    splitSquad(full, "3-4-3").xi.filter((p) => p.position === "GKP").length === 1);

  const shapes = feasibleFormations(full).map((f) => f.id);
  ok("squad · all seven shapes are fieldable from a full squad", shapes.length === 7, shapes.join(","));
  ok("squad · shapes shrink when the squad is thin",
    feasibleFormations(full.filter((p) => p.position !== "FWD" || p.id === 31)).length < 7);

  const paths = autosubPaths(split.xi, split.bench);
  ok("squad · every starter has an autosub path considered", paths.length === 11);
  ok("squad · the keeper only swaps with a keeper",
    paths.find((p) => p.starter.position === "GKP").replacement.position === "GKP");
  ok("squad · outfield subs never break the minimums",
    paths.filter((p) => p.starter.position !== "GKP").every((p) => !p.replacement || p.replacement.position !== "GKP"));

  near("squad · bank arithmetic", bankOf(full), BUDGET - full.reduce((s, p) => s + p.price, 0), 1e-9);
  ok("squad · limits come from the ruleset", COMPOSITION.DEF === 5 && MAX_PER_CLUB === 3);
}

{
  const { interimRating, ratingContext, scorePlayers, GATE_FALLBACK, goalEnvironments } = interimMod;
  const pool = [
    { id: 1, team_id: 1, price: 12, ppg: 6, form: 7, total_points: 120, status: "a" },
    { id: 2, team_id: 2, price: 4.5, ppg: 1, form: 0.5, total_points: 8, status: "a" },
    { id: 3, team_id: 1, price: 8, ppg: 5, form: 6, total_points: 80, status: "i" },
    { id: 4, team_id: 2, price: 8, ppg: 5, form: 6, total_points: 80, status: "d", chance_of_playing: 25 },
  ];
  const ctx = ratingContext(pool, null);
  const ratings = pool.map((p) => interimRating(p, ctx));
  ok("interim · ratings stay inside the scale", ratings.every((r) => r >= 0 && r <= 10), ratings.join(","));
  ok("interim · the better player rates higher", ratings[0] > ratings[1]);
  ok("interim · an injury flag cuts the rating hard", ratings[2] < ratings[0] * 0.5, `${ratings[2]} vs ${ratings[0]}`);
  ok("interim · a doubt with low chance is discounted", ratings[3] < ratings[0]);

  const gated = scorePlayers(pool, GATE_FALLBACK, new Map(), null);
  ok("interim · the gate is closed by default", GATE_FALLBACK.passed === false);
  ok("interim · gated players are never labelled xP", gated.every((p) => p.scoreLabel === "RATING"));
  ok("interim · gated players expose no distribution", gated.every((p) => p.p10 === null && p.p12 === null));

  const projections = new Map([[1, { ep_mean: 6.3, quantiles: { p10: 2, p50: 6, p90: 11 }, p_12plus: 0.18, p_start: 0.9, low_sample: false }]]);
  const open = scorePlayers(pool, { ...GATE_FALLBACK, passed: true }, projections, null);
  ok("interim · an open gate switches the label to xP", open[0].scoreLabel === "xP");
  ok("interim · an open gate uses the stored projection", open[0].score === 6.3);
  ok("interim · players without a projection stay on the interim rating", open[1].scoreLabel === "RATING");

  ok("interim · no market lines means no fixture effect", goalEnvironments([{ id: 1, home_team: 1, away_team: 2 }], new Map()) === null);
  const env = goalEnvironments([{ id: 1, home_team: 1, away_team: 2 }], new Map([[1, { lambda_home: 2.2, lambda_away: 0.8 }]]));
  ok("interim · goal environments are scaled to plus or minus one",
    env.get(1) === 1 && env.get(2) === -1, `${env.get(1)} / ${env.get(2)}`);
}

{
  const { evaluateSquad, autoComplete, projectedPoints, captaincy, riskFlags, rankFormations, budgetEnvelope, replacementCandidates, transferSummary, horizonPoints } = solverMod;
  const { BUDGET, COMPOSITION } = squadMod;

  const mk = (id, position, price, team_id, score, extra = {}) => ({
    id, position, price, team_id, team: "T" + team_id, web_name: "P" + id, score, status: "a", ...extra,
  });
  const full = [
    mk(1, "GKP", 5, 1, 4), mk(2, "GKP", 4, 2, 3),
    ...[1, 2, 3, 4, 5].map((i) => mk(10 + i, "DEF", 5, i, 4)),
    ...[1, 2, 3, 4, 5].map((i) => mk(20 + i, "MID", 6, i + 5, 5)),
    ...[1, 2, 3].map((i) => mk(30 + i, "FWD", 7, i + 12, 6)),
  ];
  const gate = { passed: false, upgrade_label: "x", detail: "y" };

  const e1 = evaluateSquad(full, "3-5-2", 1, null, gate);
  const e6 = evaluateSquad(full, "3-5-2", 6, null, gate);
  ok("solver · a longer horizon scores more", e6.projected.total > e1.projected.total);
  ok("solver · the horizon is discounted, not multiplied", e6.projected.total < e1.projected.total * 6);
  ok("solver · gated projections carry no spread", e6.projected.low === null && e6.projected.basis === "interim");

  const openGate = { passed: true };
  const withDist = full.map((p) => ({ ...p, p10: p.score - 3, p90: p.score + 5, p12: 0.2 }));
  const eOpen = projectedPoints(withDist, "3-5-2", 6, openGate);
  ok("solver · an open gate produces P10 and P90", eOpen.low !== null && eOpen.high > eOpen.low);
  ok("solver · the median sits inside the band", eOpen.total > eOpen.low && eOpen.total < eOpen.high);

  const c = captaincy(full, "3-5-2", null, gate);
  ok("solver · auto captain is the best starter", c.captain.score === 6 && c.mode === "AUTO");
  ok("solver · doubling is doubling", Math.abs(c.doubled - c.captain.score * 2) < 1e-9);
  const cSet = captaincy(full, "3-5-2", 21, gate);
  ok("solver · a set captain is respected", cSet.captain.id === 21 && cSet.mode === "SET");
  ok("solver · the gap to the best option is reported", cSet.differentialGap > 0);
  ok("solver · captaincy never picks a benched player",
    captaincy(full, "3-4-3", null, gate).options.every((o) => o.position !== "GKP" || o.id === 1));

  const flagged = full.map((p, i) => (i === 3 ? { ...p, status: "d", chance_of_playing: 50 } : p));
  ok("solver · a doubt is flagged", riskFlags(flagged, gate).length === 1);
  ok("solver · a clean squad flags nothing", riskFlags(full, gate).length === 0);
  ok("solver · low start probability flags only when the gate is open",
    riskFlags(full.map((p) => ({ ...p, pStart: 0.4 })), gate).length === 0
    && riskFlags(full.map((p) => ({ ...p, pStart: 0.4 })), openGate).length === 15);

  const st = e6.structure;
  near("solver · position spend reconciles with squad cost", st.total, st.cost, 1e-9);
  ok("solver · bench quality is on a ten scale", st.benchScore >= 0 && st.benchScore <= 10);
  ok("solver · autosub coverage is a proportion", st.autosubCoverage >= 0 && st.autosubCoverage <= 1);

  const shapes = rankFormations(full, 6, gate);
  ok("solver · shapes are ranked best first", shapes.length === 7 && shapes[0].points >= shapes[6].points);

  // auto-complete over a pool wide enough to leave real choices
  const pool = [];
  let id = 1000;
  for (const [pos, price0] of [["GKP", 4.0], ["DEF", 4.0], ["MID", 4.5], ["FWD", 4.5]]) {
    for (let i = 0; i < 30; i++) {
      pool.push(mk(id++, pos, +(price0 + i * 0.3).toFixed(1), (i % 20) + 1, +(2 + i * 0.18).toFixed(2)));
    }
  }
  const filled = autoComplete([], pool);
  ok("auto-complete · fills all fifteen", filled.length === 15, `got ${filled.length}`);
  ok("auto-complete · stays inside the budget",
    filled.reduce((s, p) => s + p.price, 0) <= BUDGET + 1e-9,
    `cost ${filled.reduce((s, p) => s + p.price, 0)}`);
  ok("auto-complete · respects the composition",
    Object.entries(COMPOSITION).every(([pos, n]) => filled.filter((p) => p.position === pos).length === n));
  ok("auto-complete · respects three per club",
    Object.values(filled.reduce((m, p) => { m[p.team_id] = (m[p.team_id] || 0) + 1; return m; }, {})).every((n) => n <= 3));
  ok("auto-complete · keeps a partial squad intact", (() => {
    const seed = [pool.find((p) => p.position === "FWD")];
    const out = autoComplete(seed, pool);
    return out.length === 15 && out.some((p) => p.id === seed[0].id);
  })());
  ok("auto-complete · spends the budget rather than hoarding it",
    filled.reduce((s, p) => s + p.price, 0) > BUDGET * 0.9,
    `cost ${filled.reduce((s, p) => s + p.price, 0)}`);
  ok("auto-complete · beats the cheapest legal fifteen on score", (() => {
    const cheapest = [...pool].sort((a, b) => a.price - b.price);
    const naive = [];
    for (const [pos, n] of Object.entries(COMPOSITION)) {
      naive.push(...cheapest.filter((p) => p.position === pos).slice(0, n));
    }
    return filled.reduce((s, p) => s + p.score, 0) > naive.reduce((s, p) => s + p.score, 0);
  })());
  ok("auto-complete · is deterministic",
    JSON.stringify(autoComplete([], pool).map((p) => p.id)) === JSON.stringify(filled.map((p) => p.id)));

  const env = budgetEnvelope(pool, "3-5-2");
  ok("solver · every position gets an envelope", ["GKP", "DEF", "MID", "FWD"].every((p) => env[p].cap >= env[p].floor));
  ok("solver · envelopes are affordable together",
    Object.values(env).reduce((s, e) => s + e.floor, 0) <= BUDGET + 1e-9);

  const out = full.find((p) => p.position === "MID");
  const cands = replacementCandidates(out, full, pool, 2.0, 6, gate);
  ok("solver · replacements are same position", cands.every((p) => p.position === "MID"));
  ok("solver · nobody already owned is offered", cands.every((p) => !full.some((q) => q.id === p.id)));
  ok("solver · legal candidates rank above illegal ones", (() => {
    const firstIllegal = cands.findIndex((p) => !p.legal);
    return firstIllegal === -1 || cands.slice(0, firstIllegal).every((p) => p.legal);
  })());
  ok("solver · the net change is signed correctly",
    cands.filter((p) => p.legal).every((p) => (p.score > out.score ? p.delta > 0 : p.delta <= 0)));

  const ts = transferSummary([{ out, in: { ...out, score: out.score + 1 } }], 1, 6);
  ok("solver · one move inside the free transfer takes no hit", ts.hits === 0);
  const ts2 = transferSummary([
    { out, in: { ...out, score: out.score + 1 } },
    { out: full[5], in: { ...full[5], score: full[5].score + 0.1 } },
  ], 1, 6);
  ok("solver · the second move takes the hit", ts2.hits === Math.abs(rules.transfers.hit_cost.value), `hits ${ts2.hits}`);
  ok("solver · net is gross minus hits", Math.abs(ts2.net - (ts2.gross - ts2.hits)) < 1e-9);
  ok("solver · horizon of one is the raw rate", Math.abs(horizonPoints(5, 1) - 5) < 1e-9);
}
rmSync(TMP, { recursive: true, force: true });

/* ═══════════════════════ DRAFT ROUTE VALIDATION ═══════════════════════ */
{
  const { parseId, cleanSquad } = await import("../lib/validate.mjs");
  ok("route · a missing id is not read as zero", parseId(null) === null && parseId("") === null && parseId(undefined) === null);
  ok("route · zero and negatives are refused", parseId(0) === null && parseId(-4) === null);
  ok("route · non-integers are refused", parseId("1.5") === null && parseId("drop table") === null);
  ok("route · a real id passes", parseId("42") === 42);

  const good = cleanSquad([{ id: 3, position: "MID", price: 7.5, web_name: "X", team: "ARS", team_id: 2, extra: "ignored" }]);
  ok("route · a valid pick is accepted", good.length === 1 && good[0].id === 3);
  ok("route · unknown fields are dropped", good[0].extra === undefined);
  ok("route · a bad position is refused", cleanSquad([{ id: 1, position: "BOSS", price: 5 }]) === null);
  ok("route · a non-numeric id is refused", cleanSquad([{ id: "drop table", position: "MID", price: 5 }]) === null);
  ok("route · duplicate picks are refused",
    cleanSquad([{ id: 1, position: "MID", price: 5 }, { id: 1, position: "MID", price: 5 }]) === null);
  ok("route · a sixteenth pick is refused",
    cleanSquad(Array.from({ length: 16 }, (_, i) => ({ id: i + 1, position: "MID", price: 5 }))) === null);
  ok("route · an empty squad is refused", cleanSquad([]) === null);
  ok("route · an absurd price is refused", cleanSquad([{ id: 1, position: "MID", price: 999 }]) === null);
}

/* ═══════════════════════════ REPO GUARDS ═══════════════════════════ */
{
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
      if ([".git", "node_modules", ".next", ".verify-tmp"].includes(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  };
  const files = walk(ROOT).filter((f) => /\.(js|jsx|mjs|json|sql|yml)$/.test(f));

  // 1. AI clients may appear in exactly one job. Everything else is arithmetic, by rule.
  const aiFiles = files.filter((f) => {
    if (f.includes("/mockups/")) return false;
    const src = readFileSync(f, "utf8");
    return /openrouter\.ai|api\.anthropic\.com|api\.openai\.com/i.test(src);
  }).map((f) => path.relative(ROOT, f));
  const allowedAi = ["jobs/presser_pull.mjs"];
  ok("guard · AI clients confined to the presser job",
    aiFiles.every((f) => allowedAi.includes(f)), `found in ${aiFiles.join(", ")}`);

  // 2. The solver and evaluation path must not reach the network at all.
  for (const f of ["lib/solver.js", "lib/squad.js", "lib/interim.js", "components/FeedbackPanel.jsx"]) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    ok(`guard · ${f} makes no network calls`, !/\bfetch\s*\(/.test(src));
  }

  // 3. No scoring or squad constant hard-coded outside the ruleset JSON.
  for (const f of ["lib/solver.js", "lib/squad.js", "lib/engine/simulate.mjs"]) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    ok(`guard · ${f} reads the budget from the ruleset`,
      !/100\.0\s*[;,)]/.test(src.replace(/budget_millions[\s\S]{0,40}/g, "")));
  }

  // 4. Nothing may present a projection as xP while the gate is shut. The only places the
  //    string can appear are the gate module, the copy that explains the gate, and docs.
  const uiFiles = files.filter((f) => /^(app|components)\//.test(path.relative(ROOT, f)) && !f.includes("/legacy/"));
  const xpLeaks = uiFiles.filter((f) => /["'`]xP\b/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  const allowedXp = ["app/builder/page.jsx", "app/squad/page.jsx", "app/api/drafts/route.js"];  // both only inside gate-conditional copy
  ok("guard · no unexpected xP labels in the UI",
    xpLeaks.every((f) => allowedXp.includes(f)), `xP string in ${xpLeaks.join(", ")}`);
  for (const f of allowedXp) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    const lines = src.split("\n").filter((l) => /["'`]xP\b/.test(l));
    ok(`guard · every xP mention in ${f} is gate-conditional`,
      lines.every((l) => /gate\.passed|scoring_basis|basis/.test(l)), lines.join(" | "));
  }

  // 5. No secrets in the repo. Job files must read keys from the environment only.
  const secretish = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /(sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{30,}|service_role\s*[:=]\s*["'][^"']{20,})/.test(src);
  }).map((f) => path.relative(ROOT, f));
  ok("guard · no key-shaped strings committed", secretish.length === 0, secretish.join(", "));

  // 6. Every migration is idempotent — this repo runs them by hand in the SQL editor.
  for (const f of files.filter((x) => x.endsWith(".sql"))) {
    const src = readFileSync(f, "utf8");
    const creates = src.match(/create table (?!if not exists)/gi) || [];
    ok(`guard · ${path.relative(ROOT, f)} is idempotent`, creates.length === 0, `${creates.length} unguarded creates`);
  }

  // 7. Every PROVISIONAL parameter must carry a note saying what will replace it.
  const untraced = [];
  const walkParams = (node, trail) => {
    if (node && typeof node === "object") {
      if (node.status === "PROVISIONAL" && !node.note) untraced.push(trail);
      for (const [k, v] of Object.entries(node)) if (k !== "value") walkParams(v, `${trail}.${k}`);
    }
  };
  walkParams(params, "params");
  ok("guard · every provisional parameter explains its upgrade path", untraced.length === 0, untraced.join(", "));
}

/* ═══════════════════════════ RESULT ═══════════════════════════ */
console.log(`\n${pass} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log("\nFAILURES");
  for (const f of failures) console.log("  · " + f);
  process.exit(1);
}
console.log("Suite green.");
