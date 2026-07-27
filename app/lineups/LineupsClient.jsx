"use client";
import React from "react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { T, S, Skeleton, ErrorCard, Label, lang, val, code } from "../../lib/ui";
import BuilderPitch from "../../components/BuilderPitch";

/* PREDICTED LINE-UPS: two teams, side by side, on the same pitch the rest of the product uses.
 *
 * The minutes model is the only properly validated layer here, 81.1% start accuracy, so this is a view
 * over data that already exists rather than anything new.
 *
 * The eleven is the most likely starter in each position within a legal shape. The bench is the three
 * next most likely, because those are the players who would actually come on; a fourth-choice keeper is
 * noise, so anyone under 10% is not shown at all.
 */

const SHAPES = [[3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 3, 2], [5, 4, 1]];
const BENCH_MIN = 0.10;

function predict(players, startOf) {
  const ranked = [...players].sort((a, b) => (startOf(b) ?? 0) - (startOf(a) ?? 0));
  const gk = ranked.filter((p) => p.position === "GKP").slice(0, 1);

  /* Pick the shape whose most likely eleven is the most likely overall, rather than assuming one. */
  let best = null;
  for (const [d, m, f] of SHAPES) {
    const def = ranked.filter((p) => p.position === "DEF").slice(0, d);
    const mid = ranked.filter((p) => p.position === "MID").slice(0, m);
    const fwd = ranked.filter((p) => p.position === "FWD").slice(0, f);
    if (def.length < d || mid.length < m || fwd.length < f || !gk.length) continue;
    const xi = [...gk, ...def, ...mid, ...fwd];
    const total = xi.reduce((a, p) => a + (startOf(p) ?? 0), 0);
    if (!best || total > best.total) best = { total, xi, structure: `${d}-${m}-${f}` };
  }
  if (!best) return null;

  const inXi = new Set(best.xi.map((p) => p.fpl_id));
  const bench = ranked.filter((p) => !inXi.has(p.fpl_id) && (startOf(p) ?? 0) >= BENCH_MIN).slice(0, 3);
  return {
    structure: best.structure,
    players: [...best.xi.map((p) => ({ ...p, starting: true })), ...bench.map((p) => ({ ...p, starting: false }))],
    captain: null, vice: null,
  };
}

function TeamPanel({ label, teamId, onTeam, teams, core, scale, startOf }) {
  const players = React.useMemo(() => core.players.filter((p) => p.team_id === Number(teamId)), [core, teamId]);
  const squad = React.useMemo(() => predict(players, startOf), [players, startOf]);
  const fixture = nextFixtures(core.fixtures, core.teamById, Number(teamId), 1)[0] || null;
  const club = core.teamById[teamId];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Label color={T.green}>{label}</Label>
        <select value={teamId} onChange={(e) => onTeam(e.target.value)}
          style={{ height: 48, padding: "0 14px", borderRadius: S.radiusSm, background: T.card,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(16, 700), outline: "none", minWidth: 200 }}>
          {teams.map((t) => (
            <option key={t.id} value={t.id} style={{ background: T.card }}>{t.name || t.short_name}</option>
          ))}
        </select>
        {squad && <span style={val(15)}>{squad.structure}</span>}
      </div>

      {!squad ? (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 24 }}>
          <span style={{ ...lang(15, 600) }}>No minutes forecast for {club ? club.short_name : "this club"} yet.</span>
        </section>
      ) : (
        <BuilderPitch squad={squad} scoreOf={(p) => (startOf(p) === null ? null : Math.round(startOf(p) * 100))}
          metricName="START" showMetric oppOf={() => fixture} scale={scale}
          onSlotClick={() => {}} onOpenPlayer={() => {}} />
      )}
    </div>
  );
}

export default function LineupsClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [left, setLeft] = React.useState(null);
  const [right, setRight] = React.useState(null);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then((c) => { setCore(c); return loadModel(c).then(setModel); }).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const teams = React.useMemo(() => (core
    ? Object.values(core.teamById).sort((a, b) => (a.short_name || "").localeCompare(b.short_name || ""))
    : []), [core]);

  /* Arsenal on the left and Manchester City on the right by default, falling back to the first two clubs
     if either is not in the league that season. */
  React.useEffect(() => {
    if (!teams.length || left !== null) return;
    const find = (code) => teams.find((t) => t.short_name === code);
    setLeft(String((find("ARS") || teams[0]).id));
    setRight(String((find("MCI") || teams[1] || teams[0]).id));
  }, [teams, left]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const startOf = React.useCallback((p) => (model ? model.startProbOf(p) : null), [model]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || left === null || right === null) {
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap }}><Skeleton h={560} /><Skeleton h={560} /></div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: S.gap, alignItems: "start" }}>
      <TeamPanel label="Team one" teamId={left} onTeam={setLeft} teams={teams}
        core={core} scale={scale} startOf={startOf} />
      <TeamPanel label="Team two" teamId={right} onTeam={setRight} teams={teams}
        core={core} scale={scale} startOf={startOf} />
    </div>
  );
}
