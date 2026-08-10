import { loadForServer } from "../../../lib/server/load.mjs";
import { resolvePlayerReferences } from "../../../lib/server/player-name-resolution.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const NULLISH = new Set(["", "none", "null", "nil", "undefined", "nan", "n/a", "na", "-", "[]"]);

function namesFrom(value) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(/[,;|\n]+/);
  const out = [];
  for (const part of parts) {
    const clean = String(part ?? "").trim();
    if (!clean || NULLISH.has(clean.toLowerCase()) || out.includes(clean)) continue;
    out.push(clean);
  }
  return out;
}

async function resolve(names) {
  if (!names.length) {
    return Response.json({
      ok: false,
      error: "Supply names, e.g. ?names=Joao Pedro,Haaland (MCI),165",
    }, { status: 400 });
  }

  const { players } = await loadForServer();

  // Resolve one at a time so a single bad name does not hide the good ones.
  const resolved = [];
  const unresolved = [];
  for (const name of names) {
    const result = resolvePlayerReferences(players, [name], { label: "player" });
    if (result.ok && result.players.length === 1) {
      resolved.push(result.players[0]);
    } else {
      unresolved.push({ requested_name: name, reason: result.errors.join(" ") });
    }
  }

  return Response.json({
    ok: unresolved.length === 0,
    requested: names.length,
    resolved_count: resolved.length,
    resolved,
    unresolved,
    // Ready to paste straight back into any squad endpoint.
    fpl_ids: resolved.map((row) => row.fpl_id),
    fpl_ids_text: resolved.map((row) => row.fpl_id).join(","),
    usage: "Pass fpl_ids_text into keep_player_names_text, locked_player_names_text "
      + "or excluded_player_names_text. Numeric IDs bypass name matching entirely.",
  }, { status: unresolved.length ? 422 : 200 });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    return await resolve(namesFrom(searchParams.get("names")));
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    return await resolve(namesFrom(body?.names ?? body?.names_text ?? ""));
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
