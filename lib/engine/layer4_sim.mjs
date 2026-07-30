// Layer 4 · joint match simulation (01 §3.4).
// One fixture, N simulations, both teams simulated together so teammate and opponent outcomes
// are correlated by construction. The BPS race runs inside every simulated match using the
// rules-driven engine from Package 2, so bonus is priced as the 22-player competition it is.

import { mulberry32, seedFrom, poisson, negBinomial, categorical, goalMinutes, quantile } from "./rng.mjs";
import { scorelineGrid, sampleScoreline, defensiveOutcomes, gameStateShares } from "./layer1_scoreline.mjs";
import { sampleXI } from "./layer3_minutes.mjs";
import { pointsFor } from "./points.mjs";
import { bpsFor, allocateBonus } from "../bps_engine.mjs";

/* Simulate one fixture. Returns per-player samples keyed by player id. */
export function simulateFixture({ fixture, home, away, lambdas, rho, rules, table, cfg, N }) {
  const rng = mulberry32(seedFrom(`${cfg.seed}:${fixture.id}`));
  const { grid, truncation } = scorelineGrid(lambdas.lambda_home, lambdas.lambda_away, rho);
  const def = defensiveOutcomes(grid);

  const sides = [
    { key: "home", team: home, lambda: lambdas.lambda_home, oppLambda: lambdas.lambda_away, pCs: def.pCsHome },
    { key: "away", team: away, lambda: lambdas.lambda_away, oppLambda: lambdas.lambda_home, pCs: def.pCsAway },
  ];

  const samples = new Map();
  const register = (p) => {
    if (!samples.has(p.player_id)) {
      samples.set(p.player_id, {
        player_id: p.player_id,
        position: p.position,
        side: p.side,
        pts: [],
        goals: 0,
        assists: 0,
        scoredIn: 0,
        assistedIn: 0,
        cs: 0,
        bonus: 0,
        defcon: 0,
        played: 0,
      });
    }
    return samples.get(p.player_id);
  };
  for (const s of sides) for (const p of s.team.players) register({ ...p, side: s.key });

  for (let n = 0; n < N; n++) {
    const [hg, ag] = sampleScoreline(grid, rng());
    const hMins = goalMinutes(rng, hg, cfg.fullTime);
    const aMins = goalMinutes(rng, ag, cfg.fullTime);
    const state = gameStateShares(hMins, aMins, cfg.fullTime);

    const matchEvents = [];

    for (const s of sides) {
      const scored = s.key === "home" ? hg : ag;
      const conceded = s.key === "home" ? ag : hg;
      const shares = s.key === "home" ? state.home : state.away;

      const scoredGoalMinutes = s.key === "home" ? hMins : aMins;
      const concededGoalMinutes = s.key === "home" ? aMins : hMins;
      const xi = sampleXI(s.team.players, rng, cfg.formation);
      const xiSet = new Set(xi.map((player) => player.player_id));

      // Build coherent on-pitch intervals. Every cameo occupies a real starter's
      // substitution slot, so the simulation never has 12+ team-mates active.
      const starters = [];
      for (const player of s.team.players) {
        if (!xiSet.has(player.player_id)) continue;
        let minutes = player.exp_min_start || cfg.fullTime;
        if (rng() > (player.p60_given_start ?? 1)) {
          minutes = Math.min(minutes, cfg.subOffMinute * rng() + 45);
        }
        minutes = Math.max(1, Math.min(cfg.fullTime, minutes));
        const endMinute = minutes >= 89 ? cfg.fullTime : minutes;
        starters.push({ p: player, minutes: endMinute, startMinute: 0, endMinute });
      }

      const substitutionSlots = starters
        .filter((interval) => interval.endMinute < cfg.fullTime)
        .sort((a, b) => a.endMinute - b.endMinute);
      const cameoCandidates = [];
      for (const player of s.team.players) {
        if (xiSet.has(player.player_id)) continue;
        const conditionalCameo = (player.p_cameo ?? 0) / Math.max(1e-6, 1 - (player.p_start ?? 0));
        if (rng() < conditionalCameo) cameoCandidates.push({ player, order: rng() });
      }
      cameoCandidates.sort((a, b) => a.order - b.order);

      const substitutes = [];
      for (let index = 0; index < Math.min(substitutionSlots.length, cameoCandidates.length); index++) {
        const slot = substitutionSlots[index];
        const player = cameoCandidates[index].player;
        const requestedMinutes = Math.max(1, Math.min(cfg.fullTime, player.exp_min_cameo || 0));
        const startMinute = Math.max(slot.endMinute, cfg.fullTime - requestedMinutes);
        if (startMinute >= cfg.fullTime) continue;
        substitutes.push({
          p: player,
          minutes: cfg.fullTime - startMinute,
          startMinute,
          endMinute: cfg.fullTime,
        });
      }

      const onPitch = [...starters, ...substitutes];
      if (!onPitch.length) continue;
      const eligibleAt = (minute) => onPitch.filter(
        (interval) => minute >= interval.startMinute && minute <= interval.endMinute,
      );
      const scorerWeight = (interval) => Math.max(0, interval.p.goalShare) * (interval.p.finishing || 1);
      const assistWeight = (interval) => Math.max(0, interval.p.assistShare);

      const perPlayer = new Map();
      for (const interval of onPitch) {
        const goalsConceded = concededGoalMinutes.filter(
          (minute) => minute >= interval.startMinute && minute <= interval.endMinute,
        ).length;
        perPlayer.set(interval.p.player_id, {
          player_id: interval.p.player_id,
          position: interval.p.position,
          minutes: interval.minutes,
          goals: 0,
          assists: 0,
          goalsConceded,
          saves: 0,
          pensSaved: 0,
          pensMissed: 0,
          yellow: 0,
          red: 0,
          ownGoals: 0,
          cbit: 0,
          recoveries: 0,
          key_passes: 0,
          pens_taken: 0,
          pens_missed: 0,
          clearances_blocks_interceptions: 0,
          tackles: 0,
        });
      }

      // Penalties retain the identity of the sampled taker. The old two-pass
      // implementation could sample one player as taker and credit another.
      const convertedPenalties = [];
      if (s.team.penAwardRate !== null && s.team.penAwardRate !== undefined) {
        const awarded = poisson(rng, s.team.penAwardRate);
        for (let index = 0; index < awarded; index++) {
          const penaltyMinute = Math.floor(rng() * cfg.fullTime);
          const eligible = eligibleAt(penaltyMinute);
          if (!eligible.length) continue;
          const duty = eligible
            .filter((interval) => (interval.p.penRank || 0) > 0)
            .sort((a, b) => a.p.penRank - b.p.penRank)[0];
          const taker = duty || eligible[categorical(rng, eligible.map(scorerWeight))] || null;
          if (!taker) continue;
          const event = perPlayer.get(taker.p.player_id);
          event.pens_taken += 1;
          const conversion = taker.p.penConversion;
          if (conversion === null || conversion === undefined) continue;
          if (rng() < conversion) convertedPenalties.push(taker);
          else {
            event.pensMissed += 1;
            event.pens_missed += 1;
          }
        }
      }

      const creditedPenalties = convertedPenalties.slice(0, scored);
      for (const taker of creditedPenalties) perPlayer.get(taker.p.player_id).goals += 1;
      const openGoals = Math.max(0, scored - creditedPenalties.length);

      const shuffledGoalMinutes = [...scoredGoalMinutes];
      for (let index = shuffledGoalMinutes.length - 1; index > 0; index--) {
        const swap = Math.floor(rng() * (index + 1));
        [shuffledGoalMinutes[index], shuffledGoalMinutes[swap]] = [shuffledGoalMinutes[swap], shuffledGoalMinutes[index]];
      }
      const openGoalMinutes = shuffledGoalMinutes.slice(0, openGoals);
      for (const minute of openGoalMinutes) {
        const eligible = eligibleAt(minute);
        if (!eligible.length) continue;
        const scorerIndex = categorical(rng, eligible.map(scorerWeight));
        if (scorerIndex < 0) continue;
        const scorer = eligible[scorerIndex];
        perPlayer.get(scorer.p.player_id).goals += 1;
        if (rng() > cfg.unassistedShare) {
          const assisterIndex = categorical(
            rng,
            eligible.map((interval, index) => (index === scorerIndex ? 0 : assistWeight(interval))),
          );
          if (assisterIndex >= 0) {
            perPlayer.get(eligible[assisterIndex].p.player_id).assists += 1;
            perPlayer.get(eligible[assisterIndex].p.player_id).key_passes += 1;
          }
        }
      }

      // Defensive volume is conditioned on game state: a side protecting a
      // lead defends more, while a trailing side defends less.
      const stateMult = 1 + cfg.stateCbitBoost * (shares.leading - shares.trailing);
      for (const x of onPitch) {
        const ev = perPlayer.get(x.p.player_id);
        const scale = (x.minutes / cfg.fullTime) * stateMult;
        const cbit = negBinomial(rng, Math.max(0, (x.p.cbit90 || 0) * scale), cfg.countDispersion);
        const rec = negBinomial(rng, Math.max(0, (x.p.recoveries90 || 0) * scale), cfg.countDispersion);
        ev.cbit = cbit;
        ev.recoveries = rec;
        ev.clearances_blocks_interceptions = Math.round(cbit * (1 - cfg.tackleShareOfCbit));
        ev.tackles = cbit - ev.clearances_blocks_interceptions;
        ev.key_passes += negBinomial(rng, Math.max(0, (x.p.keyPasses90 || 0) * scale), cfg.countDispersion);
        if (x.p.position === "GKP") {
          const faced = negBinomial(rng, Math.max(0, s.oppLambda * cfg.shotsOnTargetPerGoal * scale), cfg.countDispersion);
          ev.saves = Math.max(0, faced - ev.goalsConceded);
        }
        if (rng() < (x.p.yellow90 || 0) * scale) ev.yellow = 1;
        if (rng() < (x.p.red90 || 0) * scale) ev.red = 1;
        if (rng() < (x.p.og90 || 0) * scale) ev.ownGoals = 1;
      }

      for (const [, ev] of perPlayer) matchEvents.push(ev);
    }

    // BPS race across all 22-plus players in this simulated match, then bonus allocation.
    const bpsList = matchEvents.map((ev) => ({
      key: ev.player_id,
      /* cfg.bpsOffset is the measured per-position gap between the BPS formula and real BPS, derived from
         the archive by deriveBpsOffsets. Without it, positions the formula can fully see (goalkeepers) beat
         positions whose credit the archive cannot carry (midfielders) in every simulated bonus race. */
      bps: (cfg.bpsOffset?.[ev.position] ?? 0) + bpsFor(
        {
          minutes: ev.minutes,
          goals: ev.goals,
          assists: ev.assists,
          goals_conceded: ev.goalsConceded,
          saves: ev.saves,
          pens_saved: ev.pensSaved,
          pens_missed: ev.pens_missed,
          clearances_blocks_interceptions: ev.clearances_blocks_interceptions,
          recoveries: ev.recoveries,
          tackles: ev.tackles,
          key_passes: ev.key_passes,
          yellow: ev.yellow,
          red: ev.red,
          own_goals: ev.ownGoals,
        },
        ev.position,
        rules
      ),
    }));
    const bonus = allocateBonus(bpsList);

    for (const ev of matchEvents) {
      ev.bonus = bonus.get(ev.player_id) || 0;
      const pts = pointsFor(ev, ev.position, table);
      const rec = samples.get(ev.player_id);
      if (!rec) continue;
      rec.pts.push(pts);
      rec.goals += ev.goals;
      rec.assists += ev.assists;
      if (ev.goals > 0) rec.scoredIn += 1;
      if (ev.assists > 0) rec.assistedIn += 1;
      rec.bonus += ev.bonus;
      rec.played += 1;
      if (ev.minutes >= 60 && ev.goalsConceded === 0) rec.cs += 1;
      const threshold = ev.position === "DEF" ? table.defcon.defThreshold : table.defcon.midFwdThreshold;
      const contribution = ev.position === "DEF" ? ev.cbit : ev.cbit + ev.recoveries;
      if (ev.position !== "GKP" && contribution >= threshold) rec.defcon += 1;
    }
    // Players who never took the pitch in this sim score zero.
    for (const [, rec] of samples) {
      if (rec.pts.length < n + 1) rec.pts.push(0);
    }
  }

  return { samples, truncation, N };
}

