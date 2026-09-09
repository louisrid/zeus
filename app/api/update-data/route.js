/* ONE UPDATE, RUN IN ORDER, REPORTED HONESTLY.
 *
 * Refreshing the data used to mean knowing which button did what: one for the projections, another for
 * the line-ups, nothing at all for the database behind them, and each with its own wait and its own way
 * of saying nothing had happened. That is a map of the plumbing, not a thing anyone wants to operate.
 *
 * This exposes the chain as a sequence the app can drive and watch:
 *
 *   1  fpl-pull            prices, points, injury flags into the database
 *   2  xpts-pull           projections, DEFCON for this season, fixture difficulty
 *   3  scout-lineups-pull  the predicted elevens the gate reads
 *   4  odds-pull           betting odds, which move on the team news above
 *
 * The order is the dependency order, and it is the reason this is a sequence rather than four buttons
 * pressed at once: the projections import overrides club, position and price from the official list, so
 * the database should already agree with it, and odds set before the team news describe a different match
 * to the one being played.
 *
 * NOTHING IS SIMULATED. Each step is a real workflow run, and the status comes from GitHub rather than
 * from a timer, so "step 2 of 4" means step 2 is genuinely running. A step that fails stops the chain and
 * says which one, because carrying on would build the later files from data that never arrived.
 */

import { requestWorkflowRun } from "../../../lib/server/workflow-dispatch.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = process.env.GITHUB_REPO || "louisrid/zeus";

/* In dependency order. `label` is what the reader sees, so it names the thing being updated rather than
 * the file or the job. */
export const STEPS = [
  { key: "fpl", workflow: "fpl-pull.yml", label: "Prices, points and injury flags" },
  { key: "xpts", workflow: "xpts-pull.yml", label: "Projections, defensive rates and fixture difficulty" },
  { key: "lineups", workflow: "scout-lineups-pull.yml", label: "Predicted line-ups" },
  { key: "odds", workflow: "odds-pull.yml", label: "Betting odds" },
];

async function latestRun(workflow, token, startedAfter) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=5`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return { status: "unknown", conclusion: null };
  const body = await res.json();
  const runs = body?.workflow_runs || [];
  /* Only a run started after the button was pressed counts. Without this the first poll sees the last
     scheduled run, finds it finished, and reports a step complete that has not begun. */
  const mine = startedAfter
    ? runs.find((run) => Date.parse(run.run_started_at || run.created_at) >= startedAfter - 60000)
    : runs[0];
  if (!mine) return { status: "queued", conclusion: null };
  return {
    status: mine.status,
    conclusion: mine.conclusion,
    url: mine.html_url,
    started_at: mine.run_started_at || mine.created_at,
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const step = STEPS.find((entry) => entry.key === body?.step);
  if (!step) {
    return Response.json({ ok: false, error: "Unknown step." }, { status: 400 });
  }
  return requestWorkflowRun(step.workflow, step.label);
}

export async function GET(request) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const since = Number(new URL(request.url).searchParams.get("since")) || null;

  if (!token) {
    return Response.json({
      ok: true,
      configured: false,
      steps: STEPS.map((step) => ({ ...step, status: "unknown", conclusion: null })),
      note: "No GitHub token is configured, so the update cannot be started from here. "
        + `Actions on ${REPO} still works.`,
    }, { headers: { "cache-control": "no-store" } });
  }

  const steps = [];
  for (const step of STEPS) {
    /* Sequential rather than parallel: four calls is nothing, and GitHub rate limits are worth more than
       the fraction of a second saved. */
    // eslint-disable-next-line no-await-in-loop
    const run = await latestRun(step.workflow, token, since);
    steps.push({ ...step, ...run });
  }

  return Response.json({ ok: true, configured: true, steps },
    { headers: { "cache-control": "no-store" } });
}
