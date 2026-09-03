/* REIMPORT THE EXTERNAL EXPECTED POINTS.
 *
 * config/external-xpts-2026-27.mjs was a hand-generated file. Nothing in jobs/ or in any workflow
 * touched it, so it only changed when somebody regenerated it by hand and the product's projections
 * silently aged: an import dated 30 August was still being served days later while the source had moved
 * on by three players and a week of fixtures. This job is the missing half of that pipeline.
 *
 * WHAT IT GUARDS AGAINST, all of which has bitten before:
 *
 *   GK versus GKP     The export labels goalkeepers GK and the app expects GKP. Get this wrong and every
 *                     keeper becomes an unrecognised position, and a published eleven resolves to
 *                     "0 goalkeepers and 11 outfield starters".
 *   Stale identity     Club, position and price come from the official FPL bootstrap and OVERRIDE the
 *                     export, which runs a transfer or two behind and has had a player at the wrong club.
 *   Identity by name   Rows are keyed by the official element id, never by name, so two players sharing a
 *                     surname cannot contend for one row.
 *   A silent gap       gw_served_to is derived from how far the data actually reaches rather than being
 *                     typed in, and the job refuses to write a file that serves less than the one it is
 *                     replacing unless --allow-shrink is passed.
 *
 * Run:  node jobs/external_xpts_pull.mjs            write the file
 *       node jobs/external_xpts_pull.mjs --dry-run  report only, change nothing
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_URL = "https://api.fplcopilot.com/api/expected-points";
const BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const CONFIG_PATH = path.join(process.cwd(), "config", "external-xpts-2026-27.mjs");
/* tests/fpl-players.json is the reference four test files check the import against. It is a snapshot of
 * the same bootstrap this job already fetches, so leaving it to be updated by hand guaranteed the
 * scheduled run would fail: the moment the Premier League registered a player, the import grew and the
 * frozen snapshot did not, and every run since has died on "651 !== 629". They are written together. */
const SNAPSHOT_PATH = path.join(process.cwd(), "tests", "fpl-players.json");
const SEASON = "2026/27";
const TOTAL_GWS = 38;

const POSITION_BY_ELEMENT_TYPE = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
/* The export's own labels, normalised. GK is the one that matters. */
const POSITION_ALIASES = { GK: "GKP", GKP: "GKP", DEF: "DEF", MID: "MID", FWD: "FWD" };

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has("--dry-run");
const ALLOW_SHRINK = argv.has("--allow-shrink");

async function getJson(url, label) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response.json();
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

/* How far the data reaches, which is NOT the same as how far to serve. The source publishes a number for
 * all 38 gameweeks and they vary all the way to GW38, so coverage alone would open the horizon to the end
 * of the season on the first run. How far those far-off numbers deserve to be believed is a judgement,
 * and the product's own note is explicit that raising gw_served_to is the operator's knob. So this is
 * reported for the operator to act on and the stored horizon is carried forward untouched unless
 * --served=N says otherwise. */
function dataCoverage(rows, minimumPlayers = 50) {
  let served = 0;
  for (let gw = 1; gw <= TOTAL_GWS; gw += 1) {
    let withValue = 0;
    for (const row of rows) {
      if (Number(row.xpts[gw - 1]) > 0) withValue += 1;
      if (withValue >= minimumPlayers) break;
    }
    if (withValue < minimumPlayers) break;
    served = gw;
  }
  return served;
}

