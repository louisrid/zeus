"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";

/* ONE STEPPER, USED WHEREVER A PITCH SHOWS A SINGLE GAMEWEEK.
 *
 * The Squad page and the Builder both let you walk through the weeks of a plan and each had drawn its own
 * control. They ended up different heights, different type, and only one of them said which range the
 * week belonged to, so the same action looked like two different features depending on the page. Neither
 * was wrong; they were just written separately, which is how a product stops feeling like one product.
 *
 * The range matters and is stated. "GW9" alone leaves the reader working out whether there are more weeks
 * to the left, and on a plan that spans half a season that is the first thing they want to know.
 */
export default function GameweekStepper({
  gw,
  from,
  to,
  onChange,
  note = null,
  className = "",
}) {
  const current = Number(gw);
  const first = Number(from);
  const last = Number(to);
  const atStart = !Number.isFinite(current) || current <= first;
  const atEnd = !Number.isFinite(current) || current >= last;

  const arrow = (disabled) => ({
    height: S.ctrl,
    width: S.ctrl,
    borderRadius: S.radiusSm,
    background: T.card,
    border: `1px solid ${T.line}`,
    opacity: disabled ? 0.4 : 1,
    /* Not a pointer when it cannot move: the first week of a range has nothing to its left, and a button
       that looks pressable and does nothing is worse than one that looks spent. */
    cursor: disabled ? "default" : "pointer",
    ...lang(15, 700),
  });

  return (
    <div className={className} data-zeus-feature="gameweek-stepper-v1"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="fb-press" aria-label="Previous gameweek"
        disabled={atStart}
        onClick={() => onChange(Math.max(first, current - 1))}
        style={arrow(atStart)}>‹</button>

      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: S.ctrl,
        padding: "0 14px", borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}` }}>
        <span style={code(12, T.xp)}>VIEWING</span>
        <span style={val(14.5, "#FFFFFF")}>GW{Number.isFinite(current) ? current : "-"}</span>
        {last > first && (
          <span style={{ ...lang(12.5, 600), opacity: 0.8 }}>of GW{first}-{last}</span>
        )}
      </span>

      <button type="button" className="fb-press" aria-label="Next gameweek"
        disabled={atEnd}
        onClick={() => onChange(Math.min(last, current + 1))}
        style={arrow(atEnd)}>›</button>

      {note && <span style={{ ...lang(12.5, 600), opacity: 0.8 }}>{note}</span>}
    </div>
  );
}
