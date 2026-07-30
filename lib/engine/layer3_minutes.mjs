import { sampleRealXI } from "./lineup_sampler_v2.mjs";
// Layer 3 · minutes as hazard (01 §3.3).
//
// Minutes model. Shrinkage parameters are fitted; see config/engine-2026-27.json (ticket B-04 and the fatigue study's World Cup load
// values). This version is a transparent, monotone hazard built from observed rates only:
// archive start frequency, archive survival past 60', sub-on frequency, availability status
// and presser signals. It is NOT the LightGBM classifier with isotonic calibration; that lands
// with B-04 once the archive supports walk-forward training. Everything it writes carries
// model_version 'interim', and every surface that renders it is labelled with the upgrade date.
export const MINUTES_MODEL = { version: "minutes-interim-3", upgrade_date: "2026-07-30" };

/* Shrink an observed rate toward the league mean by sample size. */
export function shrinkRate(successes, trials, leagueMean, k) {
  const n = trials || 0;
  if (leagueMean === null || leagueMean === undefined) return n > 0 ? successes / n : null;
  return (successes + k * leagueMean) / (n + k);
}
/* Availability multiplier straight off the FPL status field and chance_of_playing. */
export function availability(player) {
  const s = player.status;
  if (s === "i" || s === "s" || s === "u" || s === "n") return 0;
  if (player.chance_of_playing !== null && player.chance_of_playing !== undefined) {
    return Math.max(0, Math.min(1, player.chance_of_playing / 100));
  }
  return s === "d" ? 0.5 : 1;
}
/* Presser signal applied on top of availability. Weights scale with the parser's confidence,
   so a low-confidence rumour barely moves the number. */
export function pressorAdjust(base, signal) {
  if (!signal) return base;
  const c = Math.max(0, Math.min(1, signal.confidence ?? 0.5));
  switch (signal.signal) {
    case "out":
      return base * (1 - c);
    case "doubt":
      return base * (1 - 0.5 * c);
    case "rested":
      return base * (1 - 0.6 * c);
    case "confirmed":
      return base + (1 - base) * c;
    default:
      return base;
  }
}
/* World Cup load flag: GW1-4 only, and only applied when the fatigue study has supplied a
   value. Until that study runs, wcPrior is null and nothing is applied: the model does not
   guess at a fatigue effect. Dates live in config/schedule.js. */
