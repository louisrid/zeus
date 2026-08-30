import { createClient } from "@supabase/supabase-js";

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
async function writeLivePlan(db, entryId, picks, snapshot) {
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

  const valueNow = list.reduce((total, pick) => total + Number((byId.get(Number(pick.element)) || {}).price || 0), 0);
  /* What the fifteen cost is the starting budget less the bank the official API reports. The gap
     between that and what they are worth today is the rise, shared out in proportion to price so no
     single player is credited with all of it. */
  const bank = Number(snapshot.bank);
  const paidTotal = Number.isFinite(bank) ? Math.max(0, 100 - bank) : valueNow;
  const scale = valueNow > 0 ? paidTotal / valueNow : 1;

  const base = list.map((pick) => {
    const player = byId.get(Number(pick.element)) || {};
    const price = Number(player.price) || 0;
    return {
      fpl_id: Number(pick.element),
      team_id: Number(player.team_id) || null,
      position: player.position || POSITION_BY_ELEMENT_TYPE[pick.element_type] || null,
      price,
      purchasePrice: Math.round(price * scale * 10) / 10,
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
  const liveResult = await writeLivePlan(db, entryId, picks, row);

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