/* Turn raw samples into the projections row shape (01 §2). */
export function summarise(rec, N) {
  const sorted = [...rec.pts].sort((a, b) => a - b);
  const mean = sorted.reduce((s, x) => s + x, 0) / (sorted.length || 1);
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, sorted.length - 1);
  const p12 = sorted.filter((x) => x >= 12).length / (sorted.length || 1);
  return {
    ep_mean: +mean.toFixed(3),
    ep_sd: +Math.sqrt(variance).toFixed(3),
    p_goal: +(rec.scoredIn / N).toFixed(4),
    p_assist: +(rec.assistedIn / N).toFixed(4),
    e_goals: +(rec.goals / N).toFixed(3),
    e_assists: +(rec.assists / N).toFixed(3),
    p_cs: +(rec.cs / N).toFixed(4),
    e_bonus: +(rec.bonus / N).toFixed(3),
    e_defcon: +(rec.defcon / N).toFixed(3),
    p_12plus: +p12.toFixed(4),
    quantiles: {
      p5: quantile(sorted, 0.05),
      p10: quantile(sorted, 0.1),
      p25: quantile(sorted, 0.25),
      p50: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p90: quantile(sorted, 0.9),
      p95: quantile(sorted, 0.95),
    },
  };
}

/* Within-team covariance of simulated points, used for squad-level distributions and rank-EV. */
export function teamCovariance(samples, teamPlayerIds) {
  const ids = teamPlayerIds.filter((id) => samples.has(id));
  const series = ids.map((id) => samples.get(id).pts);
  const means = series.map((s) => s.reduce((a, b) => a + b, 0) / (s.length || 1));
  const matrix = {};
  for (let i = 0; i < ids.length; i++) {
    matrix[ids[i]] = {};
    for (let j = 0; j < ids.length; j++) {
      let acc = 0;
      const n = Math.min(series[i].length, series[j].length);
      for (let k = 0; k < n; k++) acc += (series[i][k] - means[i]) * (series[j][k] - means[j]);
      matrix[ids[i]][ids[j]] = +(acc / Math.max(1, n - 1)).toFixed(4);
    }
  }
  return matrix;
}
