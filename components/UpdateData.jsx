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

function agoFrom(iso, now) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then) || now === null) return { label: "unknown", stale: true };
  const hours = (now - then) / 3600000;
  if (hours < 1) return { label: "just now", stale: false };
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, stale: false };
  const days = Math.floor(hours / 24);
  return { label: `${days} day${days === 1 ? "" : "s"} ago`, stale: hours >= 36 };
}

export default function UpdateData() {
  /* Measured in the browser so "3 days ago" is against the reader's clock, not the clock the page was
     built on, which for a statically rendered page can be days out by itself. */
  const [now, setNow] = React.useState(null);
  React.useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [phase, setPhase] = React.useState("idle");   // idle | running | done | failed | unavailable
  const [stepIndex, setStepIndex] = React.useState(0);
  const [total, setTotal] = React.useState(4);
  const [message, setMessage] = React.useState(null);
  const startedRef = React.useRef(null);

  /* What each source last said about itself, read from the files the jobs write. This is the checklist:
     it is the data actually on screen, not a report of what the jobs believe they did. */
  const sources = [
    ["Projections", EXTERNAL_XPTS_DATA?.imported_at, `${EXTERNAL_XPTS_DATA?.player_count || 0} players`],
    ["Defensive rates", DEFCON_LIVE?.captured, `${(DEFCON_LIVE?.rows || []).length} players`],
    ["Fixture difficulty", FDR?.captured, `${Object.keys(FDR?.clubs || {}).length} clubs`],
    ["Predicted line-ups", LINEUPS?.captured, `GW${LINEUPS?.gameweek ?? "-"}`],
  ];

  const oldest = sources
    .map(([, iso]) => Date.parse(iso))
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
    setTotal(steps.length);

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
  }

  const busy = phase === "running";
  const label = phase === "running" ? `UPDATING ${stepIndex}/${total}`
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

      {/* The checklist. Each line is a file the jobs write, with the age of what is actually on screen, so
          a source that quietly stopped moving is visible rather than hidden behind one summary figure. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))",
        gap: 8, width: "100%" }}>
        {sources.map(([name, iso, detail]) => {
          const age = agoFrom(iso, now);
          return (
            <div key={name}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                borderRadius: S.radiusSm, background: T.plate, border: `1px solid ${T.line}` }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: age.stale ? T.pink : T.green }} />
              <span style={{ ...lang(12.5, 700), flex: 1, minWidth: 0 }}>{name}</span>
              <span style={{ ...lang(12, 600), opacity: 0.85 }}>{age.label}</span>
              <span style={{ ...lang(12, 600), opacity: 0.6 }}>{detail}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
