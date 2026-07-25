// B-07 · Layer 4 — joint match simulation.
// One simulation is one whole match: an XI per side, a scoreline, goal minutes, game states,
// penalties, open-play goals and assists, defensive events, cards, then the 22-player BPS race.
// Bonus is a competition, not a per-player expectation, which is why it can only be priced here.
import { makeSampler, goalMinutes, gameStateShares } from "./dixon_coles.mjs";
import { sampleScenario } from "./minutes.mjs";
import { bpsFor, allocateBonus } from "../bps_engine.mjs";

/* Deterministic RNG so a projection run is reproducible from its model_version stamp. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v = (rules, path) => path.split(".").reduce((o, k) => o[k], rules).value;

/* FPL points from one simulated match line. Every constant comes from the ruleset JSON. */
export function pointsFor(s, position, rules) {
  const sc = rules.scoring;
  let pts = 0;
  const min = s.minutes || 0;
  if (min <= 0) return 0;
  pts += min >= 60 ? sc.appearance_60_plus.value : sc.appearance_under_60.value;

  const goalKey = position === "FWD" ? "goal_fwd" : position === "MID" ? "goal_mid" : position === "DEF" ? "goal_def" : "goal_gkp";
  pts += (s.goals || 0) * sc[goalKey].value;
  pts += (s.assists || 0) * sc.assist.value;

  if (min >= 60 && (s.goals_conceded || 0) === 0) {
    const csKey = position === "GKP" ? "clean_sheet_gkp" : position === "DEF" ? "clean_sheet_def"
      : position === "MID" ? "clean_sheet_mid" : "clean_sheet_fwd";
    pts += sc[csKey].value;
  }
  if (position === "GKP" || position === "DEF") {
    pts += Math.floor((s.goals_conceded || 0) / 2) * sc.goals_conceded_per_2_gkp_def.value;
  }
  pts += Math.floor((s.saves || 0) / 3) * sc.saves_per_3.value;
  pts += (s.pens_saved || 0) * sc.penalty_save.value;
  pts += (s.pens_missed || 0) * sc.penalty_miss.value;
  pts += (s.yellow || 0) * sc.yellow_card.value;
  pts += (s.red || 0) * sc.red_card.value;
  pts += (s.own_goals || 0) * sc.own_goal.value;

  const dc = sc.defensive_contribution;
  const cbit = (s.clearances_blocks_interceptions || 0) + (s.tackles || 0);
  const metric = position === "DEF" || position === "GKP" ? cbit : cbit + (s.recoveries || 0);
  const threshold = position === "DEF" || position === "GKP"
    ? dc.def_threshold_cbit.value : dc.mid_fwd_threshold_cbirt.value;
  if (metric >= threshold) pts += dc.points.value * dc.max_awards_per_match.value;

  return pts;
}

/* Negative-binomial-ish count draw: Poisson mean with gamma-mixed overdispersion. */
function overdispersedCount(mean, dispersion, rand) {
  if (mean <= 0) return 0;
  const shape = 1 / Math.max(1e-6, dispersion);
  let g = 0;
  for (let i = 0; i < Math.max(1, Math.round(shape)); i++) g += -Math.log(1 - rand());
  const lambda = mean * (g / Math.max(1, Math.round(shape)));
  let k = 0, p = Math.exp(-lambda), acc = p;
  const u = rand();
  while (u > acc && k < 60) { k++; p = (p * lambda) / k; acc += p; }
  return k;
}

function pickWeighted(entries, rand) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  if (total <= 0) return null;
  let u = rand() * total;
  for (const [id, w] of entries) { u -= w; if (u <= 0) return id; }
  return entries[entries.length - 1][0];
}

