import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

const CURRENT = new Date().toISOString();
const OLD = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const projectionRow = (gw, playerId, current) => ({
  player_id: playerId,
  gw,
  model_version: current ? "engine-new" : "engine-old",
  computed_at: current ? CURRENT : OLD,
  ep_mean: 4,
  r_exp_minutes: 80,
  r_p_start: 1,
  r_p_cameo: 0,
  minutes_source: "forecast",
  rate_source: "test",
  lambda_team: 1.5,
  lambda_opponent: 1,
});

test("post-write integrity paginates, proves eight stored gameweeks and removes stale generations", async (t) => {
  process.env.SUPABASE_URL = "https://mock.supabase.test";
  process.env.SUPABASE_SERVICE_KEY = "test-key";
  const players = Array.from({ length: 50 }, (_, index) => ({
    id: index + 1,
    web_name: `Player ${index + 1}`,
    archive: false,
    team_id: (index % 20) + 1,
    position: "MID",
    price: 7,
  }));
  let projections = [];
  for (let gw = 1; gw <= 8; gw += 1) {
    for (const player of players) {
      projections.push(projectionRow(gw, player.id, true));
      projections.push(projectionRow(gw, player.id, false));
    }
  }

  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    await rm("projection-integrity-v14-report.json", { force: true });
  });

  globalThis.fetch = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const table = url.pathname.split("/").pop();
    const method = String(init.method || "GET").toUpperCase();
    const json = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (table === "players" && method === "GET") {
      const offset = Number(url.searchParams.get("offset") || 0);
      const requested = Number(url.searchParams.get("limit") || 500);
      const serverPage = Math.min(requested, 37);
      return json(players.slice(offset, offset + serverPage));
    }
    if (table !== "projections") throw new Error(`unexpected table ${table}`);

    if (method === "DELETE") {
      const gw = Number(String(url.searchParams.get("gw") || "").replace("eq.", ""));
      const computedFilter = url.searchParams.get("computed_at") || "";
      const removed = [];
      projections = projections.filter((row) => {
        if (row.gw !== gw) return true;
        let matches = false;
        if (computedFilter === "is.null") matches = row.computed_at == null;
        else if (computedFilter.startsWith("neq.")) {
          const expected = computedFilter.slice(4);
          matches = Date.parse(row.computed_at) !== Date.parse(expected);
        } else if (computedFilter.startsWith("lt.")) {
          matches = Date.parse(row.computed_at) < Date.parse(computedFilter.slice(3));
        }
        if (matches) removed.push(row);
        return !matches;
      });
      return json(removed);
    }

    const offset = Number(url.searchParams.get("offset") || 0);
    const requested = Number(url.searchParams.get("limit") || 500);
    const serverPage = Math.min(requested, 37);
    const filtered = projections.slice().sort((a, b) =>
      a.gw - b.gw
      || Date.parse(b.computed_at) - Date.parse(a.computed_at)
      || a.player_id - b.player_id
      || a.model_version.localeCompare(b.model_version));
    return json(filtered.slice(offset, offset + serverPage));
  };

  const moduleUrl = new URL(`../jobs/projection_integrity_v14.mjs?integration=${Date.now()}`, import.meta.url);
  const { cleanupStaleProjections } = await import(moduleUrl.href);
  const report = await cleanupStaleProjections({
    enforce: false,
    expectedGameweeks: [1, 2, 3, 4, 5, 6, 7, 8],
    expectedPlayersPerGameweek: 50,
    expectedComputedAt: CURRENT,
  });

  assert.equal(report.pass, true);
  assert.equal(report.gameweeks.length, 8);
  assert.equal(report.fetched_projection_rows, 800);
  assert.equal(report.deleted_rows, 400);
  assert.equal(report.structural_failures.length, 0);
  assert.equal(projections.length, 400);
  assert.ok(projections.every((row) => Date.parse(row.computed_at) === Date.parse(CURRENT)));
  assert.ok(report.gameweeks.every((row) => row.current_rows === 50 && row.expected_run_rows === 50));
});
