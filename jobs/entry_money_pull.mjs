/* ENTRY MONEY PULL. Runs on GitHub's runners (the official API answers them; it refuses Vercel's servers
   now and then) and writes the live team into the plans table: the fifteen with today's price, purchase
   price and selling price, plus the bank, free transfers and chips. Every budget figure on the site
   reads from this when the live call fails, so the Builder never falls back to a flat 100.0. */
import { createClient } from "@supabase/supabase-js";
import { computeEntryMoney } from "../lib/server/entry-money.mjs";
import { pathToFileURL } from "url";

const ENTRY = Number(process.env.FPL_ENTRY_ID) || 4812;

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const money = await computeEntryMoney(ENTRY);
  if (!money) throw new Error("The official API could not be reached from the runner either.");
  if (!money.base.length) throw new Error("No picks came back for the latest gameweek.");

  const starters = money.base.filter((b) => b.starting);
  const count = (pos) => starters.filter((b) => b.position === pos).length;
  const structure = `${count("DEF")}-${count("MID")}-${count("FWD")}`;
  const captain = money.base.find((b) => b.captain)?.fpl_id ?? null;
  const vice = money.base.find((b) => b.vice)?.fpl_id ?? null;

  const update = {
    base: money.base.map(({ captain: _c, vice: _v, ...b }) => b),
    structure, captain, vice,
    bank: money.bank,
    free_transfers: money.free_transfers,
    free_transfers_gw: money.free_transfers_gw,
    chips_played: money.chips_played,
    updated_at: new Date().toISOString(),
  };
  const { error, count: written } = await db.from("plans").update(update, { count: "exact" }).eq("kind", "live").eq("entry_id", ENTRY);
  if (error) throw new Error(`plans: ${error.message}`);

  const snapshot = {
    gw: money.gameweek, entry_id: ENTRY, picks: money.base, bank: money.bank,
    team_value: money.sale_value, chip: money.active_chip, captured_at: new Date().toISOString(),
  };
  const { error: snapError } = await db.from("my_squad").upsert(snapshot, { onConflict: "gw" });
  if (snapError) console.warn("my_squad: " + snapError.message);

  console.log(`Entry ${ENTRY}: GW${money.gameweek}, bank ${money.bank}, sale value ${money.sale_value}, total ${money.total}; live plan rows updated: ${written ?? "?"}`);
}

/* Only runs when invoked directly, so a test can import it without starting a pull. */
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) main().catch((error) => { console.error(error.message || error); process.exit(1); });
