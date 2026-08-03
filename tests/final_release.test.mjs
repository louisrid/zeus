import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildSystemHealth } from "../lib/server/system_health.mjs";
import { readReleaseWorkflow, releaseWorkflowPath, releaseWorkflowName } from "./release_workflow_fixture.mjs";

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

test("the permanent V5 release workflow is manual-only and fail-closed across build, horizon, live and cleanup", () => {
  assert.equal(releaseWorkflowPath, ".github/workflows/zeus-release-check-v5.yml");
  assert.equal(releaseWorkflowName, "ZEUS Release Check V5");
  assert.ok(existsSync(releaseWorkflowPath));
  const source = readReleaseWorkflow();
  assert.match(source, /^name: ZEUS Release Check V5$/m);
  assert.ok(source.includes("workflow_dispatch"));
  assert.ok(!/^\s*push:/m.test(source));
  assert.ok(!/^\s*schedule:/m.test(source));
  assert.ok(source.includes("Set permanent projection workflows to the full 38-gameweek season"));
  assert.ok(source.includes("node jobs/prepare_permanent_projection_workflows.mjs"));
  assert.ok(!source.includes("git add -- .github/workflows/projections-run.yml .github/workflows/presser-pull.yml"));
  assert.ok(source.includes("npm test"));
  assert.ok(source.includes("npm run build"));
  assert.ok(source.includes("xpts_release_gate.mjs"));
  assert.ok(source.includes("verify_projection_horizon_report.mjs projection-horizon-report.json 38"));
  assert.ok(source.includes("verify_stored_projection_horizon.mjs"));
  assert.ok(source.includes("projection-horizon-report.json"));
  assert.ok(source.includes("stored-projection-horizon-report.json"));
  assert.ok(source.includes("VERIFY_PROJECTION_GWS: '38'"));
  assert.ok(source.includes("verify_live_system.mjs"));
  assert.ok(source.includes("repository-cleanup-paths.txt"));
  assert.ok(source.includes("Confirm repository cleanup is already complete"));
  assert.ok(source.includes('git ls-files -- "$path"'));
  assert.ok(source.includes("Repository cleanup is complete."));
  assert.ok(!source.includes("Verify the staged cleanup before committing"));
  assert.ok(!source.includes("cleanup-preflight.log"));
  assert.ok(!source.includes("cleanup-tests.log"));
  assert.ok(!source.includes("cleanup-build.log"));
  assert.doesNotMatch(source, /git (?:rm|add|commit|push)/);
});

test("cleanup manifest removes every earlier repair workflow and retains the configured V5 workflow", () => {
  const paths = readFileSync("config/repository-cleanup-paths.txt", "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  for (const required of [
    ".github/workflows/apply-zeus-deep-repair-v11.yml",
    ".github/workflows/apply-zeus-verified-repair-v12.yml",
    ".github/workflows/apply-zeus-complete-repair-v13.yml",
    ".github/workflows/apply-zeus-final-repair-v14.yml",
    ".github/workflows/finish-zeus-repair-v15.yml",
    ".github/workflows/fix-upload.yml",
    ".github/workflows/zeus-release-check.yml",
    ".github/workflows/zeus-release-check-v2.yml",
    ".github/workflows/zeus-release-check-v3.yml",
    ".github/workflows/zeus-release-check-v4.yml",
    "workflows-to-add",
    "docs/zeus-final-core-recovery-2026-07-31.md",
  ]) assert.ok(paths.includes(required), required);
  assert.ok(!paths.includes(releaseWorkflowPath), "the permanent V5 workflow may not delete itself");
});

test("health and OpenWeb APIs use the active gameweek and exclude archive rows", () => {
  const health = readFileSync("app/api/health/route.js", "utf8");
  const brief = readFileSync("lib/server/fpl_brief_api.mjs", "utf8");
  for (const source of [health, brief]) {
    assert.ok(source.includes("finished=is.false"));
    assert.ok(source.includes("archive=is.false"));
    assert.ok(source.includes("order=computed_at.desc"));
  }
});
