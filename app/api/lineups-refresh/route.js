/* FORCE A LINE-UP PULL FROM THE APP.
 *
 * Asks GitHub to run the scout-lineups-pull workflow now instead of waiting for the
 * 06:20 schedule. Two things are worth being straight about before using it.
 *
 * IT IS NOT INSTANT. The workflow scrapes and commits config/lineups.json. The app
 * imports the generated copy of that file at build time, so the new line-ups only
 * appear once Vercel has finished redeploying off that commit. End to end that is
 * two to four minutes, not two seconds. The response says as much so the button can
 * be honest rather than pretending.
 *
 * THE TOKEN NEVER REACHES THE BROWSER. GITHUB_DISPATCH_TOKEN is read here, on the
 * server, and only ever sent to api.github.com. A fine-grained token limited to this
 * one repository with Actions write is all this needs; anything broader is handing out
 * more than the job requires. Without the token the route returns 501 and says so,
 * which is a clearer answer than a silent failure.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = process.env.GITHUB_REPO || "louisrid/zeus";
const WORKFLOW = "scout-lineups-pull.yml";
const BRANCH = process.env.GITHUB_BRANCH || "main";

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function POST() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return json({
      ok: false,
      error: "No GitHub token is configured, so the run cannot be requested from here.",
      how_to_fix: "Add GITHUB_DISPATCH_TOKEN to the Vercel environment as a fine-grained token "
        + `limited to ${REPO} with Actions: write. Until then, Actions, scout-lineups-pull, Run workflow.`,
    }, 501);
  }

  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  let res;
  try {
    res = await fetch(url, {
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

  /* 204 is the success case and carries no body. Anything else is quoted back rather
     than flattened into "something went wrong", because the difference between a bad
     token and a missing workflow matters when you are trying to fix it. */
  if (res.status === 204) {
    return json({
      ok: true,
      message: "Line-up pull requested.",
      note: "The scrape takes about a minute. The app then needs Vercel to redeploy off the new "
        + "commit before the line-ups change on screen, so allow two to four minutes in total.",
      watch: `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`,
    });
  }

  const body = (await res.text()).slice(0, 300);
  const reason = res.status === 401 || res.status === 403
    ? "GitHub rejected the token. It needs Actions: write on this repository, and it may have expired."
    : res.status === 404
      ? `GitHub cannot see ${WORKFLOW} on ${BRANCH}, or the token cannot see the repository.`
      : `GitHub returned ${res.status}.`;
  return json({ ok: false, error: reason, github: body }, 502);
}

export async function GET() {
  return json({
    ok: true,
    configured: Boolean(process.env.GITHUB_DISPATCH_TOKEN),
    repo: REPO,
    workflow: WORKFLOW,
    branch: BRANCH,
  });
}
