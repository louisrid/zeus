import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const integer = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const uniqueSortedIntegers = (values = []) => [...new Set(
  values.map(integer).filter((value) => value !== null),
)].sort((a, b) => a - b);

const sameInstant = (left, right) => {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
};

/**
 * Validate the projection rows that Supabase returned after the upsert completed.
 *
 * The local projection batch can be complete while the persisted database generation is not. This
 * separate post-write gate makes that failure visible and blocking even when football-quality checks
 * are running in diagnostic mode.
 */
export function validateStoredProjectionHorizon(report = {}, { requiredGameweeks = 38 } = {}) {
  const required = Math.max(1, integer(requiredGameweeks) ?? 38);
  const expectedGameweeks = uniqueSortedIntegers(report.expected_gameweeks || []);
  const expectedPlayers = integer(report.expected_players_per_gameweek);
  const expectedComputedAt = report.expected_computed_at || null;
  const gameweeks = Array.isArray(report.gameweeks) ? report.gameweeks : [];
  const byGw = new Map(gameweeks.map((row) => [integer(row?.gw), row]));
  const errors = [];

  if (expectedGameweeks.length !== required) {
    errors.push(`expected gameweeks ${expectedGameweeks.length}, required ${required}`);
  }
  if (expectedPlayers === null || expectedPlayers <= 0) {
    errors.push("expected_players_per_gameweek is missing or invalid");
  }
  if (report.pass !== true) errors.push("projection integrity report did not pass");
  if (!expectedComputedAt || !Number.isFinite(Date.parse(expectedComputedAt))) {
    errors.push("expected_computed_at is missing or invalid");
  }

  const structuralFailures = Array.isArray(report.structural_failures) ? report.structural_failures : [];
  const blockingFailures = Array.isArray(report.blocking_failures) ? report.blocking_failures : [];
  if (structuralFailures.length) errors.push(`integrity report contains ${structuralFailures.length} structural failure(s)`);
  if (blockingFailures.length) errors.push(`integrity report contains ${blockingFailures.length} blocking failure(s)`);

  let storedRows = 0;
  let currentRowsAcrossGameweeks = 0;
  const storedGameweeks = [];
  for (const gw of expectedGameweeks) {
    const row = byGw.get(gw);
    if (!row) {
      errors.push(`GW${gw} is missing from the stored generation`);
      continue;
    }
    const currentRows = integer(row.current_rows);
    storedGameweeks.push(gw);
    if (currentRows === null) {
      errors.push(`GW${gw} has an invalid stored row count`);
      continue;
    }
    currentRowsAcrossGameweeks += currentRows;
    if (expectedPlayers !== null && currentRows !== expectedPlayers) {
      errors.push(`GW${gw} stored ${currentRows} current rows, expected ${expectedPlayers}`);
    }
    if (expectedComputedAt && !sameInstant(row.run_finished_at, expectedComputedAt)) {
      errors.push(`GW${gw} belongs to a different projection run`);
    }
    const exactRunRows = integer(row.expected_run_rows);
    if (expectedComputedAt && exactRunRows === null) {
      errors.push(`GW${gw} is missing its exact-run row count`);
    } else if (expectedPlayers !== null && exactRunRows !== expectedPlayers) {
      errors.push(`GW${gw} stored ${exactRunRows} rows from the requested run, expected ${expectedPlayers}`);
    }
    storedRows += exactRunRows ?? 0;
  }

  const expectedRows = expectedPlayers === null ? null : expectedPlayers * expectedGameweeks.length;
  if (expectedRows !== null && storedRows !== expectedRows) {
    errors.push(`stored rows ${storedRows}, expected ${expectedRows}`);
  }

  return {
    pass: errors.length === 0,
    required_gameweeks: required,
    expected_gameweeks: expectedGameweeks,
    expected_players_per_gameweek: expectedPlayers,
    expected_computed_at: expectedComputedAt,
    expected_rows: expectedRows,
    stored_gameweeks: storedGameweeks,
    current_rows_across_gameweeks: currentRowsAcrossGameweeks,
    stored_rows: storedRows,
    errors,
  };
}

function main() {
  const inputPath = process.argv[2] || "projection-integrity-v14-report.json";
  const outputPath = process.argv[3] || "stored-projection-horizon-report.json";
  const requiredGameweeks = process.argv[4] || process.env.PROJECTION_GWS || 38;
  const report = JSON.parse(readFileSync(inputPath, "utf8"));
  const result = validateStoredProjectionHorizon(report, { requiredGameweeks });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) {
    throw new Error(`Stored projection horizon is invalid: ${result.errors.join("; ")}`);
  }
  console.log(
    `Stored projection horizon verified: GW${result.expected_gameweeks.join(", GW")} · `
    + `${result.stored_rows}/${result.expected_rows} rows`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
