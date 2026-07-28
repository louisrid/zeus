/* No "use client" directive: this is pure arithmetic with no browser APIs, and a server route needs to
   import it to build the brief and run the optimiser. */
import SCHEDULE from "../../config/schedule.js";
// The single place the tool decides what number to show for a player and what to call it.
//
// BINDING (STATUS.md, 24 Jul): the term xP appears in the UI only once the walk-forward
// Projected points are called xP everywhere, always. Louis set this on 26 Jul 2026, superseding the
// earlier rule that withheld the name until a calibration gate passed. The reasoning: the number is
// genuinely calculated, DEFCON and minutes are handled properly, and the model's real limitations are
// reported on the Analysis page rather than hidden behind a euphemism. metricName() remains the only
// source of the label so no screen can drift.

export const UPGRADES = {
  // Dates come from config/schedule.json and nowhere else. Never retype one here.
  score: SCHEDULE.upgrades.score,
  minutes: SCHEDULE.upgrades.minutes,
  structure: SCHEDULE.upgrades.structure,
};

export const metricName = () => "xPTS";
export const metricLabel = () => "xPTS · PROJECTED POINTS";
/* Kept as a no-op so no screen breaks. Nothing is labelled provisional to the user any more. */
export const interimChip = () => null;

/* Per-90 attacking output from last season's Understat row: the strongest real signal available
   before a ball is kicked in 2026/27. Returns null when the player has no usable history. */
function understatPer90(u) {
  if (!u || !u.minutes || u.minutes < 180) return null;
  const per90 = ((Number(u.xg) || 0) + (Number(u.xa) || 0)) / (u.minutes / 90);
  return per90;
}

/* Availability multiplier, straight off the FPL fields. */
export function availabilityMult(p) {
  if (p.status === "i" || p.status === "s" || p.status === "u" || p.status === "n") return 0;
  if (p.chance_of_playing !== null && p.chance_of_playing !== undefined) {
    return Math.max(0, Math.min(1, p.chance_of_playing / 100));
  }
  return p.status === "d" ? 0.5 : 1;
}

/* Fixture multiplier from the market's implied goal environment. Attackers ride their own
   team's lambda; goalkeepers and defenders ride the opponent's, inverted. */

/* APPEARANCE POINTS DO NOT MOVE WITH THE FIXTURE.
 *
 * A player who starts collects two points whoever he is playing. Scaling his whole rate by a fixture
 * multiplier therefore swings the projection about twice as hard as reality: more than half of an average
 * return is just turning up. Measured on the fitted per-start means, 56 percent for a keeper or
 * midfielder, 64 percent for a defender, 47 percent for a forward.
 *
 * Only the variable part, goals, assists, clean sheets and bonus, responds to the opponent. A 4.0 per-90
 * midfielder used to read 2.80 in the worst fixture and 5.60 in the best. He now reads 3.40 to 4.80, which
 * is the spread the scoring actually allows.
 */
const hasSplit = (a) => a && Number.isFinite(a.attackPer90) && Number.isFinite(a.defencePer90)
  && (a.attackPer90 + a.defencePer90 + (a.appearPer90 || 0)) > 0;

/* Apply each multiplier to the part it belongs to, then rescale so the shrunk total is respected.
   Shrinkage acts on the blended rate, so the parts are used for their SHAPE, not their size. */
function blendSplit(a, shrunkRate, attFx, defFx) {
  const appear = a.appearPer90 || 0, att = a.attackPer90 || 0, def = a.defencePer90 || 0;
  const raw = appear + att + def;
  if (raw <= 0) return shrunkRate;
  const adjusted = appear + att * attFx + def * defFx;
  return shrunkRate * (adjusted / raw);
}

function applyFixture(rate, fx, appearancePoints) {
  const base = Number(appearancePoints) || 0;
  if (!Number.isFinite(rate)) return rate;
  // A rate below the appearance floor belongs to someone barely playing; scale it whole.
  if (rate <= base) return rate * fx;
  return base + (rate - base) * fx;
}

/* How favourable the fixture is for SCORING, from how many the player's side is expected to score. */
export function attackMult(env, leagueMean) {
  if (!env || !leagueMean || env.forGoals === null || env.forGoals === undefined) return 1;
  return Math.max(0.55, Math.min(1.6, env.forGoals / (leagueMean / 2)));
}

