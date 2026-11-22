/* ONE RUN, ASKED ABOUT DIRECTLY.
 *
 * The previous version handed the browser a list of workflows and let it dispatch them one at a time,
 * waiting between each. That made a data refresh depend on a tab staying open, and every failure since
 * has been a variation on the same theme: the page was closed, the phone discarded it, the counter lost
 * its place, a step was dispatched twice.
 *
 * There is now a single workflow that does all of it in order, so this has two jobs and no state:
 *
 *   POST  start it, unless one is already going, in which case say so and return that one
 *   GET   report the run: which step it is on, whether it finished, and what went wrong if it did not
 *
 * Progress comes from the run's own steps rather than from anything remembered here. GitHub knows which
 * step is executing; asking is both simpler and more truthful than tracking it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = process.env.GITHUB_REPO || "louisrid/zeus";
const WORKFLOW = "update-all.yml";

/* The steps a reader cares about, in order, named exactly as the workflow names them. Checkout and setup
 * are real steps and are not interesting, so they are not counted: "1 of 4" should mean a quarter of the
 * work, not a quarter of the YAML. */
/* The check is reported now. It used to sit unnamed between the line-ups and the publish, so for as long
 * as it ran the counter said "4 of 4" about a step that had not begun. Every step that takes real time is
 * listed, so the number on screen is always the step actually executing. */
const REPORTED = [
  "Prices, points and injury flags",
  "My team, bank and selling prices",
  "Projections, defensive rates and fixture difficulty",
  "Predicted line-ups",
  "Check the refreshed data",
  "Publish the update",
];

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function latestRun(token) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`,
    { headers: headers(token), cache: "no-store" },
  );
  if (!res.ok) return null;
  const body = await res.json();
  return (body?.workflow_runs || [])[0] || null;
}

/* The run's own steps, so progress is the real thing rather than an estimate. */
async function stepsOf(run, token) {
  if (!run) return [];
  const res = await fetch(`${run.jobs_url}?per_page=5`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) return [];
  const body = await res.json();
  const job = (body?.jobs || [])[0];
  return job?.steps || [];
}

/* GITLAB. When GITLAB_PROJECT_ID and GITLAB_TOKEN are set in Vercel, the button starts and reports the
   GitLab pipeline (.gitlab-ci.yml) instead of the GitHub workflow. Its jobs carry the same six names, so
   the dashboard reads them exactly as it reads GitHub's steps. */
const GITLAB = process.env.GITLAB_PROJECT_ID && process.env.GITLAB_TOKEN
  ? { id: encodeURIComponent(process.env.GITLAB_PROJECT_ID), token: process.env.GITLAB_TOKEN,
      host: process.env.GITLAB_HOST || "https://gitlab.com", ref: process.env.GITLAB_REF || "main" }
  : null;
const gl = (path, init = {}) => fetch(`${GITLAB.host}/api/v4/projects/${GITLAB.id}${path}`, {
  ...init, cache: "no-store", headers: { "PRIVATE-TOKEN": GITLAB.token, "Content-Type": "application/json", ...(init.headers || {}) },
});
/* ONLY DATA UPDATES COUNT. GitLab also lists an "external" pipeline for every commit Vercel deploys (its
   build status is posted back to the commit). Reading the newest pipeline of any kind made the Dashboard
   show a full update sequence running whenever a code change was deploying, though nobody had pressed
   anything. The update's own runs come from the schedule, the button (api/trigger) or the GitLab page. */
const UPDATE_SOURCES = new Set(["schedule", "api", "trigger", "web", "pipeline"]);
async function gitlabLatest() {
  const res = await gl(`/pipelines?ref=${encodeURIComponent(GITLAB.ref)}&per_page=20&order_by=id&sort=desc`);
  if (!res.ok) return null;
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).find((row) => UPDATE_SOURCES.has(String(row.source))) || null;
}
const GL_RUNNING = new Set(["created", "waiting_for_resource", "preparing", "pending", "running", "scheduled"]);
async function gitlabPost() {
  const existing = await gitlabLatest();
  if (existing && GL_RUNNING.has(existing.status)) {
    return Response.json({ ok: true, already_running: true, run_id: existing.id }, { headers: { "cache-control": "no-store" } });
  }
  const res = await gl("/pipeline", { method: "POST", body: JSON.stringify({ ref: GITLAB.ref }) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json({ ok: false, error: `GitLab returned ${res.status}.`, how_to_fix: detail.slice(0, 200) }, { status: 502 });
  }
  return Response.json({ ok: true, started: true }, { headers: { "cache-control": "no-store" } });
}
async function gitlabGet() {
  const run = await gitlabLatest();
  if (!run) {
    return Response.json({ ok: true, configured: true, phase: "idle", current: 1, total: REPORTED.length,
      steps: REPORTED.map((name) => ({ name, status: "waiting", conclusion: null })) }, { headers: { "cache-control": "no-store" } });
  }
  const jobsRes = await gl(`/pipelines/${run.id}/jobs?per_page=50&include_retried=false`);
  const jobs = jobsRes.ok ? await jobsRes.json() : [];
  const byName = new Map(jobs.map((job) => [job.name, job]));
  const steps = REPORTED.map((name) => {
    const job = byName.get(name);
    const st = job ? job.status : null;
    if (!st || st === "created" || st === "manual") return { name, status: "waiting", conclusion: null };
    if (GL_RUNNING.has(st)) return { name, status: st === "running" ? "in_progress" : "queued", conclusion: null };
    return { name, status: "completed", conclusion: st === "success" ? "success" : st === "skipped" ? "skipped" : "failure" };
  });
  const running = steps.findIndex((step) => step.status === "in_progress");
  const doneCount = steps.filter((step) => step.status === "completed" && step.conclusion === "success").length;
  const current = running >= 0 ? running + 1 : Math.min(doneCount + 1, steps.length);
  const failed = steps.find((step) => step.conclusion === "failure");
  const phase = GL_RUNNING.has(run.status) ? "running" : run.status === "success" ? "done" : "failed";
  return Response.json({ ok: true, configured: true, phase, run_id: run.id, run_url: run.web_url,
    started_at: run.created_at, finished_at: run.updated_at || null, current, total: steps.length, steps,
    failed_step: failed ? failed.name : null,
    /* GitLab refuses every job once the free monthly build minutes are spent (failure_reason
       ci_quota_exceeded). That is not a broken step, so the card says so plainly. */
    out_of_minutes: jobs.some((job) => job.failure_reason === "ci_quota_exceeded") }, { headers: { "cache-control": "no-store" } });
}

/* WHICH SERVICE RUNS THE UPDATE. GitLab, while it is configured in Vercel. GitHub is used only when
   GitLab is not configured and the GitHub token works. */
async function githubToken() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`,
      { headers: headers(token), cache: "no-store" });
    return res.ok ? token : null;
  } catch { return null; }
}

