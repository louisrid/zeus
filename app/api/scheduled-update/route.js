/* THE TWICE-DAILY REFRESH, NOT TRUSTING GITHUB'S CLOCK.
 *
 * update-all.yml carries its own `schedule:`, but GitHub switches a repository's scheduled workflows off
 * after sixty days without activity, and this repository sat idle through the GitLab spell. The crons in
 * the file were dead on 23 and 24 November and the site went a day and a half stale without saying so.
 *
 * Vercel's own cron calls this instead. A workflow_dispatch is never subject to that rule, so the update
 * runs whether or not GitHub has re-enabled the schedule; if the schedule is alive too, the gate inside
 * update-all skips whichever of the two ran second. Each call:
 *
 *   1. copies anything GitHub has published since last time onto GitLab, which is what Vercel builds, so
 *      the previous run reaches the site even if nobody opened the app;
 *   2. starts a fresh update, unless one finished recently or is running now.
 *
 * Opening the Dashboard also copies a finished run (see /api/update-data), so new data reaches the site
 * at the next cron or the next page view, whichever comes first. */
import { mirrorData } from "../../../lib/server/data-mirror.mjs";
import { GET as updateStatus, POST as startUpdate } from "../update-data/route.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/* Long enough that a double-fire, a retried cron or a curious visitor cannot stack up runs; short enough
   that the morning and evening slots both do their work. */
const RECENT_MS = 3 * 60 * 60 * 1000;

export async function GET() {
  const out = { mirror: null, started: false, reason: null };
  try {
    out.mirror = await mirrorData();
  } catch (error) {
    out.mirror = { ok: false, reason: String(error.message || error).slice(0, 200) };
  }
  try {
    const status = await updateStatus().then((r) => r.json()).catch(() => null);
    const phase = status?.phase || null;
    const finished = Date.parse(status?.finished_at || "") || 0;
    if (phase === "running" || phase === "queued") {
      out.reason = "an update is already running";
    } else if (finished && Date.now() - finished < RECENT_MS) {
      out.reason = `the last update finished ${Math.round((Date.now() - finished) / 60000)} minutes ago`;
    } else {
      const res = await startUpdate();
      const body = await res.json().catch(() => ({}));
      out.started = Boolean(body?.ok);
      out.reason = body?.ok ? "update started" : `could not start: ${body?.error || res.status}`;
    }
  } catch (error) {
    out.reason = String(error.message || error).slice(0, 200);
  }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
