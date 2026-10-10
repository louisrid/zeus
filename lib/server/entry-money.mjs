/* THE MONEY A TEAM HAS, computed from the official API: bank, selling price per owned player, free
   transfers and chips. Shared by the /api/entry-money route (serving the Builder) and the
   entry_money_pull job (which runs on GitHub's runners, because the official API refuses Vercel's
   servers from time to time, and writes the same figures into the live plan so the site has them even
   when the API is unreachable). */
import { resolvePurchasePrices, fetchEntryTransfers } from "./purchase-prices.mjs";
import { freeTransfersFrom } from "./free-transfers.mjs";

const FPL = "https://fantasy.premierleague.com/api";
const HEADERS = { "User-Agent": "FPLBot (personal project)" };

export async function computeEntryMoney(entryId = 4812) {
  const [history, bootstrap, transfers] = await Promise.all([
    fetch(`${FPL}/entry/${entryId}/history/`, { headers: HEADERS, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null)),
    fetch(`${FPL}/bootstrap-static/`, { headers: HEADERS, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null)),
    fetchEntryTransfers(entryId),
  ]);
  if (!history || !bootstrap) return null;

  const weeks = Array.isArray(history.current) ? history.current : [];
  const latest = weeks[weeks.length - 1] || null;
  const bank = latest && Number.isFinite(Number(latest.bank)) ? Number(latest.bank) / 10 : null;
  const ledger = freeTransfersFrom(weeks, history.chips);
  const gw = latest ? Number(latest.event) : null;

  let picks = [];
  let rawPicks = [];
  let activeChip = null;
  if (gw) {
    const response = await fetch(`${FPL}/entry/${entryId}/event/${gw}/picks/`, { headers: HEADERS, cache: "no-store" });
    if (response.ok) {
      const body = await response.json();
      rawPicks = Array.isArray(body?.picks) ? body.picks : [];
      picks = rawPicks.map((pick) => Number(pick.element));
      activeChip = body?.active_chip || null;
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
  const byElement = new Map(bootstrap.elements.map((e) => [Number(e.id), e]));
  const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
  const base = rawPicks.map((pick) => {
    const id = Number(pick.element); const e = byElement.get(id); const money = players[id] || {};
    return {
      fpl_id: id, position: e ? POS[e.element_type] : null, team_id: e ? Number(e.team) : null,
      price: money.now ?? (e ? e.now_cost / 10 : null), purchasePrice: money.purchase ?? (e ? e.now_cost / 10 : null),
      selling: money.selling ?? null, starting: Number(pick.position) <= 11,
      captain: Boolean(pick.is_captain), vice: Boolean(pick.is_vice_captain), order: Number(pick.position),
    };
  });

  return {
    ok: true,
    entry: entryId,
    gameweek: gw,
    bank,
    sale_value: Math.round(saleTotal) / 10,
    total: bank === null ? null : Math.round(saleTotal + bank * 10) / 10,
    free_transfers: ledger.free,
    free_transfers_gw: ledger.gw,
    chips_played: (history.chips || []).map((chip) => ({ chip: String(chip?.name || "").toLowerCase(), gw: Number(chip?.event) })),
    players,
    base,
    active_chip: activeChip,
    generated_at: new Date().toISOString(),
  };
}

/* The same shape, rebuilt from the live plan row when the official API cannot be reached. The row is
   written by the entry_money_pull job, so it carries bank and per-player selling prices. */
export function entryMoneyFromLivePlan(row) {
  if (!row || !Array.isArray(row.base) || !row.base.length) return null;
  const players = {};
  let saleTotal = 0;
  for (const b of row.base) {
    const selling = Number(b.selling ?? b.price);
    if (!Number.isFinite(selling)) continue;
    players[Number(b.fpl_id)] = { purchase: Number(b.purchasePrice ?? b.price), now: Number(b.price), selling, source: "live plan (cached)" };
    saleTotal += selling;
  }
  const bank = Number.isFinite(Number(row.bank)) ? Number(row.bank) : null;
  return {
    ok: true, cached: true, entry: row.entry_id ?? null, gameweek: null, bank,
    sale_value: Math.round(saleTotal * 10) / 10,
    total: bank === null ? null : Math.round((saleTotal + bank) * 10) / 10,
    free_transfers: Number.isFinite(Number(row.free_transfers)) ? Number(row.free_transfers) : null,
    free_transfers_gw: Number.isFinite(Number(row.free_transfers_gw)) ? Number(row.free_transfers_gw) : null,
    chips_played: Array.isArray(row.chips_played) ? row.chips_played : [],
    players, generated_at: row.updated_at || null,
  };
}
