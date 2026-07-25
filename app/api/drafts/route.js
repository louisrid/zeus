import { createClient } from "@supabase/supabase-js";

// Writes never happen from the browser (02 §7): the anon key is read-only under RLS and this
// route holds the service key. No AI client is imported here and none may ever be.

export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const bad = (message, status = 400) => Response.json({ ok: false, error: message }, { status });

export async function GET() {
  const db = admin();
  if (!db) return bad("Draft saving is not configured on this deployment yet.", 503);
  const { data, error } = await db.from("squad_drafts").select("*").order("updated_at", { ascending: false }).limit(20);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true, drafts: data || [] });
}

export async function POST(request) {
  const db = admin();
  if (!db) return bad("Draft saving is not configured on this deployment yet.", 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Malformed request.");
  }

  if (body.action === "plan") {
    if (!body.id) return bad("Which draft?");
    await db.from("squad_drafts").update({ is_plan_of_record: false }).neq("id", body.id);
    const { error } = await db.from("squad_drafts")
      .update({ is_plan_of_record: true, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true });
  }

  if (body.action === "rename") {
    if (!body.id || !body.name) return bad("A draft and a name are needed.");
    const { error } = await db.from("squad_drafts")
      .update({ name: String(body.name).slice(0, 60), updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true });
  }

  // Default: save (insert or update by id)
  const squad = body.squad;
  if (!squad || !Array.isArray(squad.picks) || !squad.picks.length) return bad("There is nothing on the pitch to save.");
  const row = {
    name: String(body.name || "Untitled draft").slice(0, 60),
    mode: body.mode === "guided" ? "guided" : "free",
    squad,
    eval_cache: body.evalCache || null,
    updated_at: new Date().toISOString(),
  };
  if (body.id) {
    const { error } = await db.from("squad_drafts").update(row).eq("id", body.id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true, id: body.id });
  }
  const { data, error } = await db.from("squad_drafts").insert(row).select("id").single();
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true, id: data.id });
}

export async function DELETE(request) {
  const db = admin();
  if (!db) return bad("Draft saving is not configured on this deployment yet.", 503);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return bad("Which draft?");
  const { error } = await db.from("squad_drafts").delete().eq("id", id);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}
