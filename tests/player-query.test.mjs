import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerProjectionRows,
  filterPlayerRows,
  normalisePrice,
  normaliseSearchText,
  paginateRows,
  parsePlayerQueryParams,
  queryPlayerRows,
  selectLatestGeneration,
  sortPlayerRows,
} from "../lib/player-query.mjs";

const players = [
  { id: 1, fpl_id: 101, web_name: "Álvarez", first_name: "Julián", second_name: "Álvarez", team_id: 10, position: "FWD", price: 7.5, selected_by_percent: "12.3" },
  { id: 2, fpl_id: 102, web_name: "Beta", first_name: "Ben", second_name: "Beta", team_id: 20, position: 3, now_cost: 55, selected_by_percent: "4.0" },
  { id: 3, fpl_id: 103, web_name: "No Projection", team_id: 10, position: "DEF", price: 4.0, selected_by_percent: "0.1" },
];
const teams = [
  { id: 10, short_name: "MUN", name: "Manchester United" },
  { id: 20, short_name: "ARS", name: "Arsenal" },
];
const projections = [
  { player_id: 1, gw: 1, ep_mean: 1, r_exp_minutes: 70, r_p_start: 0.8, model_version: "old", computed_at: "2026-08-01T10:00:00Z" },
  { player_id: 1, gw: 1, ep_mean: 4, r_exp_minutes: 80, r_p_start: 0.9, model_version: "new", computed_at: "2026-08-02T10:00:00Z" },
  { player_id: 2, gw: 1, ep_mean: 4, r_exp_minutes: 90, r_p_start: 1, model_version: "new", computed_at: "2026-08-02T10:01:00Z" },
  { player_id: 1, gw: 2, ep_mean: 5, r_exp_minutes: 85, r_p_start: 0.95, model_version: "new", computed_at: "2026-08-02T10:02:00Z" },
  { player_id: 2, gw: 2, ep_mean: 3, r_exp_minutes: 60, r_p_start: 0.6, model_version: "new", computed_at: "2026-08-02T10:03:00Z" },
];

test("latest generation selection excludes old rows and deduplicates players", () => {
  const selected = selectLatestGeneration(projections.filter((row) => row.gw === 1));
  assert.equal(selected.rows.length, 2);
  assert.equal(selected.rows.find((row) => row.player_id === 1).ep_mean, 4);
  assert.equal(selected.staleRows.some((row) => row.model_version === "old"), true);
});

test("normalisation handles FPL tenths, ownership and accents", () => {
  assert.equal(normalisePrice(players[1]), 5.5);
  assert.equal(normaliseSearchText("Julián Álvarez"), "julian alvarez");
});

test("the shared builder keeps every active player and calculates the exact GW range", () => {
  const built = buildPlayerProjectionRows({
    playerRows: players,
    teamRows: teams,
    projectionRows: projections,
    gwFrom: 1,
    gwTo: 2,
    includeBreakdown: true,
  });
  assert.equal(built.rows.length, 3, "a player with no projection must not be silently dropped");
  const alvarez = built.rows.find((row) => row.player_id === 1);
  assert.equal(alvarez.total_xpts, 9);
  assert.equal(alvarez.expected_minutes_total, 165);
  assert.equal(alvarez.gameweeks["1"].xpts, 4);
  assert.equal(alvarez.gameweeks["2"].xpts, 5);
  const missing = built.rows.find((row) => row.player_id === 3);
  assert.equal(missing.total_xpts, null);
  assert.equal(missing.missing_gameweeks, 2);
});

test("club, position, name, price and ownership filters all use the same shared function", () => {
  const built = buildPlayerProjectionRows({ playerRows: players, teamRows: teams, projectionRows: projections, gwFrom: 1, gwTo: 2 });
  const filtered = filterPlayerRows(built.rows, {
    clubs: ["MUN"],
    positions: ["FWD"],
    name: "alvarez",
    priceMax: 8,
    ownershipMin: 10,
  });
  assert.deepEqual(filtered.map((row) => row.player_id), [1]);
});

test("sorting is reproducible with name, club and player id tie-breaks", () => {
  const rows = [
    { player_id: 2, name: "Zulu", club: "MUN", total_xpts: 4 },
    { player_id: 1, name: "Alpha", club: "ARS", total_xpts: 4 },
    { player_id: 3, name: "Low", club: "ARS", total_xpts: 2 },
  ];
  assert.deepEqual(sortPlayerRows(rows, { sortBy: "xpts", sortDirection: "desc" }).map((row) => row.player_id), [1, 2, 3]);
});

test("pagination never truncates silently", () => {
  const page = paginateRows([1, 2, 3], { limit: 2, offset: 0 });
  assert.equal(page.complete, false);
  assert.equal(page.truncated, true);
  assert.equal(page.matchedCount, 3);
  assert.equal(page.returnedCount, 2);
  assert.equal(page.nextOffset, 2);
});

test("the complete query reports generation metadata and matched versus returned", () => {
  const result = queryPlayerRows(
    { playerRows: players, teamRows: teams, projectionRows: projections },
    parsePlayerQueryParams(new URLSearchParams("gw_from=1&gw_to=2&sort_by=xpts&limit=2&include_breakdown=true")),
  );
  assert.equal(result.matched_count, 3);
  assert.equal(result.returned_count, 2);
  assert.equal(result.truncated, true);
  assert.ok(result.generation_id);
  assert.equal(result.model_version, "new");
  assert.ok(result.timestamp);
  assert.match(result.tie_break, /player name ascending/);
});

test("top N per club is applied independently after filters and before pagination", () => {
  const result = queryPlayerRows(
    { playerRows: players, teamRows: teams, projectionRows: projections },
    parsePlayerQueryParams(new URLSearchParams("gw_from=1&gw_to=2&top_n_per_club=1&sort_by=xpts&limit=10")),
  );
  assert.equal(result.matched_count_before_top_n, 3);
  assert.equal(result.matched_count, 2);
  assert.deepEqual(result.players.map((row) => row.club), ["ARS", "MUN"]);
});
