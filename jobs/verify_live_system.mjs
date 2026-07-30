import { writeFile } from "node:fs/promises";

const BASE_URL = String(process.env.ZEUS_BASE_URL || "https://zeus-teal.vercel.app").replace(/\/$/, "");
const EXPECTED_SHA = String(process.env.EXPECTED_SHA || "").trim();
const API_KEY = String(process.env.ZEUS_API_KEY || process.env.OPENWEBUI_API_KEY || process.env.FPL_BRIEF_API_KEY || "").trim();
const ATTEMPTS = Math.max(1, Number(process.env.VERIFY_ATTEMPTS) || 36);
const DELAY_MS = Math.max(1000, Number(process.env.VERIFY_DELAY_MS) || 20000);
const REPORT_JSON = process.env.VERIFY_REPORT_JSON || "system-verification-report.json";
const REPORT_MD = process.env.VERIFY_REPORT_MD || "docs/system-verification-latest.md";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = async (url, options = {}, ms = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
};

async function textRequest(path, options = {}) {
  const response = await withTimeout(`${BASE_URL}${path}`, options);
  const text = await response.text();
  return { response, text };
}

async function jsonRequest(path, options = {}) {
  const { response, text } = await textRequest(path, options);
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, text, body };
}

function check(name, pass, detail, critical = true) {
  return { name, pass: Boolean(pass), detail: String(detail ?? ""), critical };
}

function authHeaders() {
  const headers = { accept: "application/json" };
  if (API_KEY) headers["x-api-key"] = API_KEY;
  return headers;
}

async function verifyOnce() {
  const checks = [];
  const warnings = [];

  const home = await textRequest("/");
  checks.push(check("Homepage responds", home.response.status === 200, `HTTP ${home.response.status}`));
  checks.push(check("Homepage is a Next.js page", /_next\//.test(home.text) && !/Internal Server Error/i.test(home.text), `${home.text.length} bytes`));

  const players = await textRequest("/players");
  checks.push(check("Players page responds", players.response.status === 200, `HTTP ${players.response.status}`));
  checks.push(check("Players page is deployed", /_next\//.test(players.text) && !/Internal Server Error/i.test(players.text), `${players.text.length} bytes`));

  const healthResult = await jsonRequest("/api/health", { headers: { accept: "application/json" } });
  const health = healthResult.body || {};
  checks.push(check("Health endpoint responds", healthResult.response.status === 200 && health.ok === true, `HTTP ${healthResult.response.status}; ${health.error || health.status || "no body"}`));
  checks.push(check("Supabase and current projections are ready", health.database_connected && health.players_page_data_ready && Number(health.projection_count) >= 500, `${health.projection_count || 0} projections`));
  checks.push(check("OpenWeb data builder is ready", health.openweb_brief_ready === true && Number(health.field_failures || 0) === 0, `${health.field_failures || 0} field failures`));
  checks.push(check("No stale projection rows reach the API", Number(health.stale_rows_excluded || 0) === 0, `${health.stale_rows_excluded || 0} stale rows`));

  if (EXPECTED_SHA) {
    const deployed = String(health.deployment_commit || "");
    checks.push(check("Vercel deployed the cleanup commit", deployed && (deployed.startsWith(EXPECTED_SHA) || EXPECTED_SHA.startsWith(deployed)), `expected ${EXPECTED_SHA.slice(0, 12)}, live ${deployed.slice(0, 12) || "missing"}`));
  }

  const gw = Number(health.gameweek) || 1;
  const getResult = await jsonRequest(`/api/brief?format=json&gw=${gw}`, { headers: authHeaders() });
  let externalBriefChecked = false;
  if (getResult.response.status === 200 && getResult.body?.ok) {
    externalBriefChecked = true;
    checks.push(check("OpenWeb JSON GET works", true, `${getResult.body.projection_count || 0} projections`));
    checks.push(check("OpenWeb JSON uses the current engine generation", Number(getResult.body.projection_count) === Number(health.projection_count) && getResult.body.latest_projection_run === health.latest_projection_run, `${getResult.body.latest_projection_run || "missing"}`));
    const required = ["players", "projections", "top_players", "essential_players", "captain_candidates", "model_version", "latest_projection_run"];
    checks.push(check("OpenWeb response contract is complete", required.every((key) => getResult.body[key] !== undefined), required.filter((key) => getResult.body[key] === undefined).join(", ") || "all fields present"));
  } else if (getResult.response.status === 401 && health.openweb_auth_required && !API_KEY) {
    warnings.push("The live OpenWeb endpoint is protected, but GitHub has no matching ZEUS_API_KEY/OPENWEBUI_API_KEY secret. The internal live data path passed; external authentication could not be exercised by this workflow.");
    checks.push(check("OpenWeb JSON GET is protected", true, "HTTP 401 as configured", false));
  } else {
    checks.push(check("OpenWeb JSON GET works", false, `HTTP ${getResult.response.status}: ${getResult.text.slice(0, 200)}`));
  }

  if (externalBriefChecked || API_KEY || !health.openweb_auth_required) {
    const postResult = await jsonRequest("/api/brief", {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ gw }),
    });
    checks.push(check("OpenWeb JSON POST works", postResult.response.status === 200 && postResult.body?.ok === true, `HTTP ${postResult.response.status}; ${postResult.body?.projection_count || 0} projections`));
  }

  const failed = checks.filter((item) => item.critical && !item.pass);
  return {
    pass: failed.length === 0,
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    expected_sha: EXPECTED_SHA || null,
    live_sha: health.deployment_commit || null,
    health,
    checks,
    warnings,
    failed: failed.map((item) => item.name),
  };
}

function reportMarkdown(report) {
  const lines = [
    "# ZEUS Final System Verification",
    "",
    `**Release status: ${report.pass ? "PASS" : "FAIL"}**`,
    `Generated: ${report.generated_at}`,
    `Live site: ${report.base_url}`,
    "",
    "## Checks",
    "",
  ];
  for (const item of report.checks) {
    lines.push(`- **${item.pass ? "PASS" : "FAIL"}: ${item.name}**  `);
    lines.push(`  ${item.detail}`);
  }
  if (report.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  lines.push("", "## Live projection evidence", "");
  lines.push(`- Gameweek: ${report.health.gameweek ?? "unknown"}`);
  lines.push(`- Projection count: ${report.health.projection_count ?? 0}`);
  lines.push(`- Model: ${report.health.model_version || "unknown"}`);
  lines.push(`- Latest run: ${report.health.latest_projection_run || "unknown"}`);
  if (report.health.top_player) lines.push(`- Top player: ${report.health.top_player.name} (${report.health.top_player.team}), ${Number(report.health.top_player.xpts).toFixed(2)} xPTS`);
  return `${lines.join("\n")}\n`;
}

let last = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    last = await verifyOnce();
  } catch (error) {
    last = {
      pass: false,
      generated_at: new Date().toISOString(),
      base_url: BASE_URL,
      expected_sha: EXPECTED_SHA || null,
      checks: [],
      warnings: [],
      failed: [error instanceof Error ? error.message : String(error)],
      health: {},
    };
  }
  console.log(`Live verification attempt ${attempt}/${ATTEMPTS}: ${last.pass ? "PASS" : "waiting"}`);
  if (last.pass) break;
  if (attempt < ATTEMPTS) await sleep(DELAY_MS);
}

await writeFile(REPORT_JSON, `${JSON.stringify(last, null, 2)}\n`);
await writeFile(REPORT_MD, reportMarkdown(last));
console.log(reportMarkdown(last));
if (!last.pass) process.exitCode = 1;
