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

  /* Published only. There is no modelled fallback: this page reports who the manager picks, and we do not
     have an opinion worth showing on that. */
  const squad = fromSource;
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
          <span style={{ ...code(13, T.green) }}>
            TEAM NEWS{squad.updated ? ` · ${squad.updated.toUpperCase()}` : ""}
          </span>
        )}
        {squad && squad.missing > 0 && (
          <span style={lang(13, 500)}>{squad.missing} not matched to a player</span>
        )}
      </div>

      {!squad ? (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 24,
          display: "flex", flexDirection: "column", gap: 10 }}>
          <Label color={T.pink}>Not loaded</Label>
          <span style={{ ...lang(15, 500), lineHeight: 1.55 }}>
            {published === null
              ? "Loading."
              : published.size === 0
                ? "No team news has loaded yet. Run lineups-pull in the Actions tab."
                : row
                  ? `Team news exists for ${club ? club.short_name : "this club"}, but too few of its players matched ours to draw the eleven.`
                  : `No team news for ${club ? club.short_name : "this club"} in the latest pull.`}
          </span>
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
