"use client";
import React from "react";
import { buildFixtureOutlook } from "../lib/fixture-outlook.mjs";
import { T, S, Kit, Label, lang, val, code } from "../lib/ui";

const VIEWS = Object.freeze([
  Object.freeze({ key: "ATTACK", label: "EASIEST FOR ATTACK", tone: T.green }),
  Object.freeze({ key: "DEFENCE", label: "EASIEST FOR DEFENCE", tone: T.cyan }),
]);

const rangeLabel = (first, last) => {
  if (first === null || last === null) return null;
  return first === last ? `GW${first}` : `GW${first}-GW${last}`;
};

export default function FixtureOutlook({ core, scale, gameweeks = 5 }) {
  const [view, setView] = React.useState("ATTACK");
  const outlook = React.useMemo(() => buildFixtureOutlook({
    fixtures: core.fixtures,
    teamById: core.teamById,
    mode: view,
    gameweeks,
    scale,
  }), [core.fixtures, core.teamById, view, gameweeks, scale]);

  const active = VIEWS.find((item) => item.key === view) || VIEWS[0];
  const visible = outlook.rows.slice(0, 10);
  const windowLabel = rangeLabel(outlook.firstGw, outlook.lastGw);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {VIEWS.map((item) => {
          const selected = view === item.key;
          return (
            <button key={item.key} type="button" onClick={() => setView(item.key)} className="fb-press"
              aria-pressed={selected}
              style={{ height: S.ctrl, padding: "0 18px", borderRadius: S.radiusSm,
                background: selected ? item.tone : T.card,
                border: `1px solid ${selected ? item.tone : T.line}`,
                ...lang(14, 700, selected ? "#04130A" : "#FFFFFF") }}>
              {item.label}
            </button>
          );
        })}
        <span style={{ ...code(13), marginLeft: 6 }}>
          {windowLabel || `NEXT ${gameweeks} GAMEWEEKS`}
        </span>
        {outlook.basis && <span style={lang(13, 500)}>Using {outlook.basis}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <Label color={active.tone}>{active.label}</Label>
        {visible.length === 0 && (
          <span style={lang(13.5, 500)}>No upcoming fixtures found in the current gameweek window.</span>
        )}
        {visible.map(({ club, fixtures, ease }, index) => (
          <div key={club.id} style={{ display: "grid",
            gridTemplateColumns: "28px 24px minmax(72px, .55fr) minmax(260px, 2fr) 78px",
            gap: 10, alignItems: "center", minHeight: 52, padding: "7px 12px",
            borderRadius: S.radiusSm, background: T.row }}>
            <span style={val(13, "#FFFFFF", 500)}>{index + 1}</span>
            <Kit team={club.short_name} size={20} />
            <span style={{ ...lang(14, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {club.short_name || club.name}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              {fixtures.map((fixture) => (
                <span key={`${fixture.fixtureId ?? fixture.gw}-${fixture.oppId}`}
                  title={`${fixture.opp} ${fixture.home ? "home" : "away"}, ease ${fixture.ease}`}
                  style={{ display: "inline-flex", alignItems: "center", height: S.tag, padding: "0 8px",
                    borderRadius: 7, background: T.plate, border: `1px solid ${T.line}`,
                    ...lang(12.5, 700) }}>
                  GW{fixture.gw} {fixture.opp} {fixture.home ? "H" : "A"}
                </span>
              ))}
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <span style={code(11.5, active.tone)}>EASE</span>
              <span style={val(17, active.tone)}>{ease}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
