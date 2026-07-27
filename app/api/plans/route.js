import { createClient } from "@supabase/supabase-js";

/* PLANS. A plan is a base fifteen plus a per-gameweek transfer list. Writes never happen from the
   browser: the anon key is read-only under RLS and this route holds the service key. No AI client is
   imported here and none may ever be. */

export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const bad = (message, status = 400) => Response.json({ ok: false, error: message }, { status });
const MISSING = "The plans table is missing. Run supabase/migration-021.sql once.";

export async function GET() {
  const db = admin();
  if (!db) return bad("Plan saving is not configured on this deployment yet.", 503);
  const { data, error } = await db.from("plans").select("*").order("updated_at", { ascending: false }).limit(40);
  if (error) return bad(/relation .* does not exist/.test(error.message) ? MISSING : error.message, 500);

  // The live slot is always first, whether or not it holds players yet.
  const rows = data || [];
  const live = rows.filter((r) => r.kind === "live");
  const plans = rows.filter((r) => r.kind !== "live");
  return Response.json({ ok: true, live: live[0] || null, plans });
}

export async function POST(request) {
  const db = admin();
  if (!db) return bad("Plan saving is not configured on this deployment yet.", 503);
  let body;
  try { body = await request.json(); } catch { return bad("Bad request body."); }

  const action = body.action || "save";

  if (action === "activate") {
    if (!body.id) return bad("An id is required.");
    // One active plan at a time, enforced by a unique index as well as here.
    await db.from("plans").update({ is_active: false }).neq("id", body.id);
    const { error } = await db.from("plans").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    if (!body.id) return bad("An id is required.");
    const { data: row } = await db.from("plans").select("kind").eq("id", body.id).single();
    if (row && row.kind === "live") return bad("The live team slot is permanent and cannot be deleted.");
    const { error } = await db.from("plans").delete().eq("id", body.id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true });
  }

  if (action === "rename") {
    if (!body.id || !body.name) return bad("An id and a name are required.");
    const { error } = await db.from("plans").update({ name: body.name, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true });
  }

  // save: create or update. The base fifteen and the weeks map are both stored whole.
  const row = {
    name: body.name || "Untitled plan",
    structure: body.structure || "3-5-2",
    captain: body.captain ?? null,
    vice: body.vice ?? null,
    base: body.base || [],
    weeks: body.weeks || {},
    ignores: body.ignores || [],
    maybe_ids: body.maybeIds || [],
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    const { error } = await db.from("plans").update(row).eq("id", body.id);
    if (error) return bad(/relation .* does not exist/.test(error.message) ? MISSING : error.message, 500);
    return Response.json({ ok: true, id: body.id });
  }
  const { data, error } = await db.from("plans").insert(row).select("id").single();
  if (error) return bad(/relation .* does not exist/.test(error.message) ? MISSING : error.message, 500);
  return Response.json({ ok: true, id: data.id });
}
