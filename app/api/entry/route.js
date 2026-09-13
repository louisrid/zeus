import { createClient } from "@supabase/supabase-js";
import { resolvePurchasePrices, fetchEntryTransfers } from "../../../lib/server/purchase-prices.mjs";
import { freeTransfersFrom } from "../../../lib/server/free-transfers.mjs";

// Team ID connect. Writes never happen from the browser: the anon key is read-only under RLS and
// this route holds the service key. DECISIONS 8.3.
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const bad = (message, status = 400) => Response.json({ ok: false, error: message }, { status });
const FPL = "https://fantasy.premierleague.com/api";

export async function GET() {
  const db = admin();
  if (!db) return bad("Team tracking is not configured on this deployment yet.", 503);
  const { data, error } = await db.from("my_squad").select("*").order("gw", { ascending: false }).limit(20);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true, snapshots: data || [] });
}

const POSITION_BY_ELEMENT_TYPE = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

/* Turn the official picks into the same shape a saved plan uses, and write them into the live slot.
 * Returns how many players landed, or null when there is nothing to write, so the caller can say so
 * rather than reporting a success that did not happen. */
async function writeLivePlan(db, entryId, picks, snapshot, ledger) {
  const list = picks && Array.isArray(picks.picks) ? picks.picks : [];
  if (!list.length) return { written: 0, reason: "no picks yet, so there is nothing to write" };
  if (list.length !== 15) return { written: 0, reason: `the official API returned ${list.length} picks, not 15` };

  const ids = list.map((pick) => Number(pick.element));
  const { data: players, error: playersError } = await db
    .from("players").select("fpl_id, team_id, position, price").in("fpl_id", ids);
  if (playersError) return { written: 0, reason: `the player table could not be read: ${playersError.message}` };
  const byId = new Map((players || []).map((player) => [Number(player.fpl_id), player]));
  /* Say which players are missing rather than returning nothing. A silent failure here looks exactly
     like a team that has not been connected, and you would have no way to tell the two apart. */
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    return { written: 0, reason: `these players are not in the player table, so fpl-pull is behind: ${missing.join(", ")}` };
  }

  /* WHAT THEY COST, NOT WHAT THEY ARE WORTH SCALED TO FIT.
   *
   * This used to spread the difference between today's prices and a hundred million across the fifteen in
   * proportion to price, and store the result as what each player cost. It was a fiction that happened to
   * sum correctly, and everything downstream believed it: sale values, the bank, the transfer budget.
   *
   * The real figures come from the entry's own transfer history and the season's price movements, so a
   * player bought in gameweek four is priced at what was paid in gameweek four and an original pick at
   * what he cost on day one. */
  const [transfers, bootstrap] = await Promise.all([
    fetchEntryTransfers(entryId),
    fetch(`${FPL}/bootstrap-static/`, { headers: { "User-Agent": "FPLBot (personal project)" }, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null),
  ]);

  const priced = bootstrap
    ? resolvePurchasePrices(ids, bootstrap.elements, transfers)
    : new Map();

  const base = list.map((pick) => {
    const id = Number(pick.element);
    const player = byId.get(id) || {};
    const price = Number(player.price) || 0;
    const real = priced.get(id);
    return {
      fpl_id: id,
      team_id: Number(player.team_id) || null,
      position: player.position || POSITION_BY_ELEMENT_TYPE[pick.element_type] || null,
      price,
      /* Tenths on the wire, pounds here, to match every other price in the app. Falling back to today's
         price when the bootstrap is unreachable is the honest default: it makes a player look like he was
         bought at his current value, which is exactly true for most of a squad and never invents money. */
      purchasePrice: real ? Math.round(real.purchase) / 10 : price,
      sellingPrice: real ? Math.round(real.selling) / 10 : price,
      starting: Number(pick.position) <= 11,
    };
  });

  const captain = list.find((pick) => pick.is_captain);
  const vice = list.find((pick) => pick.is_vice_captain);
  const starters = base.filter((player) => player.starting);
  const shape = ["DEF", "MID", "FWD"]
    .map((position) => starters.filter((player) => player.position === position).length).join("-");

  const { error } = await db.from("plans").update({
    base,
    structure: shape,
    captain: captain ? Number(captain.element) : null,
    vice: vice ? Number(vice.element) : null,
    /* The real count, from the real history, on the row the rest of the app already reads. It used to be
       simulated from gameweek one and was wrong by one from the moment a transfer was made. */
    free_transfers: ledger ? ledger.free : null,
    free_transfers_gw: ledger ? ledger.gw : null,
    /* The bank as the official API reports it. Deriving it from the starting budget less what the squad
       cost only holds for a team that has never transferred: every move shifts money the purchase prices
       cannot account for. */
    bank: Number.isFinite(Number(snapshot?.bank)) ? Number(snapshot.bank) : null,
    chips_played: ledger && ledger.chips ? ledger.chips : null,
    updated_at: new Date().toISOString(),
  }).eq("kind", "live").eq("entry_id", entryId);
  if (error) return { written: 0, reason: `the live team slot could not be written: ${error.message}` };
  return { written: base.length, reason: null };
}

