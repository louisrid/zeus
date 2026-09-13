/* WHAT EACH PLAYER ACTUALLY COST, AND THEREFORE WHAT HE SELLS FOR.
 *
 * The live team was stored with a purchase price nobody ever paid. The sync took each player's price
 * today, scaled the fifteen so they summed to a hundred million, and wrote that back as what they cost:
 *
 *     purchasePrice: Math.round(price * scale * 10) / 10
 *
 * Nothing in the game works that way. A player's cost is what you paid on the day you bought him, and it
 * never moves again; only his current price does. The scaling made every sale value a guess, which made
 * the bank a guess, which made the transfer budget a guess. It reported £100.2m when the truth was
 * £99.8m, and it would drift further every time a price changed.
 *
 * THE REAL ANSWER IS PUBLIC. Two endpoints and one field give it exactly:
 *
 *   /entry/{id}/transfers/   element_in_cost is the price paid for every player ever transferred in
 *   bootstrap cost_change_start   a player's total price change since the season began
 *
 * A player bought during the season has his cost on record. A player from the original squad was bought
 * at the deadline of the first gameweek, so his cost is today's price minus everything it has moved
 * since. Between them that is all fifteen, with no guessing and no login.
 *
 * WHY NOT JUST ASK FOR THE SELLING PRICE. The official API does expose it, at /my-team/{id}/, and that
 * endpoint requires an authenticated session as the manager. Feeding a password to a scraper to avoid
 * arithmetic that is already derivable would be a bad trade, so this does the arithmetic.
 */

const FPL = "https://fantasy.premierleague.com/api";

/* Half of any rise, rounded down to the nearest 0.1, exactly as the game does it. A price that has
 * fallen is taken in full: there is no protection on the way down. */
export function sellingPrice(purchaseTenths, nowTenths) {
  const bought = Number(purchaseTenths);
  const now = Number(nowTenths);
  if (!Number.isFinite(bought) || !Number.isFinite(now)) return null;
  if (now <= bought) return now;
  return bought + Math.floor((now - bought) / 2);
}

/* Returns a Map of fpl_id to { purchase, now, selling }, all in tenths, for the ids given.
 *
 * `elements` is the bootstrap element list. `transfers` is the entry's transfer history. Both are passed
 * in rather than fetched here so the caller can reuse what it already has and so this stays testable
 * without a network. */
export function resolvePurchasePrices(ids, elements, transfers) {
  const byId = new Map((elements || []).map((element) => [Number(element.id), element]));

  /* The LATEST purchase wins. A player sold and bought back later cost what he cost the second time, and
     taking the first record would quietly price him at last month's value. The history is ordered oldest
     first, so a plain assignment in order leaves the most recent in place. */
  const paid = new Map();
  for (const move of transfers || []) {
    const id = Number(move?.element_in);
    const cost = Number(move?.element_in_cost);
    if (Number.isFinite(id) && Number.isFinite(cost)) paid.set(id, cost);
  }

  const resolved = new Map();
  for (const id of ids || []) {
    const element = byId.get(Number(id));
    if (!element) continue;
    const now = Number(element.now_cost);
    /* No transfer record means he has been there since the start, so what he cost is what he is worth
       now less every change since the season began. */
    const purchase = paid.has(Number(id))
      ? paid.get(Number(id))
      : now - (Number(element.cost_change_start) || 0);
    resolved.set(Number(id), {
      purchase,
      now,
      selling: sellingPrice(purchase, now),
      /* Whether this is a fact or a reconstruction, so a caller can say which rather than implying the
         same confidence in both. */
      source: paid.has(Number(id)) ? "transfer record" : "price change since the season began",
    });
  }
  return resolved;
}

export async function fetchEntryTransfers(entryId) {
  const response = await fetch(`${FPL}/entry/${entryId}/transfers/`, {
    headers: { "User-Agent": "FPLBot (personal project)" },
    cache: "no-store",
  });
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}
