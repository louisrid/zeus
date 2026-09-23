"use client";
import React from "react";
import { T, S, Kit, Label, lang, val } from "../lib/ui";
import { usePersistentState } from "../lib/use-persistent-state";

/* SHORTLIST AND EXCLUDED, visible on the pitch side of the Builder.
 *
 * Both lists were invisible: the only sign a player was excluded was the wording of a button inside a
 * modal. A list that changes what the auto-build does has to be on screen while the auto-build is used.
 * Empty lists say nothing rather than showing a heading over blank space.
 */
export default function ShortlistPanel({ maybes, ignored, onRemoveMaybe, onRemoveIgnore, xpOf }) {
  const [showIgnored, setShowIgnored] = usePersistentState("builder.showIgnored", false);
  if (!maybes.length && !ignored.length) return null;

  const Row = ({ p, onRemove, tone }) => (
    <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) 52px 28px", gap: 8, alignItems: "center",
      height: S.ctrl, padding: "0 8px", borderRadius: 8, background: T.plate }}>
      <Kit team={p.team} size={18} />
      <span style={{ ...lang(13.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.web_name}
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        {/* xPTS or nothing. Falling back to price put two different quantities in one column with no way to tell
            which you were looking at. */}
        <span style={val(13, tone)}>{xpOf && xpOf(p) !== null && xpOf(p) !== undefined ? Number(xpOf(p)).toFixed(1) : "-"}</span>
      </span>
      <button onClick={() => onRemove(p)} className="fb-press"
        style={{ width: 24, height: 24, borderRadius: S.radiusSm, background: T.card, ...lang(13, 700) }}
        aria-label={`Remove ${p.web_name}`}>×</button>
    </div>
  );

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius,
      padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {maybes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <Label color={T.cyan}>Shortlist · {maybes.length}</Label>
          {maybes.map((p) => <Row key={p.fpl_id} p={p} onRemove={onRemoveMaybe} tone={T.cyan} />)}
        </div>
      )}
      {ignored.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {/* COLLAPSED BY DEFAULT.
              Twenty-two exclusions is a screen and a half of names between the controls and the pitch,
              and it is a list you set once and rarely re-read. The header keeps the count, the chevron
              opens it, and the state is remembered so it stays how you left it. */}
          <button type="button" onClick={() => setShowIgnored((value) => !value)}
            aria-expanded={showIgnored} className="fb-press"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
            <Label color={T.pink}>Excluded from auto-build · {ignored.length}</Label>
            <span aria-hidden="true" style={{ ...lang(13, 700, T.pink), display: "inline-flex", alignItems: "center", gap: 6 }}>
              {showIgnored ? "HIDE" : "SHOW"}
              <span style={{ display: "inline-block", transition: "transform 160ms", transform: showIgnored ? "rotate(180deg)" : "none" }}>⌄</span>
            </span>
          </button>
          {showIgnored && ignored.map((p) => <Row key={p.fpl_id} p={p} onRemove={onRemoveIgnore} tone={T.pink} />)}
        </div>
      )}
    </section>
  );
}
