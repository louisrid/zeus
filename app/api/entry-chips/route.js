/* THE CHIPS ALREADY SPENT ON THE REAL TEAM.
 *
 * A draft only knows about chips recorded inside itself, so a plan created from the live team began life
 * believing every chip was still available. The wildcard played in GW2 was nowhere in that draft, so
 * nothing was crossed out and the buttons offered a chip the game would refuse.
 *
 * The official entry history has the real answer, so it is asked. Merged with whatever the draft plans,
 * that gives the honest picture: what has genuinely been used, and what this draft intends to use.
 *
 * The FPL name for each chip differs from ours, and quietly mapping one to the other wrongly would be
 * worse than not mapping at all: an unrecognised chip is reported rather than silently dropped, because
 * a chip that vanishes reads as available.
 */

export const dynamic = "force-dynamic";

const CHIP_NAMES = {
  wildcard: "wildcard",
  bboost: "benchboost",
  "3xc": "triplecaptain",
  freehit: "freehit",
  manager: "manager",
};

export async function GET(request) {
  try {
    const entryId = new URL(request.url).searchParams.get("entry");
    if (!entryId || !/^\d+$/.test(entryId)) {
      return Response.json({ ok: false, error: "An entry id is required, e.g. ?entry=4812." }, { status: 400 });
    }

    const res = await fetch(`https://fantasy.premierleague.com/api/entry/${entryId}/history/`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json({ ok: false, error: `The official API returned ${res.status}.` }, { status: 502 });
    }
    const body = await res.json();

    const played = [];
    const unrecognised = [];
    for (const chip of body?.chips || []) {
      const key = CHIP_NAMES[String(chip?.name || "").toLowerCase()];
      if (!key) { unrecognised.push(chip?.name || null); continue; }
      played.push({ chip: key, gw: Number(chip.event), played_at: chip.time || null });
    }

    return Response.json({
      ok: true,
      entry: Number(entryId),
      played,
      unrecognised,
      note: "Chips actually played on the real team. A chip may be used once per half of the season, "
        + "so a wildcard in GW3 does not prevent one after GW19.",
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