/* One side's simulated match line for every player in its XI. */
function simulateSide(side, opp, ctx, sim) {
  const { rules, params, rand } = ctx;
  const scenario = sampleScenario(side.scenarios, rand);
  const onPitch = scenario.xi;
  const lines = new Map();
  const minsCfg = params.layer3;

  for (const p of onPitch) {
    lines.set(p.player_id, {
      player_id: p.player_id, position: p.position, team_id: side.team_id,
      minutes: Math.round(p.exp_min_start ?? minsCfg.start_minutes.value),
      goals: 0, assists: 0, saves: 0, saves_in_box: 0, saves_big_chance: 0,
      goals_conceded: sim.against, clearances_blocks_interceptions: 0, tackles: 0, recoveries: 0,
      yellow: 0, red: 0, own_goals: 0, pens_taken: 0, pens_scored: 0, pens_saved: 0, pens_missed: 0,
      key_passes: 0, started: true,
    });
  }
  // cameos: bench players who come on
  for (const p of side.players) {
    if (lines.has(p.player_id)) continue;
    if (rand() < p.p_cameo) {
      lines.set(p.player_id, {
        player_id: p.player_id, position: p.position, team_id: side.team_id,
        minutes: Math.round(p.exp_min_cameo ?? minsCfg.cameo_minutes.value),
        goals: 0, assists: 0, saves: 0, saves_in_box: 0, saves_big_chance: 0,
        goals_conceded: Math.round(sim.against * 0.3),
        clearances_blocks_interceptions: 0, tackles: 0, recoveries: 0,
        yellow: 0, red: 0, own_goals: 0, pens_taken: 0, pens_scored: 0, pens_saved: 0, pens_missed: 0,
        key_passes: 0, started: false,
      });
    }
  }

  const pitch = [...lines.values()];
  const idsOnPitch = new Set(pitch.map((l) => l.player_id));
  const byId = new Map(side.players.map((p) => [p.player_id, p]));

  /* ── penalties: how many, who took them, did they score ── */
  let goalsLeft = sim.scored;
  const penRate = side.pen.pen_rate;
  const penCount = rand() < penRate ? 1 : 0;
  for (let i = 0; i < penCount && goalsLeft >= 0; i++) {
    const dutyEntries = [...side.pen.duty.entries()].filter(([id]) => idsOnPitch.has(id));
    const takerId = dutyEntries.length ? pickWeighted(dutyEntries, rand) : null;
    if (!takerId) break;
    const taker = byId.get(takerId);
    const line = lines.get(takerId);
    line.pens_taken += 1;
    const conv = side.pen.conversion(taker);
    if (rand() < conv && goalsLeft > 0) { line.goals += 1; line.pens_scored += 1; goalsLeft -= 1; }
    else { line.pens_missed += 1; }
  }

  /* ── open-play goals: multinomial over shrunken shares, weighted by minutes on pitch ── */
  const shareEntries = pitch
    .filter((l) => l.position !== "GKP")
    .map((l) => {
      const p = byId.get(l.player_id);
      const fin = p.finishing || 1;
      return [l.player_id, (p.share || 0) * fin * (l.minutes / 90)];
    });
  const assistW = pitch.map((l) => [l.player_id, (byId.get(l.player_id).assist_share || 0) * (l.minutes / 90)]);
  const assistRate = params.layer2.assist_share_of_goals.value;

  for (let g = 0; g < goalsLeft; g++) {
    const scorerId = pickWeighted(shareEntries, rand);
    if (scorerId === null) break;
    lines.get(scorerId).goals += 1;
    if (rand() < assistRate) {
      const pool = assistW.filter(([id]) => id !== scorerId);
      const assisterId = pickWeighted(pool, rand);
      if (assisterId !== null) { lines.get(assisterId).assists += 1; lines.get(assisterId).key_passes += 1; }
    }
  }

  /* ── defensive events, conditioned on game state ── */
  const gs = sim.states;
  const cbitMult = params.layer4.game_state_cbit_multiplier.value;
  const stateMult = gs.leading * cbitMult.leading + gs.level * cbitMult.level + gs.trailing * cbitMult.trailing;
  const disp = params.layer4.cbit_dispersion.value;

  for (const l of pitch) {
    const p = byId.get(l.player_id);
    const per90 = l.minutes / 90;
    l.clearances_blocks_interceptions = overdispersedCount(Number(p.cbi_per90 || 0) * per90 * stateMult, disp, rand);
    l.tackles = overdispersedCount(Number(p.tackles_per90 || 0) * per90 * stateMult, disp, rand);
    l.recoveries = overdispersedCount(Number(p.recoveries_per90 || 0) * per90 * stateMult, disp, rand);
    if (rand() < Number(p.yellow_per90 || 0) * per90) l.yellow = 1;
    if (rand() < Number(p.red_per90 || 0) * per90) l.red = 1;
    if (rand() < Number(p.og_per90 || 0) * per90) l.own_goals = 1;
  }

  /* ── keeper: shots faced from the opponent's lambda, saves = SoT minus goals conceded ── */
  const gk = pitch.find((l) => l.position === "GKP");
  if (gk) {
    const shotsFaced = overdispersedCount(opp.lambda * params.layer4.shots_faced_per_lambda.value, 0.3, rand);
    const sot = Math.round(shotsFaced * params.layer4.sot_share_of_shots.value);
    const saves = Math.max(0, sot - sim.against);
    gk.saves = saves;
    gk.saves_in_box = Math.round(saves * params.layer4.in_box_share_of_saves.value);
    gk.saves_big_chance = Math.round(saves * params.layer4.big_chance_share_of_saves.value);
    const penAgainst = rand() < opp.pen.pen_rate ? 1 : 0;
    if (penAgainst && rand() < 1 - params.layer2.pen_conversion.value) gk.pens_saved = 1;
  }

  return pitch;
}

