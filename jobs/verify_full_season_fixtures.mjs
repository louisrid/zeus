import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

let db = null;
const client = () => {
  if (!db) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
    db = createClient(url, key);
  }
  return db;
};

export async function verifyFullSeasonFixtures() {
  const { data, error } = await client().from("fixtures")
    .select("id,fpl_id,gw,home_team,away_team,kickoff_utc,season,competition,finished")
    .eq("season", "2026-27")
    .eq("competition", "PL")
    .order("gw", { ascending: true });
  if (error) throw new Error(`fixtures: ${error.message}`);
  const rows = data || [];
  const failures = [];
  const gameweeks = [...new Set(rows.map((row) => Number(row.gw)).filter(Number.isInteger))].sort((a,b)=>a-b);
  if (rows.length !== 380) failures.push(`fixture count ${rows.length}, expected 380`);
  if (gameweeks.length !== 38 || gameweeks[0] !== 1 || gameweeks.at(-1) !== 38) failures.push(`gameweek coverage ${gameweeks.join(",")}, expected GW1-GW38`);
  const ids = rows.map((row) => Number(row.fpl_id));
  if (new Set(ids).size !== rows.length) failures.push("duplicate FPL fixture IDs");
  for (const row of rows) if (!Number.isInteger(Number(row.gw)) || !row.home_team || !row.away_team || Number(row.home_team) === Number(row.away_team)) failures.push(`invalid fixture ${row.fpl_id ?? row.id}`);
  if (failures.length) throw new Error(`Full-season fixture verification failed: ${failures.join("; ")}`);
  return { fixture_count: rows.length, gameweeks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyFullSeasonFixtures()
    .then((result) => console.log(`Full-season fixtures verified: ${result.fixture_count} fixtures across GW1-GW38`))
    .catch((error) => { console.error(error.message); process.exit(1); });
}