export async function POST() {
  if (GITLAB) return gitlabPost();
  const token = await githubToken();
  if (!token) {
    return Response.json({
      ok: false,
      error: "No GitHub token is configured, so the update cannot be started from here.",
      how_to_fix: `Run it from Actions on ${REPO}, or add GITHUB_DISPATCH_TOKEN in Vercel.`,
    }, { status: 503 });
  }

  /* A run already going is not a reason to start another. Two imports writing the same files would race,
     and the honest answer to "start an update" when one is underway is "one is underway". */
  const existing = await latestRun(token);
  if (existing && existing.status !== "completed") {
    return Response.json({ ok: true, already_running: true, run_id: existing.id },
      { headers: { "cache-control": "no-store" } });
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json({
      ok: false,
      error: `GitHub returned ${res.status}.`,
      how_to_fix: res.status === 404
        ? `The workflow ${WORKFLOW} is not on main yet. Add it, then try again.`
        : detail.slice(0, 200),
    }, { status: 502 });
  }

  return Response.json({ ok: true, started: true }, { headers: { "cache-control": "no-store" } });
}

export async function GET() {
  if (GITLAB) return gitlabGet();
  const token = await githubToken();
  if (!token) {
    return Response.json({
      ok: true, configured: false, phase: "unavailable",
      note: `No GitHub token is configured. Actions on ${REPO} still works.`,
      current: 1, total: REPORTED.length,
      steps: REPORTED.map((name) => ({ name, status: "unknown", conclusion: null })),
    }, { headers: { "cache-control": "no-store" } });
  }

  const run = await latestRun(token);
  if (!run) {
    return Response.json({
      ok: true, configured: true, phase: "idle",
      current: 1, total: REPORTED.length,
      steps: REPORTED.map((name) => ({ name, status: "waiting", conclusion: null })),
    }, { headers: { "cache-control": "no-store" } });
  }

  const executed = await stepsOf(run, token);
  const byName = new Map(executed.map((step) => [step.name, step]));
  const steps = REPORTED.map((name) => {
    const step = byName.get(name);
    return {
      name,
      status: step?.status || "waiting",       // waiting | queued | in_progress | completed
      conclusion: step?.conclusion || null,    // success | failure | skipped | null
    };
  });

  /* The step being worked on now, or the first that has not started. One-based, because it is shown to a
     person as "2 of 4". */
  const running = steps.findIndex((step) => step.status === "in_progress");
  const doneCount = steps.filter((step) => step.status === "completed" && step.conclusion === "success").length;
  const current = running >= 0 ? running + 1 : Math.min(doneCount + 1, steps.length);

  const failed = steps.find((step) => step.status === "completed"
    && step.conclusion && step.conclusion !== "success" && step.conclusion !== "skipped");

  const phase = run.status !== "completed"
    ? "running"
    : run.conclusion === "success" ? "done" : "failed";

  return Response.json({
    ok: true,
    configured: true,
    phase,
    run_id: run.id,
    run_url: run.html_url,
    started_at: run.run_started_at || run.created_at,
    finished_at: run.updated_at || null,
    current,
    total: steps.length,
    steps,
    /* Named rather than inferred, so the page never has to guess which part went wrong. */
    failed_step: failed ? failed.name : null,
  }, { headers: { "cache-control": "no-store" } });
}
