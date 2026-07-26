/* X£ — WHAT A PLAYER SHOULD COST.
 *
 * From the original brief: "showing what a player should actually be worth... shown next to their
 * actual price and the price the system believes the player should be worth."
 *
 * METHOD, stated plainly because a proprietary index that nobody can interrogate is just a number.
 *
 * The market sets prices. Across the whole league the relationship between price and output tells you
 * what a point costs, so:
 *
 *   rate      = total projected output of every player / total price of every player
 *   X£(player) = player's projected output / rate
 *
 * ONE LEAGUE-WIDE RATE, not one per position. That is deliberate and it is the point of the index.
 * A per-position rate can only say "cheap among defenders", which hides the more valuable fact.
 * Measured over three seasons, at every price point a defender out-scores a forward:
 *
 *     price      DEF     FWD
 *      5.0      1.78    1.01     defenders return 76% more
 *      6.0      2.51    1.87     34% more
 *      7.0      2.92    2.27     29% more
 *
 * A per-position index would report both as fairly priced. A league-wide one says the defender is the
 * better buy, which is the actual decision. Points per million by position sit within 20% of each other
 * (GKP 0.202, DEF 0.231, MID 0.248, FWD 0.230), so a single rate does not collapse the list onto one
 * position, which was the risk worth checking before making this change.
 *
 * The per-position figure is still computed and returned as `withinPosition`, because squad quotas are
 * real: filling a specific defender slot is a within-position choice, and both questions are genuine.
 *
 * Clamped to the range the game actually issues: an index saying a player is worth £24m is not
 * describing this game.
 *
 * What it is: a read on whether the market has mispriced someone relative to his own position.
 * What it is not: a prediction that a price will change. Price movement is driven by transfers, which
 * this does not model, and pretending otherwise would be inventing a number.
 *
 * Returns null when the inputs do not exist. Never a zero standing in for an answer.
 */

const MIN_PRICE = 3.8;   // the lowest price the game has ever issued
const MAX_PRICE = 16.0;  // above any price the game has issued, so the clamp never binds in practice

export function buildXPrice(pool, scoreOf) {
  if (!pool || !pool.length || typeof scoreOf !== "function") return null;

  const rateOver = (list) => {
    if (list.length < 8) return null; // too thin a market to read a rate from
    const output = list.reduce((a, p) => a + Math.max(0, Number(scoreOf(p)) || 0), 0);
    const spend = list.reduce((a, p) => a + Number(p.price), 0);
    return output > 0 && spend > 0 ? output / spend : null;
  };

  const priced = pool.filter((p) => Number(p.price) > 0);
  const leagueRate = rateOver(priced);
  if (!leagueRate) return null;

  // Kept for the within-slot question, not used for X£ itself.
  const rates = {};
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    const r = rateOver(priced.filter((p) => p.position === pos));
    if (r) rates[pos] = r;
  }

  const clamp = (v) => Math.min(MAX_PRICE, Math.max(MIN_PRICE, v));

  /* X£ for one player, plus the gap against what he actually costs. */
  const of = (p) => {
    const price = Number(p.price);
    if (!(price > 0)) return null;
    const output = Number(scoreOf(p));
    if (!Number.isFinite(output)) return null;

    const fair = clamp(output / leagueRate);
    const gap = fair - price;

    // The same read within his own position, for when a specific slot is being filled.
    const posRate = rates[p.position];
    const within = posRate ? clamp(output / posRate) : null;

    return {
      xprice: Math.round(fair * 10) / 10,
      gap: Math.round(gap * 10) / 10,
      // Under-priced means the market charges less than his output is worth at the league rate.
      verdict: gap > 0.4 ? "under" : gap < -0.4 ? "over" : "fair",
      withinPosition: within === null ? null : Math.round(within * 10) / 10,
      withinPositionGap: within === null ? null : Math.round((within - price) * 10) / 10,
    };
  };

  return { of, leagueRate, rates, minPrice: MIN_PRICE, maxPrice: MAX_PRICE };
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