export function wcLoadAdjust(base, gw, wcFlag, wcPrior) {
  if (!wcFlag || !wcPrior || gw > 4) return { p: base, applied: false };
  return { p: base * (1 - wcPrior), applied: true };
}
/* The full per-player forecast for one gameweek. */
export function forecastMinutes({ player, league, signal, gw, cfg }) {
  const avail = availability(player);

  const startRate = shrinkRate(player.starts || 0, player.appearances || 0, league.startRate, cfg.kStart);
  const baseStart = startRate === null ? league.startRate ?? 0 : startRate;
  // Season minutes share is the strongest single signal available pre-season.
  /* ZERO MINUTES IS NOT EVIDENCE WHEN THE PLAYER WAS NOT THERE.
   *
   * A new signing has no archive row, so he arrived here with 0 minutes over a full season of team games and
   * a minutes share of 0, which the blend read as a player his club never picks. Every player on a promoted
   * club scored a start chance of about 4%, while the lineup sampler still had to field eleven of them, so
   * the app showed near-zero start odds beside projections that assumed they play. No record means UNKNOWN:
   * the share is left null and the forecast falls back to the league start rate until real minutes or team
   * news arrive. A reserve who genuinely never plays is separated from a new signing within a gameweek by
   * actual minutes, and immediately by a presser signal. */
  const noRecord = (player.minutes || 0) === 0 && (player.appearances || 0) === 0;
  const minutesShare = player.teamMinutesAvailable > 0 && !noRecord
    ? Math.min(1, (player.minutes || 0) / player.teamMinutesAvailable)
    : null;
  /* A player with no record starts 18% of matches, MEASURED across two newcomer cohorts of the archive,
     not the ~50% the league rate among regulars would hand him. Without this, a squad's new signings
     outranked its established starters in the lineup sampler and stole their simulated minutes. */
  const blended = noRecord
    ? (cfg.newcomerStartRate ?? 0.18)
    : minutesShare === null
      ? baseStart
      : cfg.wMinutesShare * minutesShare + (1 - cfg.wMinutesShare) * baseStart;
  let pStart = Math.max(0, Math.min(cfg.pStartCeiling, blended * avail));
  pStart = Math.max(0, Math.min(cfg.pStartCeiling, pressorAdjust(pStart, signal)));
  const wc = wcLoadAdjust(pStart, gw, player.wc_load_flag, cfg.wcPrior);
  pStart = wc.p;

  const appearRate = shrinkRate(player.appearances || 0, player.teamGames || 0, league.appearRate, cfg.kStart);
  const pAppear = Math.max(pStart, Math.min(cfg.pStartCeiling, (appearRate ?? pStart) * avail));
  const isGoalkeeper = String(player.position || "").toUpperCase() === "GKP";
  const pCameo = isGoalkeeper ? 0 : Math.max(0, pAppear - pStart);
  const survive60 = shrinkRate(player.starts60 || 0, player.starts || 0, league.survive60, cfg.kSurvive);
  const p60GivenStart = survive60 === null ? league.survive60 ?? 0 : survive60;

  const expMinStart = player.starts > 0 && player.startMinutes > 0
    ? Math.min(90, player.startMinutes / player.starts)
    : league.expMinStart ?? 0;
  const expMinCameo = player.cameos > 0 && player.cameoMinutes > 0
    ? Math.min(90, player.cameoMinutes / player.cameos)
    : league.expMinCameo ?? 0;
  // P(60+) total: started and survived, plus a cameo that came on early enough.
  const p60 = pStart * p60GivenStart + pCameo * (cfg.earlySubShare ?? 0);

  return {
    position: player.position ?? null,
    p_start: round4(pStart),
    p_cameo: round4(pCameo),
    p60: round4(p60),
    p60_given_start: round4(p60GivenStart),
    exp_min_start: round2(expMinStart),
    exp_min_cameo: round2(expMinCameo),
    wc_load_flag: Boolean(wc.applied),
    model_version: MINUTES_MODEL.version,
  };
}
/* League-level means used for shrinkage, computed from the same rows the caller loaded. */
export function leagueMinutesMeans(rows) {
  let starts = 0;
  let apps = 0;
  let teamGames = 0;
  let starts60 = 0;
  let startMinutes = 0;
  let cameos = 0;
  let cameoMinutes = 0;
  for (const r of rows) {
    starts += r.starts || 0;
    apps += r.appearances || 0;
    teamGames += r.teamGames || 0;
    starts60 += r.starts60 || 0;
    startMinutes += r.startMinutes || 0;
    cameos += r.cameos || 0;
    cameoMinutes += r.cameoMinutes || 0;
  }
  return {
    startRate: apps > 0 ? starts / apps : null,
    appearRate: teamGames > 0 ? apps / teamGames : null,
    survive60: starts > 0 ? starts60 / starts : null,
    expMinStart: starts > 0 ? startMinutes / starts : null,
    expMinCameo: cameos > 0 ? cameoMinutes / cameos : null,
  };
}
/* Coherent XI sampler. Samples each player's start, then repairs the lineup to the formation
   minimums by p_start order so competing players do not both start in the same simulation.
   The M=50 beam-search scenario generator arrives with B-04. */
export function sampleXI(players, rng, formation) {
  // Unavailable and true zero-start players must never be pulled back into the XI by the repair step.
  const eligible = (players || []).filter((p) =>
    String(p.minutes_source || "") !== "unavailable" && Number(p.p_start) > 0
  );
  if (eligible.length < 11) {
    throw new Error(`Cannot sample a valid XI: only ${eligible.length} available players have positive start probability`);
  }
  // `formation` contains fantasy-squad constraints, not real-team formation
  // constraints. In particular, it must not force an FPL-classified forward.
  return sampleRealXI(eligible, rng);
}
const round4 = (v) => (v === null || v === undefined ? null : +Number(v).toFixed(4));
const round2 = (v) => (v === null || v === undefined ? null : +Number(v).toFixed(2));

