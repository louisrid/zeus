/* GITHUB ACTIONS HOOKS FOR THE DATA UPDATE (Nov 2026).
 *
 * The data update runs on GitHub again (free there), but GitHub's workflow files could not be changed from
 * here, so the update-all workflow on GitHub is an older copy. Two hooks bring it up to date from inside
 * the npm scripts it already calls. Both do nothing anywhere except a GitHub Actions run of update-all, so
 * Vercel builds, GitLab and local runs are unaffected.
 *
 *   postinstall    (npm ci)            copy the latest code from GitLab (data files and workflows
 *                                      excluded) and stage it, so the run uses it and its publish commit
 *                                      carries it to GitHub
 *   after-lineups  (npm run sync:lineups)  the steps the older workflow lacks: the mean of three and the
 *                                      Defences results, staged so the publish commit includes them
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const ON_UPDATE = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_WORKFLOW === "update-all";
const DATA_FILES = [
  "config/external-xpts-2026-27.mjs", "config/blend-xpts-2026-27.mjs", "tests/fpl-players.json",
  "config/defcon-live-2026-27.mjs", "config/fdr-2026-27.mjs", "config/season-actuals-2026-27.mjs",
  "config/lineups.json", "config/defences.json", "lib/server/lineups-config.generated.mjs",
];
const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
const lockHash = () => (existsSync("package-lock.json") ? createHash("sha256").update(readFileSync("package-lock.json")).digest("hex") : "");

if (ON_UPDATE && !process.env.ZEUS_HOOK_RUNNING) {
  process.env.ZEUS_HOOK_RUNNING = "1";
  const step = process.argv[2];
  if (step === "postinstall") {
    const before = lockHash();
    sh("rm -rf /tmp/zeus-gitlab && git clone -q --depth 1 https://gitlab.com/louisjridland/zeus.git /tmp/zeus-gitlab");
    const excludes = [".git/", ".github/workflows/", "node_modules/", ...DATA_FILES].map((p) => `--exclude '${p}'`).join(" ");
    sh(`rsync -a --delete ${excludes} /tmp/zeus-gitlab/ ./`);
    if (lockHash() !== before) sh("npm ci --ignore-scripts --no-audit --no-fund");
    sh("git add -A");
    console.log(`Code brought up to date from GitLab ${execSync("git -C /tmp/zeus-gitlab log -1 --format=%h").toString().trim()}.`);
  }
  if (step === "after-lineups") {
    try { sh("node jobs/blend_xpts_pull.mjs"); } catch { console.log("The mean of three could not be rebuilt this time; the last one stays."); }
    try { sh("node jobs/defences_pull.mjs"); } catch { console.log("Defences could not be read this time; the last table stays."); }
    sh("git add config/blend-xpts-2026-27.mjs config/defences.json");
  }
}
