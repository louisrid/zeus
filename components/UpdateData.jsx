"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";
import EXTERNAL_XPTS_DATA from "../config/external-xpts-2026-27.mjs";
import DEFCON_LIVE from "../config/defcon-live-2026-27.mjs";
import FDR from "../config/fdr-2026-27.mjs";
import LINEUPS from "../config/lineups.json" with { type: "json" };

/* ONE BUTTON FOR THE WHOLE UPDATE.
 *
 * There were three ways to refresh data and each described a different piece of plumbing: one for the
 * projections, one for the line-ups, none at all for the database underneath them. Between them they left
 * the reader deciding which parts of a single idea to press, in which order, and with no way to tell
 * whether any of it had worked. The idea is "update the data". So that is the button.
 *
 * IT REPORTS RATHER THAN REASSURES. Progress is a count of real workflow runs, taken from GitHub, so
 * "2 of 4" means the second job is genuinely running. A step that fails stops the chain and names itself,
 * because the later files are built from the earlier ones and finishing on stale inputs is worse than
 * stopping.
 *
 * IT DOES NOT RELOAD THE PAGE FOR YOU. The app reads its data at build time, so new numbers arrive with
 * the next deploy, and a page that reloaded itself mid-thought would take a squad you were mid-way
 * through editing with it. It says when there is something to see and leaves the choice alone; pressing
 * again is blocked until then, since a second run would only queue behind the first.
 */

const POLL_MS = 12000;
/* The team this app is for. Reading it from the saved plans is better when they exist, but a first
   connection has no plans to read from, and that was the only reason a second button survived. */
const ENTRY_ID = 4812;

function agoFrom(iso, now) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then) || now === null) return { label: "unknown", stale: true };
  const hours = (now - then) / 3600000;
  if (hours < 1) return { label: "just now", stale: false };
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, stale: false };
  const days = Math.floor(hours / 24);
  return { label: `${days} day${days === 1 ? "" : "s"} ago`, stale: hours >= 36 };
}