function normaliseStartGroup(group, target, ceiling) {
  if (!group.length) return;
  const total = () => group.reduce((sum, p) => sum + Number(p.p_start || 0), 0);
  if (Math.abs(total() - target) < 1e-9) return;

  let free = [...group];
  let fixedSum = 0;
  for (let pass = 0; pass <= group.length; pass++) {
    const remainingTarget = target - fixedSum;
    if (!free.length || remainingTarget <= 0) break;
    const freeSum = free.reduce((sum, p) => sum + Math.max(0, Number(p.p_start || 0)), 0);
    const equal = freeSum <= 0 ? remainingTarget / free.length : null;
    const scale = freeSum > 0 ? remainingTarget / freeSum : null;
    const stillFree = [];
    let cappedAny = false;

    for (const p of free) {
      const proposed = equal === null ? Math.max(0, Number(p.p_start || 0)) * scale : equal;
      if (proposed >= ceiling - 1e-12) {
        p.p_start = ceiling;
        fixedSum += ceiling;
        cappedAny = true;
      } else {
        p.p_start = proposed;
        stillFree.push(p);
      }
    }
    free = stillFree;
    if (!cappedAny) break;
  }

  // Remove tiny floating-point drift while respecting the ceiling.
  let residual = target - total();
  for (const p of group) {
    if (Math.abs(residual) < 1e-9) break;
    const roomUp = ceiling - p.p_start;
    const roomDown = p.p_start;
    const change = residual > 0 ? Math.min(residual, roomUp) : -Math.min(-residual, roomDown);
    p.p_start += change;
    residual -= change;
  }
}

/* Reconcile expected player-minutes with the 990 minutes that exist in a regulation match.
 *
 * Start probabilities decide who can occupy the eleven starting places. Conditional minutes decide how
 * long those starters and substitutes play. The total must still equal one team's 11 × 90 player-minutes.
 * Bench exposure is scaled from each player's own cameo forecast, never from one generic substitute rate.
 */
