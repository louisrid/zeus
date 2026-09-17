"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";
import EXTERNAL_XPTS_DATA from "../config/external-xpts-2026-27.mjs";
import DEFCON_LIVE from "../config/defcon-live-2026-27.mjs";
import FDR from "../config/fdr-2026-27.mjs";
import LINEUPS from "../config/lineups.json" with { type: "json" };

/* ONE BUTTON, AND THE WORK HAPPENS SOMEWHERE ELSE.
 *
 * This component used to run the update: it dispatched a workflow, waited for it, dispatched the next,
 * and held the whole sequence in React state. A refresh of the data therefore depended on a tab staying
 * open, and every failure since has been the same failure wearing a different hat. Closing the site
 * stopped it halfway. Switching apps let the phone discard the page. Returning showed an idle button
 * while jobs were still running, so pressing it started the work twice.
 *
 * None of that is fixable from here, because the premise was wrong. The run belongs on the server, and
 * this is a window onto it.
 *
 *   Press it   one workflow starts, and does everything in order
 *   Close it   the run is unaffected; nothing here was holding it up
 *   Come back  the page asks what is happening and shows that
 *
 * There is nothing stored in the browser, because there is nothing worth storing: the only truthful
 * answer to "how far has it got" lives with the thing doing the work.
 */

const POLL_MS = 6000;

function agoFrom(iso, now) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then) || now === null) return { label: "unknown", stale: true };
  const minutes = (now - then) / 60000;
  if (minutes < 1) return { label: "just now", stale: false };
  if (minutes < 60) return { label: `${Math.floor(minutes)}m ago`, stale: false };
  const hours = minutes / 60;
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, stale: false };
  const days = Math.floor(hours / 24);
  return { label: `${days} day${days === 1 ? "" : "s"} ago`, stale: hours >= 36 };
}

