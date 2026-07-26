/* X£ — WHAT A PLAYER SHOULD COST.
 *
 * From the original brief: "showing what a player should actually be worth... shown next to their
 * actual price and the price the system believes the player should be worth."
 *
 * METHOD, stated plainly because a proprietary index that nobody can interrogate is just a number.
 *
 * The market sets prices. Across a whole position the relationship between price and output tells you
 * what the market charges per point, so:
 *
 *   rate(position)  = total projected output of that position / total price of that position
 *   X£(player)      = player's projected output / rate(position)
 *
 * Fitted per position because the market prices a forward's point differently from a defender's, and
 * anchored to the real price floor so a fringe player is never valued below what anyone can be bought
 * for. Clamped to the league's actual price range: an index that says a player is worth £24m is not
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

  const rates = {};
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    const list = pool.filter((p) => p.position === pos && Number(p.price) > 0);
    if (list.length < 8) continue; // too thin a market to read a rate from
    const output = list.reduce((a, p) => a + Math.max(0, Number(scoreOf(p)) || 0), 0);
    const spend = list.reduce((a, p) => a + Number(p.price), 0);
    if (output <= 0 || spend <= 0) continue;
    rates[pos] = output / spend;
  }
  if (!Object.keys(rates).length) return null;

  const clamp = (v) => Math.min(MAX_PRICE, Math.max(MIN_PRICE, v));

  /* X£ for one player, plus the gap against what he actually costs. */
  const of = (p) => {
    const rate = rates[p.position];
    const price = Number(p.price);
    if (!rate || !(price > 0)) return null;
    const output = Number(scoreOf(p));
    if (!Number.isFinite(output)) return null;
    const fair = clamp(output / rate);
    const gap = fair - price;
    return {
      xprice: Math.round(fair * 10) / 10,
      gap: Math.round(gap * 10) / 10,
      // Under-priced means the market charges less than his output is worth at his position's rate.
      verdict: gap > 0.4 ? "under" : gap < -0.4 ? "over" : "fair",
    };
  };

  return { of, rates, minPrice: MIN_PRICE, maxPrice: MAX_PRICE };
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
