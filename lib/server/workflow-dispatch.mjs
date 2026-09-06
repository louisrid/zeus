/* ASKING GITHUB TO RUN A JOB, FOR BOTH REFRESH BUTTONS.
 *
 * The line-up refresh already did this and the xPTS refresh needed to do the same thing. Copying the
 * route would have left two versions of the same careful error handling to drift apart, and the part
 * most worth not drifting is the part that explains why a token was rejected. So both routes are the
 * same function with a different workflow name.
 *
 * NEITHER REFRESH IS INSTANT, and the response says so rather than letting a button imply otherwise.
 * Each job writes a generated file into the repository and commits it. The app reads those files at
 * build time, so nothing changes on screen until Vercel has redeployed off the new commit. That is two
 * to four minutes end to end.
 *
 * THE TWO JOBS ARE SAFE TO RUN TOGETHER. They write different files, and both rebase before pushing, so
 * whichever finishes second replays its commit on top of the first rather than overwriting it. Each also
 * has a concurrency group, so pressing the same button twice queues a second run instead of racing the
 * first. Press one, walk to another page, press the other: nothing is lost either way.
 *
 * THE TOKEN NEVER REACHES THE BROWSER. GITHUB_DISPATCH_TOKEN is read on the server and only ever sent to
 * api.github.com. A fine-grained token limited to this repository with Actions: write is all it needs.
 */

const REPO = process.env.GITHUB_REPO || "louisrid/zeus";
const BRANCH = process.env.GITHUB_BRANCH || "main";

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function requestWorkflowRun(workflow, what) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return json({
      ok: false,
      error: "No GitHub token is configured, so the run cannot be requested from here.",
      how_to_fix: `Add GITHUB_DISPATCH_TOKEN to the Vercel environment as a fine-grained token limited `
        + `to ${REPO} with Actions: write. Until then, Actions, ${workflow.replace(".yml", "")}, Run workflow.`,
      watch: `https://github.com/${REPO}/actions/workflows/${workflow}`,
    }, 501);
  }

  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: BRANCH }),
    });
  } catch (error) {
    return json({ ok: false, error: `GitHub could not be reached: ${error.message}` }, 502);
  }

  /* 204 is the success case and carries no body. Anything else is quoted back rather than flattened into
     "something went wrong", because the difference between a bad token and a missing workflow matters
     when you are trying to fix it. */
  if (res.status === 204) {
    return json({
      ok: true,
      message: `${what} requested.`,
      note: "The job takes about a minute, then Vercel redeploys off the new commit before anything "
        + "changes on screen. Allow two to four minutes in total.",
      watch: `https://github.com/${REPO}/actions/workflows/${workflow}`,
    });
  }

  const body = (await res.text()).slice(0, 300);
  const reason = res.status === 401 || res.status === 403
    ? "GitHub rejected the token. It needs Actions: write on this repository, and it may have expired."
    : res.status === 404
      ? `GitHub cannot see ${workflow} on ${BRANCH}, or the token cannot see the repository.`
      : `GitHub returned ${res.status}.`;
  return json({ ok: false, error: reason, github: body }, 502);
}

/* WHAT HAPPENED TO THE RUN.
 *
 * Dispatching told the caller a job had been asked for and nothing after that. If the job then failed,
 * the app looked identical to a job that had never been requested: the timestamp did not move and there
 * was nowhere in the product to find out why. The only way to learn a run had died was to go to GitHub
 * and read the Actions tab, which is exactly what the button existed to avoid.
 *
 * So the latest run is reported back. A run is only useful to a reader as one of four things: still
 * going, finished and committed, finished and refused, or never started at all. */
export async function workflowStatus(workflow) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const base = {
    ok: true,
    configured: Boolean(token),
    repo: REPO,
    workflow,
    branch: BRANCH,
    watch: `https://github.com/${REPO}/actions/workflows/${workflow}`,
  };
  if (!token) return json({ ...base, latest: null });

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return json({ ...base, latest: null, note: `GitHub returned ${res.status}.` });
    const body = await res.json();
    const run = (body?.workflow_runs || [])[0];
    if (!run) return json({ ...base, latest: null });
    return json({
      ...base,
      latest: {
        status: run.status,
        conclusion: run.conclusion,
        started_at: run.run_started_at,
        url: run.html_url,
        /* The failure a reader can act on is nearly always the same one: the import ran, the suite went
           red, and the commit was refused on purpose so a broken file could not reach the site. */
        summary: run.status !== "completed"
          ? "Running now."
          : run.conclusion === "success"
            ? "Last run succeeded."
            : `Last run ${run.conclusion}. Nothing was committed, so the numbers on screen are unchanged.`,
      },
    });
  } catch (error) {
    return json({ ...base, latest: null, note: `GitHub could not be reached: ${error.message}` });
  }
}