export function reconcileTeamExpectedMinutes(players, cfg, targetMinutes = 990) {
  const available = (players || []).filter((p) => String(p.minutes_source || "") !== "unavailable");
  const minuteOf = (p) => Math.max(0, Number(p.p_start || 0)) * Math.max(0, Number(p.exp_min_start || 0))
    + Math.max(0, Number(p.p_cameo || 0)) * Math.max(0, Number(p.exp_min_cameo || 0));
  const starterMinutes = available.reduce((sum, p) =>
    sum + Math.max(0, Number(p.p_start || 0)) * Math.max(0, Number(p.exp_min_start || 0)), 0);
  let remainingMinutes = Math.max(0, Number(targetMinutes) - starterMinutes);

  const bench = available.filter((p) =>
    String(p.position || "").toUpperCase() !== "GKP"
    && Math.max(0, 1 - Number(p.p_start || 0)) > 0
  );

  const expected = (p) => Math.max(0, Number(p.p_cameo || 0)) * Math.max(1, Number(p.exp_min_cameo || 0));
  const capacity = (p) => Math.max(0, 1 - Number(p.p_start || 0)) * Math.max(1, Number(p.exp_min_cameo || 0));
  let free = [...bench];
  const assigned = new Map();

  while (free.length && remainingMinutes > 1e-9) {
    const weights = free.map((p) => expected(p) > 0 ? expected(p) : capacity(p));
    const weightSum = weights.reduce((a, b) => a + b, 0);
    if (weightSum <= 0) break;
    let capped = false;
    const next = [];
    for (let i = 0; i < free.length; i++) {
      const p = free[i];
      const share = remainingMinutes * weights[i] / weightSum;
      const cap = capacity(p);
      if (share >= cap - 1e-9) {
        assigned.set(p, cap);
        remainingMinutes -= cap;
        capped = true;
      } else {
        next.push(p);
      }
    }
    if (!capped) {
      for (let i = 0; i < free.length; i++) assigned.set(free[i], remainingMinutes * weights[i] / weightSum);
      remainingMinutes = 0;
      break;
    }
    free = next;
  }

  for (const p of bench) {
    const mins = assigned.get(p) ?? 0;
    const cameoMinutes = Math.max(1, Number(p.exp_min_cameo || 0));
    p.p_cameo = Math.max(0, Math.min(1 - Number(p.p_start || 0), mins / cameoMinutes));
  }

  /* Sparse historical cameo data can leave too little nominal bench capacity. Do not leave a physically
     impossible 900-minute team. Increase conditional cameo minutes, capped at 45, only for players who can
     actually appear, until the final few minutes are represented. */
  let total = available.reduce((sum, p) => sum + minuteOf(p), 0);
  let residual = Number(targetMinutes) - total;
  if (residual > 1e-7 && bench.length) {
    const ordered = [...bench].sort((a, b) =>
      (Number(b.pre_lineup_p_start || 0) - Number(a.pre_lineup_p_start || 0))
      || String(a.player_id || "").localeCompare(String(b.player_id || ""))
    );
    for (const p of ordered) {
      if (residual <= 1e-7) break;
      const appearance = Math.max(0, Number(p.p_cameo || 0));
      if (appearance <= 0) {
        p.p_cameo = Math.min(1 - Number(p.p_start || 0), 1);
      }
      const probability = Math.max(0, Number(p.p_cameo || 0));
      if (probability <= 0) continue;
      const current = Math.max(1, Number(p.exp_min_cameo || 0));
      const maxConditional = Math.max(current, 45);
      const maxExtra = probability * (maxConditional - current);
      const extra = Math.min(residual, maxExtra);
      p.exp_min_cameo = current + extra / probability;
      residual -= extra;
    }
  }

  /* Exact floating-point reconciliation. This changes only a conditional cameo-minute value by a tiny
     amount and makes the stored table, engine input and audit agree on exactly 990 minutes. */
  total = available.reduce((sum, p) => sum + minuteOf(p), 0);
  residual = Number(targetMinutes) - total;
  if (Math.abs(residual) > 1e-7) {
    const p = bench.find((x) => Number(x.p_cameo || 0) > 0)
      || available.find((x) => Number(x.p_start || 0) > 0);
    if (p) {
      if (Number(p.p_cameo || 0) > 0) {
        p.exp_min_cameo = Math.max(0, Number(p.exp_min_cameo || 0) + residual / Number(p.p_cameo));
      } else {
        p.exp_min_start = Math.max(0, Math.min(90, Number(p.exp_min_start || 0) + residual / Number(p.p_start)));
      }
    }
  }

  for (const p of available) {
    const isGoalkeeper = String(p.position || "").toUpperCase() === "GKP";
    if (isGoalkeeper) p.p_cameo = 0;
    p.p60 = Number(p.p_start || 0) * Number(p.p60_given_start || 0)
      + Number(p.p_cameo || 0) * Number(cfg.earlySubShare || 0);
  }
  return players;
}

/* ELEVEN PLAYERS START. A validated predicted XI is locked exactly; partial or absent lineup evidence
 * keeps the named starters fixed and normalises only the remaining free places. */