export async function POST(request) {
  const db = admin();
  if (!db) return bad("Team tracking is not configured on this deployment yet.", 503);

  let body;
  try { body = await request.json(); } catch { return bad("Malformed request."); }

  if (body.action === "disconnect") {
    const { error } = await db.from("my_squad").delete().neq("gw", -1);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true, disconnected: true });
  }

  const entryId = Number(body.entryId);
  if (!Number.isFinite(entryId) || entryId <= 0) return bad("That is not a team ID. It is the number in your team's URL on the official site.");

  // Entry summary always exists. Picks only exist once a gameweek has started, so a pre-season
  // connect stores the entry and reports that picks arrive after GW1 rather than inventing any.
  let entry;
  try {
    const r = await fetch(`${FPL}/entry/${entryId}/`, { headers: { "User-Agent": "FPLBot (personal project)" }, cache: "no-store" });
    if (r.status === 404) return bad("No team with that ID. Check the number in your team's URL.");
    if (!r.ok) return bad(`The official API returned ${r.status}. Try again shortly.`);
    entry = await r.json();
  } catch {
    return bad("Could not reach the official API.");
  }

  const gw = Number(entry.current_event) || 0;
  let picks = null;
  if (gw > 0) {
    try {
      const r = await fetch(`${FPL}/entry/${entryId}/event/${gw}/picks/`, { headers: { "User-Agent": "FPLBot (personal project)" }, cache: "no-store" });
      if (r.ok) picks = await r.json();
    } catch { /* picks stay null; the surface says so */ }
  }

  const row = {
    gw,
    entry_id: entryId,
    picks: picks || null,
    bank: entry.last_deadline_bank === null || entry.last_deadline_bank === undefined ? null : entry.last_deadline_bank / 10,
    team_value: entry.last_deadline_value === null || entry.last_deadline_value === undefined ? null : entry.last_deadline_value / 10,
    chip: picks && picks.active_chip ? picks.active_chip : null,
    captured_at: new Date().toISOString(),
  };
  /* The history is what makes the transfer count a fact rather than a simulation. A failure here is not
     worth failing the sync over: the squad still writes, and the count falls back to what it was. */
  let ledger = null;
  try {
    const response = await fetch(`${FPL}/entry/${entryId}/history/`, {
      headers: { "User-Agent": "FPLBot (personal project)" }, cache: "no-store",
    });
    if (response.ok) {
      const history = await response.json();
      ledger = freeTransfersFrom(history?.current, history?.chips);
      /* The chips come from the same call as the transfer counts, so the two can never disagree about
         which gameweek a wildcard fell in. A separate fetch for them was one more thing to go stale on
         its own. */
      ledger.chips = Array.isArray(history?.chips)
        ? history.chips.map((chip) => ({ chip: String(chip?.name || "").toLowerCase(), gw: Number(chip?.event) }))
        : [];
    }
  } catch { /* the count keeps whatever it had */ }

  const { error } = await db.from("my_squad").upsert(row, { onConflict: "gw" });
  if (error) return bad(error.message, 500);

  /* THE LIVE TEAM SLOT IS FILLED HERE, NOT LEFT EMPTY.
   *
   * The picks were being stored in my_squad and nothing ever carried them across to the live plan, so
   * the slot on the Squad page stayed empty for the whole of GW1 and every surface that reads a plan
   * had nothing to read. That was invisible before a gameweek had been played, because there were no
   * picks to carry, and became a hole the moment there were.
   *
   * Purchase price is the one thing the official picks endpoint does not give: it reports what each
   * player is worth now, not what was paid. Taking today's price as the purchase price would say the
   * bank is empty whatever has happened, so the real bank from the entry summary is used to work
   * backwards, and any difference is spread as the rise the squad has already banked. */
  const liveResult = await writeLivePlan(db, entryId, picks, row, ledger);

  return Response.json({
    ok: true,
    liveSquadWritten: liveResult.written,
    liveSquadProblem: liveResult.reason,
    entry: {
      id: entryId,
      name: entry.name,
      manager: `${entry.player_first_name || ""} ${entry.player_last_name || ""}`.trim(),
      overallRank: entry.summary_overall_rank ?? null,
      overallPoints: entry.summary_overall_points ?? null,
      gw,
      hasPicks: Boolean(picks),
      bank: row.bank,
      teamValue: row.team_value,
    },
  });
}