export default function UpdateData({ onFinished = null }) {
  /* Measured in the browser so an age is against the reader's clock, not the clock the page was built
     on, which for a statically rendered page can be days out by itself. */
  const [now, setNow] = React.useState(null);
  React.useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const [state, setState] = React.useState(null);   // the last answer from the server
  const [pressing, setPressing] = React.useState(false);
  /* When the button was last pressed. For a short while after, the previous run's finished state is not
     shown as if it were news: it is the run before this one, and treating it as new is the flash of
     "updated, reload" that appears the instant the button is pressed. */
  const pressedAt = React.useRef(0);
  const [problem, setProblem] = React.useState(null);
  const finishedRef = React.useRef(false);

  const look = React.useCallback(async () => {
    try {
      const body = await fetch("/api/update-data", { cache: "no-store" }).then((r) => r.json());
      if (body?.ok) setState(body);
      return body;
    } catch { return null; }
  }, []);

  /* Asked on arrival and then while a run is going. Polling stops the moment it is not, so a finished
     update costs nothing to sit in front of. Returning to the tab asks immediately rather than waiting
     for the next tick, because the first thing anyone does on coming back is look. */
  React.useEffect(() => {
    let alive = true;
    let timer = null;

    const tick = async () => {
      if (!alive) return;
      const body = await look();
      if (!alive) return;
      if (body?.phase === "running") timer = setTimeout(tick, POLL_MS);
    };
    tick();

    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [look]);

  /* The template and the live squad are read in the browser, so they can be brought up to date the
     moment a run finishes rather than waiting for the next deploy. */
  React.useEffect(() => {
    if (state?.phase !== "done") { finishedRef.current = false; return; }
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (onFinished) { try { onFinished(); } catch { /* the update still succeeded */ } }
  }, [state?.phase, onFinished]);

  async function press() {
    setProblem(null);
    setPressing(true);
    pressedAt.current = Date.now();
    try {
      const body = await fetch("/api/update-data", { method: "POST" }).then((r) => r.json());
      if (!body?.ok) {
        setProblem(body?.how_to_fix || body?.error || "The update could not be started.");
      }
      /* Ask immediately so the counter moves on the press rather than on the next tick. GitHub takes a
         moment to register a dispatch, hence the second look. */
      await look();
      setTimeout(look, 2500);
    } catch {
      setProblem("The update could not be started.");
    } finally {
      setPressing(false);
    }
  }

  const phase = state?.phase || "idle";
  const running = phase === "running";
  const total = state?.total || 5;
  const current = Math.min(Math.max(state?.current || 1, 1), total);

  /* What each source on screen last said about itself. This is the data actually in the page, not a
     report of what the jobs believe they did, so after a successful run it still reads as it was until
     the deploy lands and the page is reloaded. */
  const sources = [
    ["Projections", EXTERNAL_XPTS_DATA?.imported_at],
    ["Defensive rates", DEFCON_LIVE?.captured],
    ["Fixture difficulty", FDR?.captured],
    ["Predicted line-ups", LINEUPS?.captured],
  ];
  const oldest = sources
    .map(([, iso]) => Date.parse(iso))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const overall = agoFrom(oldest ? new Date(oldest).toISOString() : null, now);

  /* IS THERE ANYTHING NEW TO SEE, OR NOT.
   *
   * "Reload to see new numbers" was shown whenever the last run had succeeded, which is almost always,
   * because a successful run stays the last run until the next one. So it said it on every visit, long
   * after the data had been deployed and was already on screen, and a message that is always there stops
   * being read at all.
   *
   * The honest question is whether the published data is newer than the data this page was built from.
   * The newest timestamp in the page is what it is showing; the run's finish time is what has been
   * published. Only when the second is later is there something to reload for. */
  const newestInPage = sources
    .map(([, iso]) => Date.parse(iso))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] || 0;
  const publishedAt = Date.parse(state?.finished_at || "");
  /* A run that finished before the button was pressed is the previous run, not this one. Without this
     the old run's "done" flashed as "new data, reload" for the seconds before GitHub registered the new
     run, then vanished when it did. */
  const finishedBeforePress = Number.isFinite(publishedAt) && publishedAt < pressedAt.current;
  const somethingNew = phase === "done" && Number.isFinite(publishedAt)
    && !finishedBeforePress && !pressing
    /* A minute of slack: the commit is written a moment after the data it carries, and a page built from
       that commit should not be told it is behind itself. */
    && publishedAt > newestInPage + 60000;

  const label = running ? `UPDATING ${current}/${total}`
    : pressing ? "STARTING"
      : phase === "done" ? "UPDATE DATA"
        : phase === "failed" ? "TRY AGAIN"
          : phase === "unavailable" ? "UNAVAILABLE"
            : "UPDATE DATA";

  const background = phase === "failed" || phase === "unavailable" ? T.pink : T.green;
  const foreground = phase === "failed" || phase === "unavailable" ? "#FFFFFF" : "#04130A";

  return (
    <section data-zeus-feature="update-data-v2"
      style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
        padding: 14, borderRadius: S.radius, background: T.card, border: `1px solid ${T.line}` }}>

      <button type="button" onClick={press} disabled={running || pressing || phase === "unavailable"}
        className="fb-press"
        style={{ height: S.btn, padding: "0 26px", borderRadius: S.radiusSm, border: "none",
          background, cursor: running || pressing ? "default" : "pointer", ...lang(15, 700, foreground) }}>
        {label}
      </button>

      {/* THE BAR MOVES WITH THE RUN.
          A counter is a fact; a bar is a feeling of movement, and a five-minute wait with a fact that
          changes four times is a wait that looks stuck. The bar fills to the step that has finished and
          shows the step in progress as a soft pulse across its own segment, so the eye can see something
          is happening even between counter changes. */}
      {(running || pressing) && (
        <div className="zeus-update-bar" aria-hidden="true"
          style={{ width: "100%", maxWidth: 520, height: 8, borderRadius: 8, background: T.plate,
            border: `1px solid ${T.line}`, overflow: "hidden", display: "flex" }}>
          {Array.from({ length: total }).map((_, index) => {
            const position = index + 1;
            const done = position < current;
            const active = position === current;
            return (
              <span key={position} className={active ? "zeus-update-bar-active" : undefined}
                style={{ flex: 1, background: done ? T.tag : active ? T.green : "transparent",
                  borderRight: position < total ? `1px solid ${T.line}` : "none" }} />
            );
          })}
        </div>
      )}

      {problem ? (
        <span style={{ ...lang(13, 600, T.pink), textAlign: "center", maxWidth: 460 }}>{problem}</span>
      ) : running ? (
        <span style={{ ...lang(13, 600), textAlign: "center" }}>
          {state.steps[current - 1]?.name} · step {current} of {total}. This keeps going if you close the
          page.
        </span>
      ) : phase === "failed" ? (
        <span style={{ ...lang(13, 600, T.pink), textAlign: "center", maxWidth: 460 }}>
          {state.failed_step ? `${state.failed_step} did not finish.` : "The update did not finish."}
          {" "}Nothing was published, so the data is unchanged. Press to run it again.
        </span>
      ) : somethingNew ? (
        <span style={{ ...lang(13, 700, T.tag), textAlign: "center" }}>
          New data was published {agoFrom(state.finished_at, now).label}. Reload to see it.
        </span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          justifyContent: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: overall.stale ? T.pink : T.green }} />
          <span style={code(12, T.xp)}>DATA UPDATED</span>
          <span style={val(14, "#FFFFFF")}>{overall.label}</span>
        </span>
      )}

      {/* One row per step of the run, in the order they happen, showing what each is doing right now. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
        {(state?.steps || [
          { name: "Prices, points and injury flags" },
          { name: "Projections, defensive rates and fixture difficulty" },
          { name: "Predicted line-ups" },
          { name: "Check the refreshed data" },
          { name: "Publish the update" },
        ]).map((step, index) => {
          const position = index + 1;
          const done = step.status === "completed" && step.conclusion === "success";
          const broke = step.status === "completed" && step.conclusion
            && step.conclusion !== "success" && step.conclusion !== "skipped";
          const active = step.status === "in_progress";
          const dot = broke ? T.pink : done ? T.tag : active ? T.green : T.line;
          return (
            <div key={step.name} className="zeus-update-row"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderRadius: S.radiusSm, background: T.plate,
                border: `1px solid ${active ? T.green : T.line}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: dot }} />
              <span style={code(12, T.xp)}>{position}</span>
              <span style={{ ...lang(12.5, 700), flex: 1, minWidth: 0 }}>{step.name}</span>
              <span style={{ ...lang(12, 600), opacity: 0.85, minWidth: 74, textAlign: "right" }}>
                {broke ? "failed" : done ? "done" : active ? "running" : "waiting"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