export function normaliseTeamStarts(players, cfg) {
  const ceiling = cfg.pStartCeiling ?? 0.98;

  for (const p of players || []) {
    if (String(p.minutes_source || "") === "unavailable") {
      p.p_start = 0;
      p.p_cameo = 0;
      p.p60 = 0;
    }
  }

  const eligible = (players || []).filter((p) =>
    String(p.minutes_source || "") !== "unavailable" && Number.isFinite(Number(p.p_start))
  );
  if (eligible.length < 11) throw new Error(`Cannot normalise team starts: only ${eligible.length} available players`);

  const locked = eligible.filter((p) => String(p.minutes_source || "") === "lineup-starter");
  const lockedBench = eligible.filter((p) => String(p.minutes_source || "") === "lineup-notNamed");
  const forecastFree = eligible.filter((p) => !locked.includes(p) && !lockedBench.includes(p));
  const hasLineupEvidence = locked.length > 0 || lockedBench.length > 0;
  for (const p of locked) p.p_start = 1;
  for (const p of lockedBench) p.p_start = 0;

  const lockedGk = locked.filter((p) => String(p.position || "").toUpperCase() === "GKP").length;
  const lockedOutfield = locked.length - lockedGk;
  if (lockedGk > 1 || lockedOutfield > 10 || locked.length > 11) {
    throw new Error(`Invalid locked XI: ${lockedGk} goalkeepers and ${lockedOutfield} outfield starters`);
  }

  const gkTarget = Math.max(0, 1 - lockedGk);
  const outfieldTarget = Math.max(0, 10 - lockedOutfield);
  const replacementPool = [...forecastFree, ...lockedBench];
  const freeGoalkeepers = replacementPool.filter((p) => String(p.position || "").toUpperCase() === "GKP");
  const freeOutfield = replacementPool.filter((p) => String(p.position || "").toUpperCase() !== "GKP");

  if (gkTarget > 0 && freeGoalkeepers.length < gkTarget) throw new Error("Cannot normalise team starts: no free goalkeeper for the remaining slot");
  if (outfieldTarget > 0 && freeOutfield.length < outfieldTarget) throw new Error("Cannot normalise team starts: not enough free outfield players");

  const forecastWeight = (p) => Math.max(0, Number(p.pre_lineup_p_start ?? p.p_start ?? 0));
  const sortCandidates = (group) => [...group].sort((a, b) =>
    forecastWeight(b) - forecastWeight(a)
    || Number(b.p_cameo || 0) - Number(a.p_cameo || 0)
    || String(a.player_id || "").localeCompare(String(b.player_id || ""))
  );

  if (hasLineupEvidence) {
    /* A predicted XI is a discrete selection assumption, not a probability cloud. Available named players
       stay at 100%. If the published XI is missing a player or a named starter becomes unavailable, choose
       the single most likely replacement(s) from the base forecast. Every other squad member remains at
       zero start probability and only keeps a substitute chance. */
    for (const p of replacementPool) p.p_start = 0;
    const selected = [
      ...sortCandidates(freeGoalkeepers).slice(0, gkTarget),
      ...sortCandidates(freeOutfield).slice(0, outfieldTarget),
    ];
    const selectedSet = new Set(selected);
    for (const p of replacementPool) {
      if (selectedSet.has(p)) {
        p.p_start = 1;
        p.minutes_source = "lineup-replacement";
      } else if (String(p.minutes_source || "") !== "unavailable") {
        p.p_start = 0;
        p.minutes_source = "lineup-notNamed";
      }
    }
  } else {
    /* Teams without lineup evidence retain genuine uncertainty, but still obey one goalkeeper and ten
       outfield starters in expectation. */
    if (gkTarget === 0) for (const p of freeGoalkeepers) p.p_start = 0;
    else normaliseStartGroup(freeGoalkeepers, gkTarget, ceiling);
    if (outfieldTarget === 0) for (const p of freeOutfield) p.p_start = 0;
    else normaliseStartGroup(freeOutfield, outfieldTarget, ceiling);
  }

  for (const p of eligible) {
    const isGoalkeeper = String(p.position || "").toUpperCase() === "GKP";
    p.p_cameo = isGoalkeeper ? 0 : Math.max(0, Math.min(1 - Number(p.p_start || 0), Number(p.p_cameo || 0)));
    p.p60 = Number(p.p_start || 0) * Number(p.p60_given_start || 0)
      + Number(p.p_cameo || 0) * Number(cfg.earlySubShare || 0);
  }

  const startTotal = eligible.reduce((sum, p) => sum + Number(p.p_start || 0), 0);
  const gkTotal = eligible.filter((p) => String(p.position || "").toUpperCase() === "GKP")
    .reduce((sum, p) => sum + Number(p.p_start || 0), 0);
  if (Math.abs(startTotal - 11) > 1e-8 || Math.abs(gkTotal - 1) > 1e-8) {
    throw new Error(`Team starts failed reconciliation: total=${startTotal}, goalkeepers=${gkTotal}`);
  }

  return reconcileTeamExpectedMinutes(players, cfg, cfg.teamMinuteTarget ?? 990);
}

