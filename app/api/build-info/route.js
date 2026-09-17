/* A VERSION THAT COUNTS, RATHER THAN A HASH THAT DOES NOT.
 *
 * The build indicator showed the commit, which is the truest possible answer and a useless one to read:
 * 58a68f4 tells you nothing about whether it is newer than the 45e7442 you saw an hour ago. Version
 * numbers exist because people compare them at a glance, and a hash cannot be compared at a glance.
 *
 * The count of commits on main is already a running number that only ever goes up, so it is the version.
 * Nothing new to maintain, nothing to remember to increment, and it cannot drift from what is deployed
 * because it is derived from the thing that was deployed.
 *
 * GitHub gives the total cheaply: ask for one commit per page and the Link header names the last page,
 * which is the number of commits. One request, no paging.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = process.env.GITHUB_REPO || "louisrid/zeus";
const MAJOR = 1;

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null;
  const token = process.env.GITHUB_DISPATCH_TOKEN;

  if (!token) {
    return Response.json({ ok: true, version: null, deployed_at: null, commit: sha },
      { headers: { "cache-control": "no-store" } });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const [countRes, commitRes] = await Promise.all([
      /* COUNTED UP TO THE COMMIT THAT IS ACTUALLY SERVING THIS PAGE.
       *
       * This counted main, which moves the instant anything is pushed. So the version number went up on
       * commit rather than on deploy, while the time beside it came from the deployed commit and stayed
       * where it was. The badge announced a new version that was not on screen yet, and the one number
       * anyone would use to check whether a deploy had landed was the one number that did not wait for
       * it. Both halves now describe the same commit: the one this build was made from. */
      fetch(`https://api.github.com/repos/${REPO}/commits?sha=${sha || "main"}&per_page=1`, { headers, cache: "no-store" }),
      sha
        ? fetch(`https://api.github.com/repos/${REPO}/commits/${sha}`, { headers, cache: "no-store" })
        : Promise.resolve(null),
    ]);

    let build = null;
    if (countRes?.ok) {
      /* The Link header looks like <...&page=843>; rel="last". That last page number is the number of
         commits, because there is one per page. */
      const link = countRes.headers.get("link") || "";
      const match = link.match(/[?&]page=(\d+)>; rel="last"/);
      build = match ? Number(match[1]) : 1;
    }

    /* When this build was actually deployed. The commit's own date is the honest answer: Vercel builds
       within a minute or two of it, and a reader asking "is this the version I just uploaded" is
       comparing against when they uploaded. */
    let deployedAt = null;
    if (commitRes && commitRes.ok) {
      const body = await commitRes.json();
      deployedAt = body?.commit?.committer?.date || body?.commit?.author?.date || null;
    }

    return Response.json({
      ok: true,
      version: build ? `${MAJOR}.${build}` : null,
      build,
      deployed_at: deployedAt,
      commit: sha ? sha.slice(0, 7) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: true, version: null, deployed_at: null, commit: sha ? sha.slice(0, 7) : null },
      { headers: { "cache-control": "no-store" } });
  }
}
