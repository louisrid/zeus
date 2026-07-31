import test from "node:test";
import assert from "node:assert/strict";
import { archiveFixtureUpsert, auditFixtureRows, normaliseFixtureRow } from "../lib/fixture_rows.mjs";
import {
  generateProjectionGeneration,
  persistProjectionGeneration,
  projectionDataAudit,
  validateProjectionGeneration,
} from "../lib/eight_gameweek_pipeline.mjs";
import { coherentProjectionGeneration } from "../lib/projection_generation.mjs";
import { collectAllPages } from "../lib/paginated_read.mjs";
import { localProjectionFixture } from "../lib/local_projection_fixture.mjs";

const localProjector = (data) => ({ fixture }) => {
  const teams = new Set([fixture.home_team, fixture.away_team]);
  return data.players.filter((player) => teams.has(player.team_id)).map((player) => ({
    player_id: player.id,
    ep_mean: 3,
  }));
};

test("fixture 1000005 is visible but cannot abort the current eight-gameweek generation", async () => {
  const data = localProjectionFixture();
  const generation = await generateProjectionGeneration({
    ...data,
    computedAt: "2026-07-31T12:00:00.000Z",
    projectFixture: localProjector(data),
  });
  assert.equal(generation.targetGws.length, 8);
  assert.equal(generation.fixtures.length, 80);
  assert.equal(generation.validation.pass, true);
  assert.ok(generation.fixtureAudit.warnings.some((issue) =>
    issue.fixture_id === 1000005 && issue.kind === "invalid_away_team"));
});

test("a malformed upcoming fixture blocks generation and no selected fixture is silently skipped", async () => {
  const data = localProjectionFixture();
  data.fixtures.find((fixture) => fixture.id === 1).away_team = null;
  await assert.rejects(
    generateProjectionGeneration({ ...data, projectFixture: localProjector(data) }),
    (error) => error.issues?.some((issue) => issue.kind === "invalid_away_team" && issue.fixture_id === 1),
  );

  const valid = localProjectionFixture();
  await assert.rejects(
    generateProjectionGeneration({
      ...valid,
      projectFixture: ({ fixture }) => fixture.id === 25 ? [] : localProjector(valid)({ fixture }),
    }),
    (error) => error.report?.failures.some((failure) => failure.kind === "missing_players"),
  );
});

test("null gameweeks remain null and are never coerced to GW0", () => {
  const normalised = normaliseFixtureRow({ id: 9, fpl_id: 9, gw: null, home_team: 1, away_team: 2, finished: false, season: "2026-27" });
  assert.equal(normalised.gw, null);
  const audit = auditFixtureRows([normalised], [{ id: 1 }, { id: 2 }]);
  assert.ok(audit.blocking.some((issue) => issue.kind === "invalid_gameweek" && issue.value === null));
  assert.ok(!audit.issues.some((issue) => issue.value === 0));
});

test("archive importer repairs an existing incomplete fixture instead of skipping it", () => {
  const repair = archiveFixtureUpsert(
    { id: 44, fpl_id: 1000005, gw: 1, home_team: 10, away_team: null, finished: true, season: "2025-26" },
    { fpl_id: 1000005, gw: 1, home_team: 10, away_team: 11, finished: true, season: "2025-26", competition: "PL" },
  );
  assert.equal(repair.action, "repair");
  assert.equal(repair.row.away_team, 11);
});

