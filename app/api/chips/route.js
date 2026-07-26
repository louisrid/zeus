import { createClient } from "@supabase/supabase-js";

// Chip plan. DECISIONS 8.4. Skeleton plans are freely editable; a committed plan is a record of
// intent, not a lock, and playing a chip is recorded rather than inferred.
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const bad = (message, status = 400) => Response.json({ ok: false, error: message }, { status });

const CHIPS = ["wildcard", "bench_boost", "triple_captain", "free_hit"];
const STATUS = ["skeleton", "committed", "played", "expired"];

export async function GET() {
  const db = admin();
  if (!db) return bad("Chip planning is not configured on this deployment yet.", 503);
  const { data, error } = await db.from("chip_plan").select("*").order("chip_set").order("planned_gw");
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true, plan: data || [] });
}

export async function POST(request) {
  const db = admin();
  if (!db) return bad("Chip planning is not configured on this deployment yet.", 503);

  let body;
  try { body = await request.json(); } catch { return bad("Malformed request."); }

  const chipSet = Number(body.chipSet);
  if (![1, 2].includes(chipSet)) return bad("Which half of the season? 1 or 2.");
  if (!CHIPS.includes(body.chip)) return bad("Unknown chip.");
  const status = STATUS.includes(body.status) ? body.status : "skeleton";
  const plannedGw = body.plannedGw === null || body.plannedGw === undefined ? null : Number(body.plannedGw);
  if (plannedGw !== null && (!Number.isInteger(plannedGw) || plannedGw < 1 || plannedGw > 38)) return bad("A gameweek between 1 and 38.");

  // One row per chip per half. Clearing the gameweek removes the plan rather than storing a null.
  const { data: existing } = await db.from("chip_plan").select("id").eq("chip_set", chipSet).eq("chip", body.chip).limit(1);
  const id = existing && existing[0] ? existing[0].id : null;

  if (plannedGw === null) {
    if (id) {
      const { error } = await db.from("chip_plan").delete().eq("id", id);
      if (error) return bad(error.message, 500);
    }
    return Response.json({ ok: true, cleared: true });
  }

  const row = { chip_set: chipSet, chip: body.chip, planned_gw: plannedGw, status, updated_at: new Date().toISOString() };
  if (id) {
    const { error } = await db.from("chip_plan").update(row).eq("id", id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true, id });
  }
  const { data, error } = await db.from("chip_plan").insert(row).select("id").single();
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true, id: data.id });
}
