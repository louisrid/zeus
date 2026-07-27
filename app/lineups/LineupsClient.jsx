"use client";
import React from "react";
import { loadCore, nextFixtures, sb } from "../../lib/data";
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

const BENCH_MIN = 0.10;

function predict(players, startOf) {
  const prob = (p) => startOf(p) ?? 0;
  const gk = [...players].filter((p) => p.position === "GKP").sort((a, b) => prob(b) - prob(a))[0];
  if (!gk) return null;

  /* THE SHAPE IS READ OFF THE ELEVEN, NOT CHOSEN FOR IT.
   *
   * The previous version scored every legal formation by the summed start probability of its eleven and
   * kept the highest. That rewards whichever shape draws from the deepest part of a squad, and clubs carry
   * more midfielders than forwards, so 4-5-1 won almost every time regardless of who the club plays.
   *
   * The ten most likely outfield players ARE the predicted line-up. Their positions give the formation,
   * clamped to what the game allows, and any shortfall is filled by the next likeliest player in the
   * position that is short. */
  const outfield = players.filter((p) => p.position !== "GKP").sort((a, b) => prob(b) - prob(a));
  const picked = outfield.slice(0, 10);
  const count = (pos) => picked.filter((p) => p.position === pos).length;

  const LIMITS = { DEF: [3, 5], MID: [2, 5], FWD: [1, 3] };
  const want = {};
  for (const pos of ["DEF", "MID", "FWD"]) {
    want[pos] = Math.min(LIMITS[pos][1], Math.max(LIMITS[pos][0], count(pos)));
  }
  // Clamping can leave the eleven over or under ten outfield players; settle it on likelihood.
  let total = want.DEF + want.MID + want.FWD;
  while (total !== 10) {
    const order = ["MID", "DEF", "FWD"];
    let moved = false;
    for (const pos of order) {
      const [lo, hi] = LIMITS[pos];
      if (total > 10 && want[pos] > lo) { want[pos] -= 1; total -= 1; moved = true; break; }
      if (total < 10 && want[pos] < hi) { want[pos] += 1; total += 1; moved = true; break; }
    }
    if (!moved) break;
  }

  const xi = [gk];
  for (const pos of ["DEF", "MID", "FWD"]) {
    xi.push(...outfield.filter((p) => p.position === pos).slice(0, want[pos]));
  }
  if (xi.length < 11) return null;

  const inXi = new Set(xi.map((p) => p.fpl_id));
  const bench = outfield.filter((p) => !inXi.has(p.fpl_id) && prob(p) >= BENCH_MIN).slice(0, 3);
  return {
    structure: `${want.DEF}-${want.MID}-${want.FWD}`,
    players: [...xi.map((p) => ({ ...p, starting: true })), ...bench.map((p) => ({ ...p, starting: false }))],
    captain: null, vice: null,
  };
}

function TeamPanel({ label, teamId, onTeam, teams, core, scale, startOf, published }) {
  const players = React.useMemo(() => core.players.filter((p) => p.team_id === Number(teamId)), [core, teamId]);
  const row = published ? published.get(Number(teamId)) : null;

  /* A published eleven is reporting; our minutes model is a forecast. Reporting wins where it exists, and
     the screen always says which one is being shown so the two are never confused. */
  const fromSource = React.useMemo(() => {
    if (!row || !Array.isArray(row.starters) || row.starters.length < 11) return null;
    const byId = new Map(players.map((p) => [p.fpl_id, p]));
    const take = (list, starting) => (list || [])
      .map((r) => { const p = r.fpl_id ? byId.get(r.fpl_id) : null; return p ? { ...p, starting } : null; })
      .filter(Boolean);
    const xi = take(row.starters, true);
    if (xi.length < 9) return null;   // too few matched to draw a credible eleven
    return {
      structure: row.formation || "4-4-2",
      players: [...xi, ...take(row.bench, false).slice(0, 3)],
      captain: null, vice: null,
      source: "published", fixture: row.fixture, updated: row.source_updated,
      missing: row.starters.length - xi.length,
    };
  }, [row, players]);

  const modelled = React.useMemo(() => predict(players, startOf), [players, startOf]);
  const squad = fromSource || (modelled ? { ...modelled, source: "model" } : null);
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
        {squad && (
          <span style={{ ...code(13, squad.source === "published" ? T.green : "#FFFFFF") }}>
            {squad.source === "published"
              ? `TEAM NEWS${squad.updated ? ` · ${squad.updated.toUpperCase()}` : ""}`
              : "OUR MINUTES MODEL"}
          </span>
        )}
        {squad && squad.source === "published" && squad.missing > 0 && (
          <span style={lang(13, 500)}>{squad.missing} not matched to a player</span>
        )}
      </div>

      {!squad ? (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 24 }}>
          <span style={{ ...lang(15, 600) }}>No minutes forecast for {club ? club.short_name : "this club"} yet.</span>
        </section>
      ) : (
        <BuilderPitch squad={squad} scoreOf={(p) => (startOf(p) === null ? null : Math.round(startOf(p) * 100))}
          metricName="START" showMetric showBudget={false} oppOf={() => fixture} scale={scale}
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
  // Published line-ups, keyed by our club id. Empty until the pull succeeds.
  const [published, setPublished] = React.useState(null);
  const [right, setRight] = React.useState(null);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then((c) => { setCore(c); return loadModel(c).then(setModel); }).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    sb().from("predicted_lineups").select("fpl_team_id, formation, fixture, source_updated, starters, bench")
      .then(({ data }) => {
        const byTeam = new Map();
        for (const r of data || []) if (r.fpl_team_id) byTeam.set(Number(r.fpl_team_id), r);
        setPublished(byTeam);
      })
      .catch(() => setPublished(new Map()));
  }, []);

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