test("generation covers GW1-GW8, every fixture, every club and every active player with one timestamp", async () => {
  const data = localProjectionFixture();
  const generation = await generateProjectionGeneration({
    ...data,
    computedAt: "2026-07-31T12:00:00.000Z",
    projectFixture: localProjector(data),
  });
  assert.deepEqual(generation.targetGws, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(generation.rows.length, data.players.length * 8);
  assert.equal(new Set(generation.rows.map((row) => row.computed_at)).size, 1);
  assert.equal(new Set(generation.rows.map((row) => row.model_version)).size, 1);
  for (const gw of generation.validation.gameweeks) {
    assert.equal(gw.fixtures, 10);
    assert.equal(gw.simulated_fixtures, 10);
    assert.equal(gw.participating_clubs, 20);
    assert.equal(gw.expected_players, data.players.length);
    assert.equal(gw.actual_players, data.players.length);
  }
});

test("full pagination continues after short server-capped pages and verifies the exact count", async () => {
  const pages = new Map([[0, [{ id: 1 }, { id: 2 }]], [2, [{ id: 3 }, { id: 4 }]], [4, [{ id: 5 }]], [5, []]]);
  const offsets = [];
  const result = await collectAllPages(async (offset) => {
    offsets.push(offset);
    return { data: pages.get(offset), error: null, count: offset === 0 ? 5 : null };
  }, { pageSize: 1000, label: "test rows" });
  assert.deepEqual(result.rows.map((row) => row.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(offsets, [0, 2, 4, 5]);
  assert.equal(result.pagination.server_cap_observed, true);
  await assert.rejects(
    collectAllPages(async () => ({ data: [], count: 2 }), { label: "truncated" }),
    /pagination truncation detected/,
  );
});

test("loader rejects mixed/partial generations and retains the newest complete exact generation", () => {
  const expectedGameweeks = [1, 2, 3, 4, 5, 6, 7, 8];
  const expected = new Map(expectedGameweeks.map((gw) => [gw, new Set([1, 2])]));
  const rows = [];
  for (const gw of expectedGameweeks) {
    for (const player_id of [1, 2]) rows.push({ player_id, gw, model_version: "complete", computed_at: "2026-07-31T10:00:00.000Z" });
  }
  rows.push({ player_id: 1, gw: 1, model_version: "partial", computed_at: "2026-07-31T11:00:00.000Z" });
  rows.push({ player_id: 2, gw: 1, model_version: "partial", computed_at: "2026-07-31T11:00:01.000Z" });
  const selected = coherentProjectionGeneration(rows, { expectedGameweeks, expectedPlayerIdsByGameweek: expected });
  assert.equal(selected.modelVersion, "complete");
  assert.equal(selected.rows.length, 16);
  assert.equal(selected.staleRows.length, 2);
});

test("read-back accepts equivalent PostgreSQL timestamptz formatting", () => {
  const data = localProjectionFixture();
  const expectedTimestamp = "2026-07-31T12:00:00.000Z";
  const storedTimestamp = "2026-07-31T12:00:00+00:00";
  const fixtures = data.fixtures.filter((fixture) => fixture.finished !== true);
  const rows = data.players.flatMap((player) =>
    Array.from({ length: 8 }, (_, index) => ({
      player_id: player.id,
      gw: index + 1,
      computed_at: storedTimestamp,
      model_version: "v",
    }))
  );
  const result = validateProjectionGeneration({
    targetGws: [1, 2, 3, 4, 5, 6, 7, 8],
    fixtures,
    players: data.players,
    rows,
    simulatedFixtureIds: new Set(fixtures.map((fixture) => fixture.id)),
    computedAt: expectedTimestamp,
    modelVersion: "v",
  });
  assert.equal(result.pass, true);
});

test("partial read-back rejects cleanup; complete read-back permits cleanup only after all writes", async () => {
  const data = localProjectionFixture();
  const generation = await generateProjectionGeneration({ ...data, projectFixture: localProjector(data) });
  const failedEvents = [];
  await assert.rejects(persistProjectionGeneration(generation, {
    writeGameweek: async (gw) => failedEvents.push(`write:${gw}`),
    readBack: async () => generation.rows.slice(1),
    cleanupStale: async () => failedEvents.push("cleanup"),
  }), /stale cleanup was not run/);
  assert.equal(failedEvents.includes("cleanup"), false);
  assert.equal(failedEvents.filter((event) => event.startsWith("write:")).length, 8);

  const events = [];
  const result = await persistProjectionGeneration(generation, {
    writeGameweek: async (gw) => events.push(`write:${gw}`),
    readBack: async () => { events.push("read-back"); return generation.rows; },
    cleanupStale: async () => events.push("cleanup"),
  });
  assert.equal(result.readBack.pass, true);
  assert.equal(events.at(-2), "read-back");
  assert.equal(events.at(-1), "cleanup");
  assert.deepEqual(events.slice(0, 8), ["write:8", "write:7", "write:6", "write:5", "write:4", "write:3", "write:2", "write:1"]);
});

test("read-only audit reports every relevant issue together, including pagination truncation", () => {
  const data = localProjectionFixture();
  const projections = [
    { player_id: 1, gw: 1, computed_at: "2026-07-01T00:00:00.000Z" },
    { player_id: 1, gw: 1, computed_at: "2026-07-02T00:00:00.000Z" },
  ];
  const report = projectionDataAudit({
    ...data,
    players: [...data.players, { id: 9999, fpl_id: 9999, team_id: 99, archive: false }],
    projections,
    teamOverrides: new Map([[1, 2]]),
    pagination: { projections: { truncated: true, expected_count: 9, rows_read: 2 } },
    readErrors: [{ table: "fixtures", error: "fixtures: network unavailable" }],
  });
  const kinds = new Set(report.issues.map((issue) => issue.kind));
  for (const expectedKind of [
    "invalid_away_team",
    "malformed_finished_historical_fixture",
    "missing_current_team",
    "transferred_player_team_mismatch",
    "duplicate_player_gameweek_projection",
    "mixed_computed_at_timestamps",
    "supabase_pagination_truncation",
    "supabase_read_error",
    "stale_generation",
  ]) assert.ok(kinds.has(expectedKind), expectedKind);
});

test("structural validation rejects duplicate and unexpected player rows", () => {
  const data = localProjectionFixture();
  const timestamp = "2026-07-31T12:00:00.000Z";
  const rows = data.players.flatMap((player) => Array.from({ length: 8 }, (_, index) => ({
    player_id: player.id, gw: index + 1, computed_at: timestamp, model_version: "v",
  })));
  rows.push({ ...rows[0] });
  rows.push({ player_id: 99999, gw: 1, computed_at: timestamp, model_version: "v" });
  const fixtures = data.fixtures.filter((fixture) => fixture.finished !== true);
  const result = validateProjectionGeneration({
    targetGws: [1, 2, 3, 4, 5, 6, 7, 8], fixtures, players: data.players, rows,
    simulatedFixtureIds: new Set(fixtures.map((fixture) => fixture.id)), computedAt: timestamp, modelVersion: "v",
  });
  const kinds = new Set(result.failures.map((failure) => failure.kind));
  assert.ok(kinds.has("duplicate_player_gameweek"));
  assert.ok(kinds.has("unexpected_players"));
});
