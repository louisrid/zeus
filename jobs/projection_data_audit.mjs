import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { projectionDataAudit } from "../lib/eight_gameweek_pipeline.mjs";
import { localProjectionFixture } from "../lib/local_projection_fixture.mjs";
import { readSupabasePages } from "../lib/paginated_read.mjs";
import { resolveLineups } from "../lib/lineups.mjs";

const localOnly = process.argv.includes("--local");
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function readTable(client, table, select = "*") {
  return readSupabasePages(({ firstPage }) => client.from(table).select(select, firstPage ? { count: "exact" } : undefined), {
    label: table,
    pageSize: 1000,
    maxRows: 100000,
  });
}

let source = "local-regression-snapshot";
let data = localProjectionFixture();
let pagination = {};
let readErrors = [];
if (!localOnly && url && key) {
  source = "supabase-read-only";
  const client = createClient(url, key, { auth: { persistSession: false } });
  const entries = await Promise.all(["teams", "players", "fixtures", "gameweeks", "projections"].map(async (table) => {
    try {
      return { table, result: await readTable(client, table) };
    } catch (error) {
      return { table, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  readErrors = entries.filter((entry) => entry.error).map(({ table, error }) => ({ table, error }));
  data = Object.fromEntries(entries.map((entry) => [entry.table, entry.result?.rows || []]));
  pagination = Object.fromEntries(entries.filter((entry) => entry.result)
    .map((entry) => [entry.table, entry.result.pagination]));
}

const lineups = JSON.parse(readFileSync(new URL("../config/lineups.json", import.meta.url), "utf8"));
const currentTeams = data.teams.filter((team) => team.archive !== true);
const currentPlayers = data.players.filter((player) => player.archive !== true);
const teamOverrides = resolveLineups(lineups.clubs, currentPlayers, currentTeams).teamOverrideByFplId;
const report = projectionDataAudit({ ...data, teamOverrides, pagination, readErrors });
const output = {
  source,
  database_mutations: 0,
  summary: {
    blocking: report.blocking.length,
    warnings: report.warnings.length,
    malformed_fixtures: report.malformed_fixtures.length,
  },
  pagination,
  read_errors: readErrors,
  ...report,
};
console.log(JSON.stringify(output, null, 2));
