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
const REPORTED = [
  "Prices, points and injury flags",
  "Projections, defensive rates and fixture difficulty",
  "Predicted line-ups",
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

export async function POST() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
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
  const token = process.env.GITHUB_DISPATCH_TOKEN;
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
