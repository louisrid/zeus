/* THE MONEY AND THE TRANSFERS, COMPUTED LIVE.
 *
 * The sync worked these out correctly and then tried to store them on the plan row, and the plans table
 * has no column for a bank, a free-transfer count or a selling price. Supabase dropped them without
 * complaint, so the screen kept showing the old derived numbers and nothing anywhere said why.
 *
 * Storing them was the wrong instinct anyway. All three change without anything happening in this app:
 * prices move overnight, the bank moves when a transfer is made on the official site, the free-transfer
 * count moves at every deadline. Anything cached is stale by morning. They are cheap to derive and the
 * inputs are public, so this derives them on request and holds nothing.
 *
 *   bank            from the entry's own gameweek history
 *   free transfers  counted from the transfers actually made each week, with chips honoured
 *   selling prices  purchase price from the transfer record, or the season's price movement for an
 *                   original pick, then half of any rise as the game pays it
 */

import { createClient } from "@supabase/supabase-js";
import { computeEntryMoney, entryMoneyFromLivePlan } from "../../../lib/server/entry-money.mjs";

const admin = () => ((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  : null);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FPL = "https://fantasy.premierleague.com/api";
const HEADERS = { "User-Agent": "FPLBot (personal project)" };

export async function GET(request) {
  const entryId = Number(new URL(request.url).searchParams.get("entry")) || 4812;
  try {
    const live = await computeEntryMoney(entryId);
    if (live) return Response.json(live, { headers: { "cache-control": "no-store" } });
  } catch { /* fall through to the cached copy */ }

  /* THE OFFICIAL API REFUSES VERCEL NOW AND THEN. The entry_money_pull job runs on GitHub's runners,
     which it does answer, and writes the figures into the live plan; serve those rather than a 502
     that drops every budget on the site to a flat 100.0. */
  try {
    const db = admin();
    if (db) {
      const { data } = await db.from("plans").select("*").eq("kind", "live").eq("entry_id", entryId).limit(1).maybeSingle();
      const cached = entryMoneyFromLivePlan(data);
      if (cached) return Response.json(cached, { headers: { "cache-control": "no-store" } });
    }
  } catch { /* nothing cached either */ }
  return Response.json({ ok: false, error: "The official API could not be reached." }, { status: 502 });
}
