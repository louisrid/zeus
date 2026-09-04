/* FORCE A LINE-UP PULL FROM THE APP.
 *
 * Asks GitHub to run scout-lineups-pull now instead of waiting for the 06:20 schedule. The dispatch
 * itself, and every explanation of why a token might be refused, now lives in one place shared with the
 * xPTS refresh: two copies of the same careful error handling would eventually disagree, and the part
 * worth not disagreeing about is the part that tells you how to fix a rejected token.
 *
 * Not instant. The scrape commits config/lineups.json, and the app reads that file at build time, so
 * the new line-ups appear once Vercel has redeployed off that commit.
 */

import { requestWorkflowRun, workflowStatus } from "../../../lib/server/workflow-dispatch.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WORKFLOW = "scout-lineups-pull.yml";

export async function POST() {
  return requestWorkflowRun(WORKFLOW, "Line-up pull");
}

export async function GET() {
  return workflowStatus(WORKFLOW);
}