/* BPS for one player line, extending the shipped rules-driven engine with the 2026/27
   save rows the archive-facing engine cannot see (in-box, big chance). */
function bpsForSim(line, rules) {
  let bps = bpsFor(line, line.position, rules);
  bps += (line.saves_in_box || 0) * v(rules, "bps.save_inside_box_extra");
  bps += (line.saves_big_chance || 0) * v(rules, "bps.save_big_chance_extra");
  return bps;
}

/* Simulate one fixture N times. Returns per-player point samples. */
export function simulateFixture({ home, away, rules, params, sims, seed }) {
  const rho = params.layer1.rho.value;
  const cap = params.layer1.grid_cap.value;
  const matchMinutes = params.layer1.match_minutes.value;
  const rand = mulberry32(seed);
  const sample = makeSampler(home.lambda, away.lambda, rho, cap);

  const samples = new Map();
  const register = (id) => { if (!samples.has(id)) samples.set(id, { pts: [], goals: 0, assists: 0, cs: 0, bonus: 0, defcon: 0, appeared: 0 }); return samples.get(id); };
  for (const p of [...home.players, ...away.players]) register(p.player_id);

  for (let n = 0; n < sims; n++) {
    const [hg, ag] = sample(rand);
    const states = gameStateShares(goalMinutes(hg, matchMinutes, rand), goalMinutes(ag, matchMinutes, rand), matchMinutes);
    const ctx = { rules, params, rand };
    const hLines = simulateSide(home, away, ctx, { scored: hg, against: ag, states: states.home });
    const aLines = simulateSide(away, home, ctx, { scored: ag, against: hg, states: states.away });
    const all = [...hLines, ...aLines];

    const race = all.map((l) => ({ key: l.player_id, bps: bpsForSim(l, rules) }));
    const bonus = allocateBonus(race);

    for (const l of all) {
      const base = pointsFor(l, l.position, rules);
      const b = bonus.get(l.player_id) || 0;
      const rec = register(l.player_id);
      rec.pts.push(base + b);
      rec.goals += l.goals;
      rec.assists += l.assists;
      rec.appeared += 1;
      rec.bonus += b;
      if (l.minutes >= 60 && l.goals_conceded === 0) rec.cs += 1;
      const cbit = l.clearances_blocks_interceptions + l.tackles;
      const metric = l.position === "DEF" || l.position === "GKP" ? cbit : cbit + l.recoveries;
      const thr = l.position === "DEF" || l.position === "GKP"
        ? v(rules, "scoring.defensive_contribution.def_threshold_cbit")
        : v(rules, "scoring.defensive_contribution.mid_fwd_threshold_cbirt");
      if (metric >= thr) rec.defcon += 1;
    }
    // players who did not appear in this sim score zero
    for (const [id, rec] of samples) if (rec.pts.length < n + 1) rec.pts.push(0);
  }

  return samples;
}

export function summarise(rec, sims, params) {
  const arr = rec.pts;
  const n = arr.length || 1;
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  const varc = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const sorted = [...arr].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  const qs = {};
  for (const p of params.layer4.quantiles.value) qs["p" + Math.round(p * 100)] = q(p);
  const haul = params.layer4.haul_threshold.value;
  return {
    ep_mean: +mean.toFixed(3),
    ep_sd: +Math.sqrt(varc).toFixed(3),
    quantiles: qs,
    p_12plus: +(arr.filter((x) => x >= haul).length / n).toFixed(4),
    p_goal: +(rec.goals / n).toFixed(4),
    p_assist: +(rec.assists / n).toFixed(4),
    p_cs: +(rec.cs / n).toFixed(4),
    e_bonus: +(rec.bonus / n).toFixed(3),
    e_defcon: +(rec.defcon / n).toFixed(4),
  };
}

/* Within-team covariance of simulated points — triple-ups are correlated bets and the
   solver has to price them as such. */
export function covariance(ids, samples) {
  // Only players with a sample series can be in the matrix. Returning the id list alongside the
  // matrix keeps the stored artifact self-describing and makes a missing series impossible to hide.
  const player_ids = ids.filter((id) => (samples.get(id)?.pts || []).length > 0);
  const series = player_ids.map((id) => samples.get(id).pts);
  const means = series.map((s) => s.reduce((a, b) => a + b, 0) / (s.length || 1));
  const m = player_ids.length;
  const out = [];
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j < m; j++) {
      const a = series[i], b = series[j];
      const n = Math.min(a.length, b.length) || 1;
      let c = 0;
      for (let k = 0; k < n; k++) c += (a[k] - means[i]) * (b[k] - means[j]);
      row.push(+(c / n).toFixed(4));
    }
    out.push(row);
  }
  return { player_ids, cov: out };
}
