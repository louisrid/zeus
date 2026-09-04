/* FORCE AN xPTS IMPORT FROM THE APP.
 *
 * The same thing /api/lineups-refresh does, for the projections. The REFRESH button used to be a link
 * out to GitHub, which meant leaving the app, finding the right workflow and pressing Run workflow in a
 * page that looks nothing like the one you came from.
 *
 * Safe to press alongside a line-up refresh: the two jobs write different files and both rebase before
 * pushing. Safe to press twice: the workflow has a concurrency group, so a second press queues rather
 * than racing the first.
 */

import { requestWorkflowRun, workflowStatus } from "../../../lib/server/workflow-dispatch.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WORKFLOW = "xpts-pull.yml";

export async function POST() {
  return requestWorkflowRun(WORKFLOW, "xPTS import");
}

export async function GET() {
  return workflowStatus(WORKFLOW);
}
