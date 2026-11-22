/* YOUR REAL TEAM IN A PAST GAMEWEEK. The official picks for one finished gameweek: who was in the fifteen,
   the order (1-11 started), captain, vice and any chip. Squad uses it when My team is viewed in an earlier
   gameweek, so going back shows what you actually fielded, Free Hit included. Read-only; cached an hour,
   since a finished week does not change. */
export const dynamic = "force-dynamic";
const FPL = "https://fantasy.premierleague.com/api";
const ENTRY_ID = 4812;
const cache = new Map();

export async function GET(request) {
  const gw = Number(new URL(request.url).searchParams.get("gw"));
  if (!Number.isInteger(gw) || gw < 1 || gw > 38) {
    return Response.json({ ok: false, error: "Give a gameweek from 1 to 38." }, { status: 400 });
  }
  const hit = cache.get(gw);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return Response.json(hit.body);
  try {
    const response = await fetch(`${FPL}/entry/${ENTRY_ID}/event/${gw}/picks/`, {
      headers: { "User-Agent": "FPLBot (personal project)" }, cache: "no-store",
    });
    if (!response.ok) {
      return Response.json({ ok: false, error: `The official site returned ${response.status} for GW${gw}.` }, { status: 502 });
    }
    const data = await response.json();
    const body = {
      ok: true,
      gameweek: gw,
      active_chip: data?.active_chip || null,
      points: Number(data?.entry_history?.points ?? NaN),
      transfer_cost: Number(data?.entry_history?.event_transfers_cost ?? 0),
      picks: (data?.picks || []).map((pick) => ({
        fpl_id: Number(pick.element),
        order: Number(pick.position),
        multiplier: Number(pick.multiplier),
        captain: Boolean(pick.is_captain),
        vice: Boolean(pick.is_vice_captain),
      })),
    };
    cache.set(gw, { at: Date.now(), body });
    return Response.json(body);
  } catch {
    return Response.json({ ok: false, error: "The official site could not be reached." }, { status: 502 });
  }
}
