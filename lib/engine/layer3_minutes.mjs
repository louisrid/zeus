// Layer 3 · minutes as hazard (01 §3.3).
//
// INTERIM MODEL — upgrade date 1 Aug 2026 (ticket B-04 + the fatigue study's World Cup load
// values). This version is a transparent, monotone hazard built from observed rates only:
// archive start frequency, archive survival past 60', sub-on frequency, availability status
// and presser signals. It is NOT the LightGBM classifier with isotonic calibration; that lands
// with B-04 once the archive supports walk-forward training. Everything it writes carries
// model_version 'interim', and every surface that renders it is labelled with the upgrade date.

export const MINUTES_MODEL = { version: "minutes-interim-1", upgrade_date: "2026-08-01" };

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
   value. Until 1 Aug the study has not run, so wcPrior is null and nothing is applied —
   the model does not guess at a fatigue effect. */
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
  const minutesShare = player.teamMinutesAvailable > 0
    ? Math.min(1, (player.minutes || 0) / player.teamMinutesAvailable)
    : null;
  const blended = minutesShare === null
    ? baseStart
    : cfg.wMinutesShare * minutesShare + (1 - cfg.wMinutesShare) * baseStart;

  let pStart = Math.max(0, Math.min(cfg.pStartCeiling, blended * avail));
  pStart = Math.max(0, Math.min(cfg.pStartCeiling, pressorAdjust(pStart, signal)));
  const wc = wcLoadAdjust(pStart, gw, player.wc_load_flag, cfg.wcPrior);
  pStart = wc.p;

  const appearRate = shrinkRate(player.appearances || 0, player.teamGames || 0, league.appearRate, cfg.kStart);
  const pAppear = Math.max(pStart, Math.min(cfg.pStartCeiling, (appearRate ?? pStart) * avail));
  const pCameo = Math.max(0, pAppear - pStart);

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
  const picked = [];
  for (const p of players) if (rng() < p.p_start) picked.push(p);
  const byPos = (pos) => picked.filter((p) => p.position === pos);
  const pool = (pos) => players.filter((p) => p.position === pos).sort((a, b) => b.p_start - a.p_start);

  const need = { GKP: formation.GKP_exact, DEF: formation.DEF_min, MID: formation.MID_min, FWD: formation.FWD_min };
  let squad = [];
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    let group = byPos(pos).sort((a, b) => b.p_start - a.p_start);
    const min = need[pos] || 0;
    if (group.length < min) {
      const extra = pool(pos).filter((p) => !group.includes(p)).slice(0, min - group.length);
      group = group.concat(extra);
    }
    if (pos === "GKP" && group.length > formation.GKP_exact) group = group.slice(0, formation.GKP_exact);
    squad = squad.concat(group);
  }
  // Trim to 11 by lowest p_start, never below a positional minimum.
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of squad) counts[p.position]++;
  squad.sort((a, b) => a.p_start - b.p_start);
  while (squad.length > 11) {
    const idx = squad.findIndex((p) => counts[p.position] > (need[p.position] || 0));
    if (idx === -1) break;
    counts[squad[idx].position]--;
    squad.splice(idx, 1);
  }
  return squad;
}

const round4 = (v) => (v === null || v === undefined ? null : +Number(v).toFixed(4));
const round2 = (v) => (v === null || v === undefined ? null : +Number(v).toFixed(2));