/* How favourable it is for KEEPING THEM OUT, from how many the opponent is expected to score. Clean
   sheets, saves and goals conceded all live here, and they answer to a different question than goals do. */
export function defenceMult(env, leagueMean) {
  if (!env || !leagueMean || env.againstGoals === null || env.againstGoals === undefined) return 1;
  const half = leagueMean / 2;
  return Math.max(0.55, Math.min(1.6, (2 * half - env.againstGoals) / half));
}

export function fixtureMult(p, env, leagueMean) {
  if (!env || !leagueMean) return 1;
  const own = env.forGoals;
  const against = env.againstGoals;
  if (own === null || against === null) return 1;
  const half = leagueMean / 2;
  if (p.position === "GKP" || p.position === "DEF") {
    return Math.max(0.55, Math.min(1.6, (2 * half - against) / half));
  }
  return Math.max(0.55, Math.min(1.6, own / half));
}

/* The interim score. Built only from observed data, in a stated priority order, and it reports
   which source it used so the UI can be honest about it.
   1. engine projection (ep_mean) when the projections table has a row
   2. last season's points per 90 from the archive view
   3. last season's Understat xG+xA per 90 mapped through the ruleset's own goal/assist values
   Nothing falls back to price or guesswork: a player with no history scores 0 and is marked. */
