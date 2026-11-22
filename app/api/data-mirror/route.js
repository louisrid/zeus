import { mirrorData } from "../../../lib/server/data-mirror.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/* Copies the newest GitHub data update into GitLab so Vercel deploys it (lib/server/data-mirror.mjs).
   Called by Vercel's cron after each scheduled update and by the Dashboard when an update finishes.
   Harmless to call at any time: it only ever brings GitLab's data up to GitHub's. */
export async function GET() {
  try {
    return Response.json(await mirrorData(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, reason: String(error.message || error).slice(0, 300) }, { status: 502 });
  }
}
