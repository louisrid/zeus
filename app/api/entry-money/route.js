/* THE MONEY AND THE TRANSFERS, COMPUTED LIVE.
 *
 * The sync worked these out correctly and then tried to store them on the plan row, and the plans table
 * has no column for a bank, a free-transfer count or a selling price. Supabase dropped them without
 * complaint, so the screen kept showing the old derived numbers and nothing anywhere said why.
 *
 * Storing them was the wrong instinct anyway. All three change without anything happening in this app:
 * prices move overnight, the bank moves when a transfer is made on the official site, the free-transfer
 * count moves at every deadline. Anything cached is stale by morning. They are cheap to derive and the
 * inputs are public, so this derives them on request and holds nothing.
 *
 *   bank            from the entry's own gameweek history
 *   free transfers  counted from the transfers actually made each week, with chips honoured
 *   selling prices  purchase price from the transfer record, or the season's price movement for an
 *                   original pick, then half of any rise as the game pays it
 */

import { resolvePurchasePrices, fetchEntryTransfers } from "../../../lib/server/purchase-prices.mjs";
import { freeTransfersFrom } from "../../../lib/server/free-transfers.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FPL = "https://fantasy.premierleague.com/api";
const HEADERS = { "User-Agent": "FPLBot (personal project)" };

export async function GET(request) {
  const entryId = Number(new URL(request.url).searchParams.get("entry")) || 4812;

  try {
    const [history, bootstrap, transfers] = await Promise.all([
      fetch(`${FPL}/entry/${entryId}/history/`, { headers: HEADERS, cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null)),
      fetch(`${FPL}/bootstrap-static/`, { headers: HEADERS, cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null)),
      fetchEntryTransfers(entryId),
    ]);

    if (!history || !bootstrap) {
      return Response.json({ ok: false, error: "The official API could not be reached." }, { status: 502 });
    }

    const weeks = Array.isArray(history.current) ? history.current : [];
    const latest = weeks[weeks.length - 1] || null;
    /* The bank is reported in tenths and is the figure as at that gameweek's deadline, which is the last
       moment it could have changed: nothing moves it again until a transfer is made. */
    const bank = latest && Number.isFinite(Number(latest.bank)) ? Number(latest.bank) / 10 : null;

    const ledger = freeTransfersFrom(weeks, history.chips);

    /* The current squad, so selling prices can be attached to the players actually held. */
    const gw = latest ? Number(latest.event) : null;
    let picks = [];
    if (gw) {
      const response = await fetch(`${FPL}/entry/${entryId}/event/${gw}/picks/`, { headers: HEADERS, cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        picks = Array.isArray(body?.picks) ? body.picks.map((pick) => Number(pick.element)) : [];
      }
    }

    const priced = resolvePurchasePrices(picks, bootstrap.elements, transfers);
    const players = {};
    let saleTotal = 0;
    for (const [id, row] of priced) {
      players[id] = {
        purchase: Math.round(row.purchase) / 10,
        now: Math.round(row.now) / 10,
        selling: Math.round(row.selling) / 10,
        source: row.source,
      };
      saleTotal += row.selling;
    }

    return Response.json({
      ok: true,
      entry: entryId,
      gameweek: gw,
      bank,
      sale_value: Math.round(saleTotal) / 10,
      /* What the whole team is worth if it were sold: the fifteen at their selling prices plus whatever
         is in the bank. This is the number that answers "what can I spend". */
      total: bank === null ? null : Math.round(saleTotal + bank * 10) / 10,
      free_transfers: ledger.free,
      free_transfers_gw: ledger.gw,
      chips_played: (history.chips || []).map((chip) => ({
        chip: String(chip?.name || "").toLowerCase(),
        gw: Number(chip?.event),
      })),
      players,
      generated_at: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
