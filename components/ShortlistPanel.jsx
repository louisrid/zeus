"use client";
import React from "react";
import { T, S, Kit, Label, lang, val } from "../lib/ui";

/* SHORTLIST AND EXCLUDED, visible on the pitch side of the Builder.
 *
 * Both lists were invisible: the only sign a player was excluded was the wording of a button inside a
 * modal. A list that changes what the auto-build does has to be on screen while the auto-build is used.
 * Empty lists say nothing rather than showing a heading over blank space.
 */
export default function ShortlistPanel({ maybes, ignored, onRemoveMaybe, onRemoveIgnore, xpOf }) {
  if (!maybes.length && !ignored.length) return null;

  const Row = ({ p, onRemove, tone }) => (
    <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) 52px 28px", gap: 8, alignItems: "center",
      height: 34, padding: "0 8px", borderRadius: 9, background: T.plate }}>
      <Kit team={p.team} size={18} />
      <span style={{ ...lang(13.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.web_name}
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <span style={val(13, tone)}>{xpOf && xpOf(p) !== null ? Number(xpOf(p)).toFixed(1) : Number(p.price).toFixed(1)}</span>
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
          <Label color={T.pink}>Excluded from auto-build · {ignored.length}</Label>
          {ignored.map((p) => <Row key={p.fpl_id} p={p} onRemove={onRemoveIgnore} tone={T.pink} />)}
        </div>
      )}
    </section>
  );
}
