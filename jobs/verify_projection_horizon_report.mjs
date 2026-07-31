import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const integer = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

export function validateProjectionHorizonReport(report, { requiredGameweeks = 8 } = {}) {
  const required = Math.max(1, integer(requiredGameweeks) ?? 8);
  const errors = [];
  const targetGameweeks = Array.isArray(report?.target_gameweeks)
    ? report.target_gameweeks.map(integer).filter((value) => value !== null)
    : [];
  const rows = Array.isArray(report?.gameweeks) ? report.gameweeks : [];
  const expectedPlayersPerGameweek = integer(report?.expected_players_per_gameweek);

  if (report?.pass !== true) errors.push("report.pass is not true");
  if (targetGameweeks.length !== required) {
    errors.push(`target gameweeks ${targetGameweeks.length}, expected ${required}`);
  }
  if (new Set(targetGameweeks).size !== targetGameweeks.length) {
    errors.push("target gameweeks contain duplicates");
  }
  if (rows.length !== required) errors.push(`gameweek summaries ${rows.length}, expected ${required}`);
  if (expectedPlayersPerGameweek === null || expectedPlayersPerGameweek <= 0) {
    errors.push("expected_players_per_gameweek is missing or invalid");
  }
  if (Array.isArray(report?.failures) && report.failures.length) {
    errors.push(`report contains ${report.failures.length} failure(s)`);
  }

  const rowByGw = new Map(rows.map((row) => [integer(row?.gw), row]));
  for (const gw of targetGameweeks) {
    const row = rowByGw.get(gw);
    if (!row) {
      errors.push(`GW${gw} summary is missing`);
      continue;
    }
    const selected = integer(row.selected_fixtures);
    const simulated = integer(row.simulated_fixtures);
    const expectedPlayers = integer(row.expected_players);
    const projectionRows = integer(row.projection_rows);
    const uniquePlayers = integer(row.unique_projected_players);
    if (selected === null || selected <= 0) errors.push(`GW${gw} has no selected fixtures`);
    if (simulated !== selected) errors.push(`GW${gw} simulated ${simulated}, selected ${selected}`);
    if (expectedPlayers === null || expectedPlayers <= 0) errors.push(`GW${gw} has no expected players`);
    if (expectedPlayersPerGameweek !== null && expectedPlayers !== expectedPlayersPerGameweek) {
      errors.push(`GW${gw} fixture coverage has ${expectedPlayers} players, expected ${expectedPlayersPerGameweek}`);
    }
    if (projectionRows !== expectedPlayers) {
      errors.push(`GW${gw} projection rows ${projectionRows}, expected players ${expectedPlayers}`);
    }
    if (uniquePlayers !== projectionRows) {
      errors.push(`GW${gw} unique players ${uniquePlayers}, projection rows ${projectionRows}`);
    }
    if ((integer(row.duplicate_player_rows) ?? 0) !== 0) errors.push(`GW${gw} has duplicate player rows`);
    if (Array.isArray(row.missing_player_ids) && row.missing_player_ids.length) errors.push(`GW${gw} has missing players`);
    if (Array.isArray(row.unexpected_player_ids) && row.unexpected_player_ids.length) errors.push(`GW${gw} has unexpected players`);
  }

  return {
    pass: errors.length === 0,
    required_gameweeks: required,
    target_gameweeks: targetGameweeks,
    expected_players_per_gameweek: expectedPlayersPerGameweek,
    errors,
  };
}

function main() {
  const path = process.argv[2] || "projection-horizon-report.json";
  const requiredGameweeks = process.argv[3] || process.env.PROJECTION_GWS || 8;
  const report = JSON.parse(readFileSync(path, "utf8"));
  const result = validateProjectionHorizonReport(report, { requiredGameweeks });
  if (!result.pass) {
    throw new Error(`Projection horizon report is invalid: ${result.errors.join("; ")}`);
  }
  console.log(`Projection horizon report verified: GW${result.target_gameweeks.join(", GW")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
