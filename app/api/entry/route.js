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

  return Response.json({
    ok: true,
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
