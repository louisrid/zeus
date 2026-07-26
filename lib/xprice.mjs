/* X£ — WHAT A PLAYER SHOULD COST. Rank-mapped against the real price ladder.
 *
 * The previous version was projected points divided by a league-wide constant. That is a linear
 * transform of xP: sort by one and you have sorted by the other, with uniform decrements. It carried
 * zero information the xP column did not already carry, and its clamp pinned six of thirteen visible
 * players at 16.0. Louis caught it from the sort behaviour alone. Deleted, per the teardown in
 * docs/xp-xprice-roadmap.md, and replaced with the rank map specced there.
 *
 * THE METHOD:
 *   1. Take every player the model can actually score: sourceOf(p) !== "none".
 *   2. Rank them by projected output, descending.
 *   3. Take the same players' real prices, sorted descending. That is the price ladder.
 *   4. fair(p) = the price at his output rank on that ladder.
 *
 * X£ is the price of whoever sits at your rank in the real price ladder. No clamp is possible,
 * because fair prices are drawn from the real price multiset. Budget-consistent by construction: any
 * legal fifteen valued at fair prices sums to a real, achievable figure. Position-blind, so a £6.0
 * defender out-producing a £6.0 forward reads as the better buy, which is the point.
 *
 * What it claims: this player's output ranks where a differently priced player's output usually ranks.
 * What it does not claim: that his price will change, or that the market as a whole is mispriced. It
 * is a relative index and inherits FPL's own price distribution.
 *
 * A player the model cannot score is NOT ranked at zero. He is absent from the ladder and reads
 * "No data", because a number standing in for ignorance is how the last version broke.
 */

export function buildXPrice(pool, scoreOf, sourceOf) {
  if (!pool || !pool.length || typeof scoreOf !== "function") return null;

  const usable = pool
    .filter((p) => Number(p.price) > 0 && (!sourceOf || sourceOf(p) !== "none"))
    .map((p) => ({ p, out: Number(scoreOf(p)) }))
    .filter((r) => Number.isFinite(r.out));
  if (usable.length < 10) return null; // too thin a market to read a ladder from

  // Rank by output; ties broken by real price so an expensive player keeps the expensive rung.
  const byOutput = [...usable].sort((a, b) => b.out - a.out || Number(b.p.price) - Number(a.p.price));
  const ladder = usable.map((r) => Number(r.p.price)).sort((a, b) => b - a);

  const fairById = new Map();
  byOutput.forEach((r, i) => fairById.set(r.p.fpl_id, ladder[i]));

  const of = (p) => {
    const fair = fairById.get(p.fpl_id);
    if (fair === undefined) return null; // unscoreable: "No data", never a number
    const price = Number(p.price);
    const gap = Math.round((fair - price) * 10) / 10;
    return {
      xprice: fair,
      gap,
      // Under-priced means his output ranks where more expensive players' output usually ranks.
      verdict: gap > 0.5 ? "under" : gap < -0.5 ? "over" : "fair",
    };
  };

  return { of, ranked: usable.length, ladderTop: ladder[0], ladderBottom: ladder[ladder.length - 1] };
}

/* The clearest mispricings, for a surface that wants to lead with them. */
export function biggestGaps(pool, xprice, { limit = 8, direction = "under" } = {}) {
  if (!pool || !xprice) return [];
  const rows = pool
    .map((p) => ({ p, x: xprice.of(p) }))
    .filter((r) => r.x !== null && r.x.verdict === direction);
  rows.sort((a, b) => (direction === "under" ? b.x.gap - a.x.gap : a.x.gap - b.x.gap));
  return rows.slice(0, limit);
}