export default function UpdateData({ onFinished = null }) {
  /* Measured in the browser so "3 days ago" is against the reader's clock, not the clock the page was
     built on, which for a statically rendered page can be days out by itself. */
  const [now, setNow] = React.useState(null);
  React.useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  /* MY TEAM IS PART OF "THE DATA" TOO.
   *
   * Re-reading the live squad from the official API sat behind its own button on another page, which made
   * it a separate errand: update the data here, then remember to go and pull your own team there. It is
   * instant and needs no deploy, so it runs at the end of the chain, after the projections it will be
   * read against.
   *
   * The entry id is 4812 and does not change. It is read from the saved plans when they are there and
   * falls back to that number when they are not, so a first connection works from this button too and
   * there is nothing left for another page to do. */
  const [phase, setPhase] = React.useState("idle");   // idle | running | done | failed | unavailable
  const [stepIndex, setStepIndex] = React.useState(0);
  const [total, setTotal] = React.useState(4);
  const [message, setMessage] = React.useState(null);
  const startedRef = React.useRef(null);

  /* THE CHECKLIST IS THE STEPS, NOT THE FILES.
   *
   * It listed four data files beside a counter that said "1 of 3", because the files and the jobs are not
   * the same thing: one job writes three of those files and another writes the fourth, and the first job
   * writes none at all because it fills the database. Four green dots next to "step 1 of 3" is a puzzle,
   * not a status.
   *
   * So the rows are the steps, in the order they run, and each says what it refreshes. A step that writes
   * files carries the age of the oldest of them, since a step is only as fresh as its stalest output. */
  const steps = [
    {
      key: "fpl",
      name: "Prices, points and injury flags",
      detail: "database",
      /* No file to date. It writes to the database, which the app reads live, so there is nothing here
         that could be stale in the way a generated file can. */
      iso: null,
    },
    {
      key: "xpts",
      name: "Projections, defensive rates, fixture difficulty",
      detail: `${EXTERNAL_XPTS_DATA?.player_count || 0} players · ${Object.keys(FDR?.clubs || {}).length} clubs`,
      iso: [EXTERNAL_XPTS_DATA?.imported_at, DEFCON_LIVE?.captured, FDR?.captured]
        .map((value) => Date.parse(value))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
        .map((value) => new Date(value).toISOString())[0] || null,
    },
    {
      key: "lineups",
      name: "Predicted line-ups",
      detail: `GW${LINEUPS?.gameweek ?? "-"}`,
      iso: LINEUPS?.captured || null,
    },
    {
      key: "mine",
      name: "Your team and the template",
      detail: "no deploy needed",
      /* Read live rather than generated, so there is no file whose age could be reported. */
      iso: null,
    },
  ];

  const oldest = steps
    .map((step) => Date.parse(step.iso))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const overall = agoFrom(oldest ? new Date(oldest).toISOString() : null, now);

  async function run() {
    setPhase("running");
    setMessage(null);
    startedRef.current = Date.now();

    const listing = await fetch(`/api/update-data?since=${startedRef.current}`)
      .then((r) => r.json()).catch(() => null);
    if (!listing?.ok) { setPhase("failed"); setMessage("The update could not be started."); return; }
    if (!listing.configured) { setPhase("unavailable"); setMessage(listing.note); return; }

    const steps = listing.steps;
    setTotal(steps.length + 1);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      setStepIndex(index + 1);
      setMessage(step.label);

      // eslint-disable-next-line no-await-in-loop
      const started = await fetch("/api/update-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: step.key }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "The request could not be sent." }));

      if (!started?.ok) {
        setPhase("failed");
        setMessage(`${step.label}: ${started?.how_to_fix || started?.error || "could not be started"}`);
        return;
      }

      /* Wait for this one to finish before starting the next. Ten minutes is far longer than any of these
         jobs takes; it exists so a stuck run cannot leave the button spinning for ever. */
      const deadline = Date.now() + 600000;
      let settled = null;
      while (Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        // eslint-disable-next-line no-await-in-loop
        const poll = await fetch(`/api/update-data?since=${startedRef.current}`)
          .then((r) => r.json()).catch(() => null);
        const current = poll?.steps?.find((entry) => entry.key === step.key);
        if (current && current.status === "completed") { settled = current; break; }
      }

      if (!settled) {
        setPhase("failed");
        setMessage(`${step.label} is taking longer than expected. Check Actions on GitHub.`);
        return;
      }
      if (settled.conclusion !== "success") {
        setPhase("failed");
        setMessage(`${step.label} ${settled.conclusion}. Nothing after it was run, so the data is unchanged.`);
        return;
      }
    }

    setPhase("done");
    setMessage(null);
    /* Both of the things that need no deploy, done here so nothing is left for another button to catch.
       Neither can fail the update: the jobs have already run and committed, so a squad that could not be
       re-read is worth saying but is not a failed update. */
    setStepIndex(steps.length + 1);
    setMessage("Your team");
    try {
      const plans = await fetch("/api/plans").then((r) => r.json());
      /* From the saved plans, falling back to the known team so this never depends on a squad already
         being linked. The old button existed partly to make that first connection; with it gone, the
         chain has to be able to make it too. */
      const entryId = Number(plans?.live?.entry_id) || 4812;
      if (Number.isFinite(entryId) && entryId > 0) {
        const synced = await fetch("/api/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId }),
        }).then((r) => r.json());
        if (!synced?.ok || !synced.liveSquadWritten) {
          setMessage("Everything updated, but your live team could not be re-read.");
        }
      }
    } catch { setMessage("Everything updated, but your live team could not be re-read."); }

    /* The template is computed in the browser from live ownership, so it is the other thing that can be
       brought up to date without a deploy. */
    if (onFinished) { try { await onFinished(); } catch { /* the update itself still succeeded */ } }
  }

  const busy = phase === "running";
  /* The counter includes the two in-app steps at the end, so it never reads "3 of 3" while something is
     still happening. */
  const label = phase === "running" ? `UPDATING ${Math.min(stepIndex, total)}/${total}`
    : phase === "done" ? "UPDATED"
      : phase === "failed" ? "FAILED"
        : phase === "unavailable" ? "UNAVAILABLE"
          : "UPDATE DATA";

  const background = phase === "failed" || phase === "unavailable" ? T.pink
    : phase === "done" ? T.tag
      : T.green;
  const foreground = phase === "failed" || phase === "unavailable" ? "#FFFFFF"
    : phase === "done" ? T.onTag
      : "#04130A";

  return (
    <section data-zeus-feature="update-data-v1"
      style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
        padding: 14, borderRadius: S.radius, background: T.card, border: `1px solid ${T.line}` }}>

      <button type="button" onClick={run} disabled={busy || phase === "done"} className="fb-press"
        style={{ height: S.btn, padding: "0 26px", borderRadius: S.radiusSm, border: "none",
          background, cursor: busy || phase === "done" ? "default" : "pointer",
          ...lang(15, 700, foreground) }}>
        {label}
      </button>

      {phase === "done" ? (
        <span style={{ ...lang(13.5, 700, T.tag), textAlign: "center" }}>
          Updated. Refresh the page to see the new numbers.
        </span>
      ) : phase === "running" ? (
        <span style={{ ...lang(13, 600), textAlign: "center" }}>
          {message} · step {stepIndex} of {total}
        </span>
      ) : message ? (
        <span style={{ ...lang(13, 600, T.pink), textAlign: "center", maxWidth: 460 }}>{message}</span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          justifyContent: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: overall.stale ? T.pink : T.green }} />
          <span style={code(12, T.xp)}>DATA UPDATED</span>
          <span style={val(14, "#FFFFFF")}>{overall.label}</span>
        </span>
      )}

      {/* One row per step, numbered to match the counter on the button. While a run is going the rows
          show which one is working and which are still to come; the ages are what is on screen right now
          and cannot move until the page is reloaded, which the row says rather than leaving the reader
          watching an unchanging "3 days ago" and concluding nothing happened. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
        {steps.map((step, index) => {
          const position = index + 1;
          const state = phase === "running"
            ? (position < stepIndex ? "done" : position === stepIndex ? "running" : "waiting")
            : phase === "done" ? "done" : "idle";
          const age = agoFrom(step.iso, now);
          const dot = state === "done" ? T.tag
            : state === "running" ? T.green
              : state === "waiting" ? T.line
                : (step.iso === null ? T.line : (age.stale ? T.pink : T.green));
          return (
            <div key={step.key} className="zeus-update-row"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderRadius: S.radiusSm, background: T.plate,
                border: `1px solid ${state === "running" ? T.green : T.line}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: dot }} />
              <span style={code(12, T.xp)}>{position}</span>
              <span style={{ ...lang(12.5, 700), flex: 1, minWidth: 0 }}>{step.name}</span>
              <span className="zeus-update-detail" style={{ ...lang(12, 600), opacity: 0.6 }}>{step.detail}</span>
              <span style={{ ...lang(12, 600), opacity: 0.85, minWidth: 92, textAlign: "right" }}>
                {state === "running" ? "running…"
                  : state === "waiting" ? "waiting"
                    : phase === "done" ? "refresh to see"
                      : step.iso === null ? "live" : age.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
