import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildSystemHealth } from "../lib/server/system_health.mjs";

test("system health requires a complete OpenWeb-compatible live brief", () => {
  const brief = {
    ok: true,
    gw: 1,
    projection_count: 564,
    latest_projection_run: "2026-07-30T20:07:52.396Z",
    model_version: "engine-interim-3+2026.27.0-prelaunch",
    stale_rows_excluded: 0,
    warnings: [],
    players: [{
      name: "Haaland", team: "MCI", position: "FWD", xpts: 6.66,
      expected_minutes: 86.3, start_probability: 1,
    }],
  };
  const health = buildSystemHealth({
    brief,
    deploymentCommit: "abc123",
    deploymentEnvironment: "production",
    openwebAuthRequired: true,
  });
  assert.equal(health.ok, true);
  assert.equal(health.projection_count, 564);
  assert.equal(health.openweb_brief_ready, true);
  assert.equal(health.openweb_auth_required, true);
  assert.equal(health.top_player.name, "Haaland");
});

test("system health fails incomplete or malformed player output", () => {
  const health = buildSystemHealth({
    brief: {
      ok: true,
      gw: 1,
      projection_count: 200,
      players: [{ name: "Incomplete" }],
    },
  });
  assert.equal(health.ok, false);
  assert.equal(health.players_page_data_ready, false);
  assert.ok(health.field_failures > 0);
});

test("the brief route preserves text GET and exposes explicit JSON GET, POST and OPTIONS", () => {
  const source = readFileSync("app/api/brief/route.js", "utf8");
  assert.ok(source.includes("wantsJsonBrief"));
  assert.ok(source.includes('format === "json"'));
  assert.ok(source.includes('accept.includes("application/json")'));
  assert.ok(source.includes("export const POST = stableFplBriefPost"));
  assert.ok(source.includes("export const OPTIONS = stableFplBriefOptions"));
  assert.ok(source.includes("legacyFplBriefGet"));
});

test("the permanent release workflow is manual-only and covers cleanup, tests, build, gate and live checks", () => {
  const path = ".github/workflows/zeus-release-check-v3.yml";
  assert.ok(existsSync(path));
  const source = readFileSync(path, "utf8");
  assert.ok(source.includes("workflow_dispatch"));
  assert.ok(!/^\s*push:/m.test(source));
  assert.ok(!/^\s*schedule:/m.test(source));
  assert.ok(source.includes("npm test"));
  assert.ok(source.includes("npm run build"));
  assert.ok(source.includes("xpts_release_gate.mjs"));
  assert.ok(source.includes("verify_live_system.mjs"));
  assert.ok(source.includes("repository-cleanup-paths.txt"));
  assert.ok(source.includes("Verify the staged cleanup before committing"));
});

test("cleanup manifest includes every obsolete repair workflow and duplicate installer folder", () => {
  const paths = readFileSync("config/repository-cleanup-paths.txt", "utf8")
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  for (const required of [
    ".github/workflows/apply-zeus-deep-repair-v11.yml",
    ".github/workflows/apply-zeus-verified-repair-v12.yml",
    ".github/workflows/apply-zeus-complete-repair-v13.yml",
    ".github/workflows/apply-zeus-final-repair-v14.yml",
    ".github/workflows/finish-zeus-repair-v15.yml",
    ".github/workflows/fix-upload.yml",
    "workflows-to-add",
  ]) assert.ok(paths.includes(required), required);
});


test("health and OpenWeb APIs use the active gameweek and exclude archive rows", () => {
  const health = readFileSync("app/api/health/route.js", "utf8");
  const brief = readFileSync("lib/server/fpl_brief_api.mjs", "utf8");
  for (const source of [health, brief]) {
    assert.ok(source.includes('finished=is.false'));
    assert.ok(source.includes('archive=is.false'));
    assert.ok(source.includes('order=computed_at.desc'));
  }
});