async function main() {
  console.log("Reimporting external xPTS");
  console.log(`  source    ${SOURCE_URL}`);
  console.log(`  bootstrap ${BOOTSTRAP_URL}`);

  const [exported, bootstrap] = await Promise.all([
    getJson(SOURCE_URL, "The projections source"),
    getJson(BOOTSTRAP_URL, "The official FPL bootstrap"),
  ]);

  const exportRows = Array.isArray(exported)
    ? exported
    : (exported?.data || exported?.players || exported?.expected_points || []);
  if (!exportRows.length) throw new Error("The projections source returned no rows.");

  const teamById = new Map((bootstrap?.teams || []).map((team) => [Number(team.id), team.short_name]));
  const official = new Map();
  for (const element of bootstrap?.elements || []) {
    official.set(Number(element.id), {
      club: teamById.get(Number(element.team)) || null,
      position: POSITION_BY_ELEMENT_TYPE[Number(element.element_type)] || null,
      price: Number(element.now_cost) / 10,
      web_name: element.web_name,
    });
  }
  console.log(`  export ${exportRows.length} rows, bootstrap ${official.size} elements`);

  const rows = [];
  const unmatched = [];
  const positionCorrections = [];
  const clubCorrections = [];

  for (const source of exportRows) {
    const fplId = Number(source.id ?? source.fpl_id);
    if (!Number.isFinite(fplId)) continue;

    const xpts = new Array(TOTAL_GWS).fill(0);
    const minutes = new Array(TOTAL_GWS).fill(0);
    for (const week of source.gameweeks || []) {
      const gw = Number(week?.gw);
      if (!Number.isInteger(gw) || gw < 1 || gw > TOTAL_GWS) continue;
      xpts[gw - 1] = Number(week?.points) || 0;
      minutes[gw - 1] = Number(week?.minutes) || 0;
    }

    const truth = official.get(fplId);
    if (!truth) unmatched.push(`${fplId} ${source.name}`);

    const exportPosition = POSITION_ALIASES[String(source.position || "").toUpperCase()] || null;
    /* The bootstrap wins on all three. The export is a projections feed, not a registry. */
    const position = truth?.position || exportPosition;
    const club = truth?.club || source.team || null;
    const price = Number.isFinite(truth?.price) ? truth.price : round1(source.price);

    if (exportPosition && position && exportPosition !== position) {
      positionCorrections.push(`${source.name}: ${source.position} -> ${position}`);
    }
    if (source.team && club && source.team !== club) {
      clubCorrections.push(`${source.name}: ${source.team} -> ${club}`);
    }

    rows.push({
      fpl_id: fplId,
      name: truth?.web_name || source.name,
      source_name: source.name,
      club,
      position,
      price,
      xpts,
      minutes,
      total: Math.round(xpts.reduce((sum, value) => sum + value, 0) * 10) / 10,
      /* Not rounded. The model reads the per-gameweek minutes series and this figure must agree with
       * minutes[0] exactly, or the two disagree about the same player's first gameweek. */
      display_minutes: minutes[0],
    });
  }

  /* EVERY OFFICIAL PLAYER GETS A ROW.
   *
   * The export lags the official list, so a player registered this week is simply absent from it. Writing
   * only the export's rows left those players with no row at all, and name resolution then failed on the
   * very signings most likely to be searched for. They are carried at zero: no projection is not the same
   * as no player, and a zero row resolves, prices and sorts correctly while saying plainly that nothing is
   * projected for him yet. */
  const projected = new Set(rows.map((row) => row.fpl_id));
  let carried = 0;
  for (const [fplId, truth] of official) {
    if (projected.has(fplId)) continue;
    rows.push({
      fpl_id: fplId,
      name: truth.web_name,
      source_name: truth.web_name,
      club: truth.club,
      position: truth.position,
      price: truth.price,
      xpts: new Array(TOTAL_GWS).fill(0),
      minutes: new Array(TOTAL_GWS).fill(0),
      total: 0,
      display_minutes: 0,
    });
    carried += 1;
  }
  if (carried) console.log(`  carried at zero   ${carried} official players absent from the export`);

  rows.sort((a, b) => a.fpl_id - b.fpl_id);

  const keepers = rows.filter((row) => row.position === "GKP").length;
  const missingPosition = rows.filter((row) => !row.position);
  const covered = dataCoverage(rows);
  /* Carried forward, never inferred. --served=N to move it, and it cannot exceed what the data covers. */
  const requested = [...argv].map((flag) => /^--served=(\d+)$/.exec(flag)).find(Boolean);

  console.log(`  rows written      ${rows.length}`);
  console.log(`  goalkeepers       ${keepers} (as GKP, never GK)`);
  console.log(`  club corrections  ${clubCorrections.length}`);
  console.log(`  position fixes    ${positionCorrections.length}`);
  console.log(`  data covers       GW1-GW${covered}`);
  if (unmatched.length) console.log(`  not in bootstrap  ${unmatched.length}: ${unmatched.slice(0, 5).join(", ")}`);

  /* Refusals, not warnings. A file that fails any of these breaks the product on deploy. */
  if (!keepers) throw new Error("No goalkeepers resolved to GKP. Refusing to write.");
  if (missingPosition.length) {
    throw new Error(`${missingPosition.length} rows have no position, e.g. ${missingPosition[0].name}. Refusing to write.`);
  }
  if (!covered) throw new Error("No gameweek is covered by enough players to serve. Refusing to write.");

  let previousServed = 0;
  let previousCount = 0;
  try {
    const current = await import(CONFIG_PATH);
    previousServed = Number(current.default?.gw_served_to) || 0;
    previousCount = Number(current.default?.player_count) || 0;
  } catch { /* first run, or the file is unreadable; either way there is nothing to compare against */ }

  const served = requested
    ? Math.min(Number(requested[1]), covered)
    : (previousServed || Math.min(covered, 8));
  console.log(`  previous          ${previousCount} players, served GW${previousServed || "none"}`);
  console.log(`  gw_served_to      ${served}${requested ? " (set by --served)" : " (carried forward)"}`);
  if (previousServed && served < previousServed && !ALLOW_SHRINK) {
    throw new Error(
      `This would serve GW${served} where the current file serves GW${previousServed}, taking projections `
      + "away from the product. Rerun with --allow-shrink if that is deliberate.",
    );
  }
  if (covered > served) {
    console.log(`  NOTE: the source now covers GW${covered}. To serve further: --served=${covered}`);
  }

  const importedAt = new Date().toISOString();
  const payload = {
    source: "FPL Copilot",
    source_url: SOURCE_URL,
    season: SEASON,
    imported_at: importedAt,
    gw_from: 1,
    gw_to: TOTAL_GWS,
    gw_served_to: served,
    player_count: rows.length,
    identity_policy: "Rows are keyed by the official FPL element id. Club, position and price come from the bootstrap and override the export.",
    minutes_policy: "Minutes are the source's own per-gameweek figures, carried for audit.",
    rows,
    duplicate_policy: "Not applicable. Rows are keyed by unique FPL element id, so no de-duplication pass is required.",
  };

  const header = `/* EXTERNAL EXPECTED POINTS, ${SEASON}.
 *
 * GENERATED FILE. Do not edit by hand: run \`node jobs/external_xpts_pull.mjs\` instead, or let the
 * scheduled workflow do it. Written ${importedAt} from ${SOURCE_URL}.
 *
 * Every row carries fpl_id, the official FPL element id, and identity is resolved by id rather than by
 * name. Club, position and price come from the FPL bootstrap and override the export, which runs a
 * transfer or two behind. Goalkeepers are stored as GKP, never the source's GK.
 *
 * TWO HORIZONS.
 *
 *   gw_to         ${TOTAL_GWS}   how far this file STORES values
 *   gw_served_to  ${served}   how far the product actually PROJECTS
 *
 * TO EXTEND THE PROJECTION, rerun the job with a further horizon:
 *
 *   node jobs/external_xpts_pull.mjs --served=38
 *
 * The horizon is carried forward between imports rather than inferred, because how far the source's
 * far-off numbers deserve to be believed is a judgement and not a measurement. Every validator reads
 * gw_served_to from this file, so no code changes when it moves.
 */
const DATA = `;

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  await writeFile(CONFIG_PATH, `${header}${JSON.stringify(payload)};\nexport default DATA;\n`, "utf8");

  let note = "A snapshot of the official player list, written alongside the projections import so the two can never drift.";
  try {
    const existing = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
    if (existing?.note) note = existing.note;
  } catch { /* first run: the default note stands */ }
  const snapshot = {
    captured: importedAt,
    note,
    teams: (bootstrap?.teams || []).map((team) => ({
      id: team.id, fpl_id: team.id, name: team.name, short_name: team.short_name,
    })),
    players: (bootstrap?.elements || []).map((element) => ({
      fpl_id: element.id,
      web_name: element.web_name,
      name: `${element.first_name} ${element.second_name}`.trim(),
      team_id: element.team,
      position: POSITION_BY_ELEMENT_TYPE[Number(element.element_type)],
    })),
  };
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${SNAPSHOT_PATH}`);
  console.log(`  ${snapshot.players.length} players, ${snapshot.teams.length} teams`);
  console.log(`\nWrote ${CONFIG_PATH}`);
  console.log(`  ${rows.length} players, serving GW1-GW${served}`);
}

// Only run when executed directly, so importing this module for its helpers starts nothing.
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((error) => {
    console.error(`\nFAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