export function buildScorer({ projections, archivePer90, understat, envByTeam, envByTeamGw, perGw, leagueMeanGoals, goalPoints, assistPoints, appearancePoints, minutesForecasts, shrinkageNineties, positionMeans, promotionFactor, players, difficultyOf, hasFixture, engineShrinkNineties, penaltyTakers, teamQuality }) {
  const proj = projections || new Map();
  const arch = archivePer90 || new Map();
  const us = understat || new Map();
  const mins = minutesForecasts || new Map();
  const shrinkS = Number.isFinite(Number(shrinkageNineties)) ? Number(shrinkageNineties) : 0;
  const positionMean = positionMeans || {};

  /* Shrink a per-90 rate toward the position mean by n/(n+S). Fitted S is 24 ninety-minute blocks,
     which is heavy on purpose: reliability on the held-out season shows the raw rates are
     over-spread, under-predicting low scorers and over-predicting high ones. With no sample size
     available the rate is returned untouched rather than shrunk by a guess. */
  /* PROMOTED CLUBS, derived rather than listed.
   *
   * A club whose entire squad has almost no prior-season Premier League minutes was not in the league
   * last season. That is a data test, so it self-maintains every August instead of needing a hardcoded
   * list that goes stale.
   *
   * Why this matters: the engine treats a promoted club's defence as an average Premier League defence,
   * because it has no prior data to say otherwise. That produced a promoted-club defender projecting
   * 7.4 points, implying a near-certain clean sheet. Measured over four seasons and twelve promoted
   * clubs, a promoted defender returns 63% of what everyone else does, and a forward 84%. Those factors
   * are fitted in config/fitted-params.json and were, until now, applied to nothing. */
  const promotedTeams = new Set();
  if (players && players.length) {
    const byTeam = new Map();
    for (const p of players) {
      if (!p.team_id) continue;
      const a = byTeam.get(p.team_id) || { nineties: 0, squad: 0 };
      const hist = arch.get(p.fpl_id);
      a.nineties += hist ? Number(hist.nineties) || 0 : 0;
      a.squad += 1;
      byTeam.set(p.team_id, a);
    }
    for (const [teamId, a] of byTeam) {
      // An established club's squad carries hundreds of prior-season nineties between them.
      if (a.squad >= 10 && a.nineties / a.squad < 2) promotedTeams.add(teamId);
    }
  }

  /* FALLBACK RECONCILIATION (DECISIONS 9.12, the half that covers the interim path).
   *
   * The engine path reallocates an absent player's share before allocation. The interim path had no
   * equivalent: an injured striker scored zero and nobody absorbed his output, so a club's implied
   * total quietly shrank. Here, each club-position group's rate total is conserved: the absent
   * share is redistributed proportionally across available members of the same group.
   *
   * The uplift is capped at 1.35 because a one-man group would otherwise inherit a whole absent
   * teammate, and that is a stronger claim than the evidence supports. The cap is a stated limit,
   * not a hidden one. */
  const groupUplift = new Map();
  if (players && players.length) {
    const groups = new Map();
    for (const gp of players) {
      const hist = arch.get(gp.fpl_id);
      if (!hist || !(hist.pointsPer90 > 0)) continue;
      const key = `${gp.team_id}|${gp.position}`;
      const g = groups.get(key) || { all: 0, avail: 0 };
      g.all += hist.pointsPer90;
      if (availabilityMult(gp) > 0) g.avail += hist.pointsPer90;
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      if (g.avail > 0 && g.all > g.avail) groupUplift.set(key, Math.min(1.35, g.all / g.avail));
    }
  }
  const conserve = (p) => groupUplift.get(`${p.team_id}|${p.position}`) || 1;

  /* PENALTY DUTY, and the reason it is applied to almost nobody.
   *
   * The job has collected this since day one and the scorer never read it. The obvious fix, adding an
   * uplift to every taker, is WRONG: a player's archive rate is last season's actual points, and those
   * already contain every penalty he scored. Adding a bonus on top counts them twice, and the first
   * version of this did exactly that, handing a taker a full extra point a gameweek.
   *
   * So the uplift applies only where penalties are NOT already in the number: the position-mean fallback,
   * used for a player with no prior-season record. For everyone else the archive has it covered.
   *
   * The size: a side wins about 0.145 penalties a match, the designated taker takes around 85 percent of
   * them, and roughly 79 percent are scored. That is a tenth of a goal a match, worth a few tenths of a
   * point depending on position. Small, and it should be. */
  const PENS_PER_MATCH = 0.145, TAKER_SHARE = 0.85, CONVERSION = 0.79;
  const penaltyBonus = (p) => {
    if (!penaltyTakers || !penaltyTakers.has(p.fpl_id)) return 0;
    const gp = goalPoints[p.position] ?? 4;
    return PENS_PER_MATCH * TAKER_SHARE * CONVERSION * gp;
  };

  const promoted = (p) => {
    if (!promotionFactor || !promotedTeams.has(p.team_id)) return 1;
    const f = Number(promotionFactor[p.position]);
    return Number.isFinite(f) && f > 0 ? f : (Number(promotionFactor.overall) || 1);
  };

  /* Shrink toward the position mean by n/(n+S). The mean is points PER START, so it is only a valid
     target for a player who will start. A youth forward with no history was inheriting the full 4.27
     and out-ranking established players, because weight 0 hands him the mean outright.
     `target` therefore takes an already-minutes-adjusted mean where the caller has one. */
  /* WHICH CLUB HE PLAYS FOR.
   *
   * The position mean is one number, so every player with no prior-season record scored exactly the same:
   * all four backup keepers identical at 0.6, and a confirmed Arsenal centre back rated level with a
   * confirmed Hull one. That is the model flattening players, and the fix is data we already hold.
   *
   * Two figures per club, both centred on one: how much better than average they are at scoring, and at
   * keeping clean sheets. A keeper lives on clean sheets, a forward on goals, the others sit between.
   * Applied to the position mean only, because a player WITH a record already carries his club's effect in
   * his own numbers. It is also the shrinkage target, so a thin record regresses toward a player at HIS
   * club rather than toward the league.
   */
  const qualityFor = (p) => {
    if (!teamQuality || !p) return 1;
    const q = teamQuality.get(p.team_id);
    if (!q) return 1;
    const att = Number.isFinite(q.attack) ? q.attack : 1;
    const def = Number.isFinite(q.defence) ? q.defence : 1;
    if (p.position === "GKP") return def;
    if (p.position === "DEF") return 0.72 * def + 0.28 * att;
    if (p.position === "MID") return 0.32 * def + 0.68 * att;
    return att;
  };

  /* THE BEST PRIOR FOR A PLAYER WITH NO RECORD IS HIS OWN TEAM-MATES.
   *
   * Jacquet is named in Liverpool's published eleven, so his MINUTES are already right: 0.93 nineties, the
   * same as Van Dijk. What was wrong was his rate. With no prior-season record he fell back to the position
   * mean across every defender in the league, which badly understates a centre back at a side that keeps
   * clean sheets, and club quality alone is capped too tightly to close the gap.
   *
   * A better prior is sitting right there: the players at HIS club, in HIS position, who DO have a record. A
   * Liverpool centre back is far more likely to score like a Liverpool centre back than like the average of
   * all defenders. Only proven team-mates count, and only when there are at least two of them, so one
   * outlier cannot set the level. Below that it falls back to the club-adjusted league mean.
   */
  const clubPositionMean = (() => {
    const cache = new Map();
    return (p) => {
      const key = `${p.team_id}:${p.position}`;
      if (cache.has(key)) return cache.get(key);
      const mates = (players || []).filter((x) => x.team_id === p.team_id && x.position === p.position
        && x.fpl_id !== p.fpl_id);
      const rates = [];
      for (const m of mates) {
        const a = arch.get(m.fpl_id);
        if (!a || !Number.isFinite(Number(a.pointsPer90))) continue;
        // Only a player with a real season behind him, and only if he actually plays.
        if (Number(a.nineties) < 10) continue;
        // A benched team-mate is not evidence of what a starter scores.
        const f = mins.get(m.fpl_id);
        if (f && Number.isFinite(Number(f.p_start)) && Number(f.p_start) < 0.5) continue;
        rates.push(Number(a.pointsPer90));
      }
      const out = rates.length >= 2 ? rates.reduce((x, y) => x + y, 0) / rates.length : null;
      cache.set(key, out);
      return out;
    };
  })();

  /* The level to regress an unproven player toward: his proven team-mates in the same position where there
     are enough of them, otherwise the league mean adjusted for how good his club is. */
  const priorFor = (p) => {
    const mates = clubPositionMean(p);
    const league = Number(positionMean[p.position]) * qualityFor(p);
    if (!Number.isFinite(league)) return mates;
    if (mates === null) return league;
    /* Blended rather than replaced, because a handful of team-mates is a small sample and the league mean
       carries real information about the position itself. Two thirds weight on the team-mates. */
    return 0.66 * mates + 0.34 * league;
  };

  const shrink = (rate, nineties, position, target = null, S = shrinkS) => {
    const mean = target === null ? Number(positionMean[position]) : Number(target);
    if (!S || !Number.isFinite(mean) || !Number.isFinite(Number(nineties))) return rate;
    const n = Number(nineties);
    const w = n / (n + S);
    return w * rate + (1 - w) * mean;
  };
  // The engine's own shrinkage. Lighter than the archive's, because ep_mean already conditions on
  // minutes and fixture; S=24 there double-counted caution and compressed the top of the list.
  const engineS = Number.isFinite(Number(engineShrinkNineties)) ? Number(engineShrinkNineties) : shrinkS;

  /* Expected ninetieths of a match. The archive and Understat paths both produce a per-90 rate, so
     without this they answer "how good is he per full match" rather than "what will he return this
     week". Measured on the held-out 2025/26 season, applying it lifted rank correlation with actual
     points from +0.093 to +0.484 and cut RMSE from 3.63 to 2.69, which is the single largest
     improvement available from components that already exist.
     Returns null when no forecast exists, and the caller then leaves the rate unscaled rather than
     multiplying by a guess. */
  const expectedNineties = (p) => {
    const f = mins.get(p.fpl_id);
    if (!f) return null;
    const pStart = Number(f.p_start);
    const startMin = Number(f.exp_min_start);
    if (!Number.isFinite(pStart) || !Number.isFinite(startMin)) return null;
    const pCameo = Number.isFinite(Number(f.p_cameo)) ? Number(f.p_cameo) : 0;
    const cameoMin = Number.isFinite(Number(f.exp_min_cameo)) ? Number(f.exp_min_cameo) : 0;
    const expMinutes = pStart * startMin + pCameo * cameoMin;
    if (!(expMinutes > 0)) return null;
    return Math.min(expMinutes, 90) / 90;
  };

  const scoreOf = (p) => {
    const row = proj.get(p.fpl_id);
    if (row && row.ep_mean !== null && row.ep_mean !== undefined) {
      /* SMALL-SAMPLE GUARD ON THE ENGINE.
       *
       * The engine returned its own number with no reference to how much history the player has.
       * A defender with a third of a season's minutes was projected 7.4, which implies a near-certain
       * clean sheet plus attacking returns. The allocation layer was extrapolating a share from almost
       * nothing, and the engine has never been validated, so its raw output cannot be trusted at thin
       * sample sizes.
       *
       * The same fitted shrinkage the interim path uses is applied here: pull toward the position mean
       * by n/(n+S) where n is prior-season nineties. A full season is untouched; a third of a season
       * moves most of the way to the mean. This is a discipline the engine should have had, not a
       * correction invented for this bug. */
      const engine = Number(row.ep_mean);
      const hist = arch.get(p.fpl_id);
      const nineties = hist ? Number(hist.nineties) : 0;
      // ep_mean already includes minutes; the position mean does not. Scale the target so the two are
      // on the same footing, otherwise a player expected to play ten minutes inherits a full start.
      const played = expectedNineties(p);
      // If forecasts exist for other players but not this one, he is not expected to play at all, and
      // that is information. If no forecasts were loaded anywhere, we simply cannot see minutes.
      if (played === null && nineties === 0 && mins.size > 0) return 0;
      const target = Number(positionMean[p.position]) * (played === null ? 1 : played);
      return round2(shrink(engine, nineties, p.position, target, engineS) * promoted(p));
    }

    const avail = availabilityMult(p);
    if (avail === 0) return 0;
    const env = envByTeam ? envByTeam.get(p.team_id) : null;
    const fx = fixtureMult(p, env, leagueMeanGoals);

    const nineties = expectedNineties(p);

    const a = arch.get(p.fpl_id);
    if (a && a.nineties >= 2) {
      /* Rebuild the rate from its parts, each meeting the multiplier it depends on. Falls back to the
         single blended figure for anyone whose split we could not compute. */
      const shrunk = shrink(a.pointsPer90, a.nineties, p.position, priorFor(p));
      const rate = (hasSplit(a)
        ? blendSplit(a, shrunk, attackMult(env, leagueMeanGoals), defenceMult(env, leagueMeanGoals))
        : applyFixture(shrunk, fx, appearancePoints)) * avail * promoted(p) * conserve(p);
      return round2(nineties === null ? rate : rate * nineties);
    }

    const per90 = understatPer90(us.get(p.fpl_id));
    if (per90 !== null) {
      const gp = goalPoints[p.position] ?? 0;
      const attacking = per90 * ((gp + assistPoints) / 2);
      const rate = applyFixture(attacking + appearancePoints, fx, appearancePoints) * avail * promoted(p);
      return round2(nineties === null ? rate : rate * nineties);
    }

    /* Expected to play, nothing else known: most of a newly promoted squad. Scoring zero made a promoted
       club's first-choice defender rank below an established club's fourth choice, which is wrong rather
       than cautious. The position mean scaled by expected minutes is the same target the engine path
       shrinks toward at zero weight, so both paths agree about a player with no history. */
    if (nineties !== null && nineties > 0) {
      const mean = Number(positionMean[p.position]);
      if (Number.isFinite(mean)) return round2(applyFixture((priorFor(p) ?? (mean * qualityFor(p))) + penaltyBonus(p), fx, appearancePoints) * nineties * avail * promoted(p));
    }
    return 0;
  };

  const sourceOf = (p) => {
    if (proj.get(p.fpl_id)) return "engine";
    const a = arch.get(p.fpl_id);
    if (a && a.nineties >= 2) return "archive";
    if (understatPer90(us.get(p.fpl_id)) !== null) return "understat";
    return "none";
  };

  /* Distribution accessors. The engine supplies real quantiles; the interim path supplies a
     symmetric band derived from the score itself and is flagged as such by sourceOf(). */
  const bandOf = (p) => {
    const row = proj.get(p.fpl_id);
    if (row && row.quantiles) {
      const q = row.quantiles;
      return { p10: num(q.p10 ?? q.p5), p50: num(q.p50), p90: num(q.p90 ?? q.p95), real: true };
    }
    const s = scoreOf(p);
    return { p10: round2(Math.max(0, s * 0.35)), p50: round2(s), p90: round2(s * 1.9), real: false };
  };

  const tailOf = (p) => {
    const row = proj.get(p.fpl_id);
    if (row && row.p_12plus !== null && row.p_12plus !== undefined) return Number(row.p_12plus);
    return null;
  };

  const floorOf = (p) => bandOf(p).p10;

  /* xP for one specific gameweek, so a fixture run can show a number per fixture rather than the same
     number five times. Uses the engine's own per-gameweek series where it exists, and otherwise
     recomputes the base rate against that gameweek's goal environment. Every discipline the current
     gameweek gets — shrinkage, promotion factor, availability, expected minutes — applies here too.
     Returns null when that gameweek cannot be scored, never a repeat of another gameweek's number. */
  const scoreForGw = (p, gw) => {
    const series = perGw ? perGw.get(p.fpl_id) : null;
    if (series) {
      const row = series.find((r) => r.gw === gw);
      if (row && Number.isFinite(Number(row.ep_mean))) {
        const hist = arch.get(p.fpl_id);
        const nineties = hist ? Number(hist.nineties) : 0;
        const played = expectedNineties(p);
        if (played === null && nineties === 0 && mins.size > 0) return 0;
        const target = Number(positionMean[p.position]) * (played === null ? 1 : played);
        return round2(shrink(Number(row.ep_mean), nineties, p.position, target, engineS) * promoted(p));
      }
    }

    const avail = availabilityMult(p);
    if (avail === 0) return 0;
    /* A blank gameweek is zero points, which is different from a fixture whose opponent strength we
       cannot read. Only the first is genuinely no football. */
    if (hasFixture && !hasFixture(p, gw)) return 0;
    /* Fixture strength for this gameweek. Goal environments come from odds, which only exist for the
       imminent fixture, so beyond it we fall back to the same opponent-difficulty scale the fixture
       tags use. That is real per-fixture information rather than a repeat of gameweek one. */
    const env = envByTeamGw ? envByTeamGw.get(`${p.team_id}|${gw}`) : null;
    let fx;
    if (env) {
      fx = fixtureMult(p, env, leagueMeanGoals);
    } else if (difficultyOf) {
      const d = difficultyOf(p, gw);
      // Difficulty 0 is the easiest fixture in the league, 100 the hardest. Map to the same 0.55-1.6
      // band fixtureMult uses, so the two routes are on one scale. An unknown opponent is neutral,
      // not zero: the player still plays that gameweek.
      fx = d === null || d === undefined ? 1 : Math.max(0.55, Math.min(1.6, 1.6 - (Number(d) / 100) * 1.05));
    } else {
      fx = 1;
    }
    const nineties = expectedNineties(p);
    const promo = promoted(p);

    const a = arch.get(p.fpl_id);
    if (a && a.nineties >= 2) {
      const shrunk = shrink(a.pointsPer90, a.nineties, p.position, priorFor(p));
      const rate = (hasSplit(a)
        ? blendSplit(a, shrunk, attackMult(env, leagueMeanGoals), defenceMult(env, leagueMeanGoals))
        : applyFixture(shrunk, fx, appearancePoints)) * avail * promo * conserve(p);
      return round2(nineties === null ? rate : rate * nineties);
    }
    const per90 = understatPer90(us.get(p.fpl_id));
    if (per90 !== null) {
      const gp = goalPoints[p.position] ?? 0;
      const attacking = per90 * ((gp + assistPoints) / 2);
      const rate = applyFixture(attacking + appearancePoints, fx, appearancePoints) * avail * promo;
      return round2(nineties === null ? rate : rate * nineties);
    }

    /* A PLAYER WE EXPECT TO PLAY BUT KNOW NOTHING ELSE ABOUT.
     *
     * No engine projection, no prior-season minutes, no shot data: most of a newly promoted club's squad.
     * Returning nothing scored him zero, which made a promoted club's genuine first-choice defender rank
     * below an established club's fourth choice. That is not caution, it is wrong: a player expected to
     * start will collect appearance points at the very least.
     *
     * So: the position mean, scaled by expected minutes and carrying the promotion factor. That is exactly
     * the shrinkage target the engine path uses at zero weight, so the two paths agree about a player with
     * no history rather than one scoring him and the other scoring nothing. Only a player with no minutes
     * forecast at all still returns null, because then we genuinely do not expect him to play.
     */
    if (nineties !== null && nineties > 0) {
      const mean = Number(positionMean[p.position]);
      if (Number.isFinite(mean)) return round2(applyFixture((priorFor(p) ?? (mean * qualityFor(p))) + penaltyBonus(p), fx, appearancePoints) * nineties * avail * promo);
    }
    return null;
  };

  /* ONE METHOD ACROSS GAMEWEEKS.
   *
   * The engine projects the imminent fixture, because that is where the odds are. Every gameweek after
   * it used a different route, so the same player was scored two ways and the series had a cliff at
   * gameweek two: a thin-sample defender read 6.2 for GW1 and a fraction of that afterwards, or the
   * reverse. Worse, the old rescale divided by a fixture multiplier that had been clamped at 0.55,
   * which inflated later gameweeks by nearly two.
   *
   * Now every gameweek is anchored on the SAME per-player estimate, scoreOf, which already carries
   * shrinkage, the promotion factor, availability and expected minutes. Later gameweeks differ from it
   * only by relative fixture strength, and that ratio is bounded, because a fixture swing cannot
   * plausibly change a player's expected return by more than about a third either way.
   */
  const anchoredForGw = (p, gw) => {
    const anchor = scoreOf(p);
    if (!Number.isFinite(anchor) || anchor === 0) return null;
    if (hasFixture && !hasFixture(p, gw)) return 0;

    const thisEnv = envByTeamGw ? envByTeamGw.get(`${p.team_id}|${gw}`) : null;
    const baseEnv = envByTeam ? envByTeam.get(p.team_id) : null;
    let ratio = 1;
    if (thisEnv && baseEnv) {
      const a = fixtureMult(p, thisEnv, leagueMeanGoals);
      const b = fixtureMult(p, baseEnv, leagueMeanGoals);
      if (b > 0) ratio = a / b;
    } else if (difficultyOf) {
      const dThis = difficultyOf(p, gw);
      const raw = difficultyOf(p, currentGwFor(p));
      // An unreadable anchor fixture is treated as average rather than abandoning the comparison,
      // which would flatten the whole series to one repeated number.
      const dBase = raw === null || raw === undefined ? 50 : Number(raw);
      if (dThis !== null && dThis !== undefined) {
        // Easier than the anchor fixture lifts it, harder lowers it, on the same 0-100 scale.
        ratio = (100 - Number(dThis) + 50) / (100 - dBase + 50);
      }
    }
    return round2(anchor * Math.max(0.7, Math.min(1.4, ratio)));
  };

  /* The anchor fixture is the one scoreOf itself used: the player's next. envByTeam carries its
     gameweek in production; when it does not, the earliest gameweek we hold an environment for is the
     same fixture, so that is the fallback rather than giving up and returning a flat series. */
  const currentGwFor = (p) => {
    const env = envByTeam ? envByTeam.get(p.team_id) : null;
    if (env && env.gw !== undefined && env.gw !== null) return env.gw;
    if (envByTeamGw) {
      let lowest = null;
      for (const key of envByTeamGw.keys()) {
        const [team, gw] = key.split("|");
        if (Number(team) !== Number(p.team_id)) continue;
        const n = Number(gw);
        if (lowest === null || n < lowest) lowest = n;
      }
      if (lowest !== null) return lowest;
    }
    return null;
  };

  const scoreForGwSmooth = (p, gw) => {
    const direct = scoreForGw(p, gw);
    // A stored per-gameweek engine row is the best answer available and is used as-is.
    const series = perGw ? perGw.get(p.fpl_id) : null;
    const hasRow = series && series.some((r) => r.gw === gw && Number.isFinite(Number(r.ep_mean)));
    if (hasRow) return direct;
    const anchored = anchoredForGw(p, gw);
    return anchored === null ? direct : anchored;
  };

  return { scoreOf, scoreForGw: scoreForGwSmooth, sourceOf, bandOf, tailOf, floorOf };
}

const round2 = (v) => +Number(v).toFixed(2);
const num = (v) => (v === null || v === undefined ? null : Number(v));

/* What the app says about where its numbers came from. Kept here with metricName so the label and
   its provenance can never drift apart. */
export function provenanceLine(model) {
  const { engineRows = 0, livePlayers = 0, gateOpen } = model || {};
  if (engineRows === 0) {
    return "Scores from last season's output and the market's goal lines. The engine has not run yet.";
  }
  const pct = livePlayers > 0 ? Math.round((engineRows / livePlayers) * 100) : 0;
  const state = gateOpen ? "calibration passed" : "calibration not yet run";
  if (pct >= 99) return `Projections from the simulation engine, ${state}.`;
  // The honest version: say how much of the list the engine covers and what the rest is.
  return `Simulation engine for ${engineRows} of ${livePlayers} players (${pct}%), ${state}. `
    + `The rest are scored from last season's output and the market's goal lines, shrunk toward the position mean, so their spread is narrower.`;
}
