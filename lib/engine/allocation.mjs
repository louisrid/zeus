// B-06 / B-25 · Layer 2 — intra-team allocation.
// The market prices team goals; this layer decides who scores them. That split is the edge,
// so every constant here is read from config/model-params.json and is re-fitted in B-08.

const POS_PRIOR_SHARE = { GKP: 0.001, DEF: 0.05, MID: 0.11, FWD: 0.24 };

/* Shrunken npxG share. m = 90s played in the window; the prior dominates until evidence
   accumulates, which is what stops a one-goal cameo from owning a team's goal supply. */
export function goalShares(players, params) {
  const kPos = params.layer2.k_pos.value;
  const decay = params.layer2.prior_season_decay.value;

  const raw = players.map((p) => {
    const cur = Number(p.npxg_current || 0);
    const prev = Number(p.npxg_prior || 0) * decay;
    const npxg = cur + prev;
    const nineties = (Number(p.minutes_window || 0) + Number(p.minutes_prior || 0) * decay) / 90;
    return { ...p, npxg, nineties };
  });

  const teamNpxg = raw.reduce((s, p) => s + p.npxg, 0);
  const out = raw.map((p) => {
    const s = teamNpxg > 0 ? p.npxg / teamNpxg : 0;
    const k = kPos[p.position] ?? 6;
    const prior = POS_PRIOR_SHARE[p.position] ?? 0.1;
    const m = p.nineties;
    const share = (m * s + k * prior) / (m + k);
    return { ...p, share_raw: s, share };
  });

  const total = out.reduce((s, p) => s + p.share, 0);
  return out.map((p) => ({ ...p, share: total > 0 ? p.share / total : 0 }));
}

/* Finishing multiplier from career (G - xG)/xG, weighted by shots and clamped.
   Deliberately small: this is the component most likely to be noise. */
export function finishingMultiplier(player, params) {
  const K = params.layer2.finishing_K.value;
  const [lo, hi] = params.layer2.finishing_clamp.value;
  const xg = Number(player.career_xg || 0);
  const goals = Number(player.career_goals || 0);
  const shots = Number(player.career_shots || 0);
  if (xg <= 0.5 || shots <= 0) return 1;
  const r = (goals - xg) / xg;
  const w = shots / (shots + K);
  return Math.min(hi, Math.max(lo, 1 + w * r));
}

/* Penalty EV, broken out per 01 §3.2. Penalties are the most concentrated point source in
   the game, so they are never folded into the open-play share. */
export function penaltyModel(team, players, params) {
  const rate = Number(team.pen_rate ?? params.layer2.pen_rate_per_match.value);
  const conv = params.layer2.pen_conversion.value;
  const dutyP = params.layer2.pen_duty_rank1.value;
  const takers = players
    .filter((p) => p.pen_rank)
    .sort((a, b) => a.pen_rank - b.pen_rank);
  const duty = new Map();
  let remaining = 1;
  for (const t of takers) {
    const p = t.pen_rank === 1 ? dutyP : remaining * dutyP;
    duty.set(t.player_id, Math.min(remaining, p));
    remaining = Math.max(0, remaining - p);
  }
  return {
    pen_rate: rate,
    conversion: (p) => {
      const att = Number(p.pen_attempts || 0);
      const own = att > 0 ? Number(p.pen_scored || 0) / att : conv;
      const w = att / (att + 10);
      return w * own + (1 - w) * conv;
    },
    duty,
  };
}

/* Assist allocation. Every goal carries an assist with probability assist_share_of_goals;
   the assister is drawn from xA shares among on-pitch teammates, excluding the scorer. */
export function assistShares(players) {
  const total = players.reduce((s, p) => s + Number(p.xa_rate || 0), 0);
  return new Map(players.map((p) => [p.player_id, total > 0 ? Number(p.xa_rate || 0) / total : 0]));
}

/* B-25 · promoted-club shrinkage. Understat has no Championship coverage, so promoted players
   enter with no usable xG history. The blend weight starts at 1.0 and decays to 0 by GW10;
   while it is above 0 the UI carries the LOW SAMPLE marker and ep_sd is inflated. */
export function promotedBlend(player, gw, params) {
  if (!player.promoted) return { blend: 0, sd_inflation: 1 };
  const endGw = params.layer2.promoted_prior_decay_gw.value;
  const blend = Math.max(0, Math.min(1, (endGw - gw + 1) / endGw));
  const infl = 1 + (params.layer2.promoted_sd_inflation.value - 1) * blend;
  return { blend: +blend.toFixed(3), sd_inflation: infl };
}

export function applyPromotedPrior(share, cohortPrior, blend) {
  return (1 - blend) * share + blend * cohortPrior;
}
