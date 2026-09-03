"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";
import EXTERNAL_XPTS_DATA from "../config/external-xpts-2026-27.mjs";

/* WHEN THE NUMBERS WERE LAST TRUE.
 *
 * Every decision this app makes rests on xPTS, and until now nothing on any screen said how old they
 * were. A projection imported a week ago looks exactly like one imported an hour ago, so a squad could
 * be picked on figures that predate an injury, a transfer or a price change with nothing to warn about
 * it. The import date is in the config already; it simply was never shown.
 *
 * The button cannot import the numbers itself. That happens in GitHub Actions, which needs a token this
 * app does not have and should not be given: a page able to start a repository job from a browser would
 * be a far worse idea than a link out to it.
 */

const WORKFLOW_URL = "https://github.com/louisrid/zeus/actions/workflows/xpts-pull.yml";

/* Green until a day old, then pink. The source updates several times a week, so a few hours is
 * unremarkable and a full day means the schedule has stopped rather than the data being quiet. */
function ageOf(importedAt) {
  const then = Date.parse(importedAt);
  if (!Number.isFinite(then)) return { label: "unknown", hours: Infinity, tone: T.pink };
  const hours = (Date.now() - then) / 3600000;
  /* Two states, not three. The palette holds green and pink for this, and inventing a third colour here
     would put a fourth accent on the page for a middle ground that does not change what to do about it. */
  const tone = hours >= 24 ? T.pink : T.green;
  if (hours < 1) return { label: "just now", hours, tone };
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, hours, tone };
  const days = Math.floor(hours / 24);
  return { label: `${days} day${days === 1 ? "" : "s"} ago`, hours, tone };
}

export default function XptsFreshness({ compact = false }) {
  /* Rendered on the client so "3h ago" is measured against the reader's clock rather than the clock the
     page was built on, which for a statically rendered page could be days out on its own. */
  const [now, setNow] = React.useState(null);
  React.useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const importedAt = EXTERNAL_XPTS_DATA?.imported_at;
  const players = Number(EXTERNAL_XPTS_DATA?.player_count) || 0;
  const servedTo = Number(EXTERNAL_XPTS_DATA?.gw_served_to) || 0;
  const age = now === null ? { label: "…", tone: T.line } : ageOf(importedAt);

  const stamp = importedAt
    ? new Date(importedAt).toLocaleString(undefined, {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    })
    : "never";

  return (
    <span data-zeus-feature="xpts-freshness-v1"
      style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: compact ? "6px 10px" : "8px 12px", borderRadius: S.radiusSm,
        background: T.card, border: `1px solid ${T.line}` }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: age.tone, flexShrink: 0 }} />
      <span style={code(12, T.xp)}>xPTS UPDATED</span>
      <span style={val(compact ? 13 : 14.25, "#FFFFFF")}>{age.label}</span>
      {!compact && (
        <span style={{ ...lang(12.5, 600), opacity: 0.8 }}>
          {stamp} · {players} players · GW1-GW{servedTo}
        </span>
      )}
      <a href={WORKFLOW_URL} target="_blank" rel="noreferrer" className="fb-press"
        title="Opens the import job on GitHub, where it can be started by hand."
        style={{ height: 26, padding: "0 11px", borderRadius: 8, display: "inline-flex",
          alignItems: "center", background: T.green, textDecoration: "none",
          ...lang(12, 700, "#04130A") }}>
        REFRESH
      </a>
    </span>
  );
}
