"use client";
import React from "react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { metricName } from "../../lib/solver/score.mjs";
import { T, S, Kit, Label, Skeleton, ErrorCard, WarnFlag, lang, val, code } from "../../lib/ui";
import Opp from "../../components/Opp";
import LINEUPS from "../../config/lineups.json";

/* PREDICTED LINE-UPS.
 *
 * The data is a checked-in file, transcribed from Fantasy Football Pundit's published pitch graphics.
 * A scrape was built and failed three times: the site challenges automated requests and answers a server
 * with a 202 and an empty body. A file that is right beats a job that does not run.
 *
 * The rows are drawn exactly as the source draws them, back to front, so a 4-2-3-1 renders as four, two,
 * three, one and a 3-4-3 renders as three, four, three. Nothing here derives a shape or picks an eleven:
 * that is what produced twenty identical 4-5-1s from a model with no pre-season signal.
 *
 * Names are matched to our player list for the shirt colour, price and xPTS. An unmatched name still
 * renders, with the name the source used, because the line-up is the point and a gap would be worse.
 */

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/* Surname first, then a containment check. Deliberately no fuzzy guessing: a wrong player is worse than
   an unmatched one, and an unmatched one still shows the source's name. */
function findPlayer(name, pool) {
  const n = norm(name);
  if (!n) return null;
  const last = n.split(" ").pop();
  return pool.find((p) => norm(p.web_name) === n)
    || pool.find((p) => norm(p.web_name) === last)
    || pool.find((p) => norm(p.name) === n)
    || pool.find((p) => norm(p.name).split(" ").pop() === last)
    || pool.find((p) => { const w = norm(p.web_name); return w.length > 3 && n.includes(w); })
    || null;
}

function Shirt({ name, player, short, xp, metric }) {
  const flagged = player && player.status && player.status !== "a";
  return (
    <div style={{ width: 92, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <Kit team={player ? player.team : short} size={40} />
      <span style={{ display: "flex", alignItems: "center", gap: 4, background: T.plate,
        borderRadius: S.radiusSm, padding: "3px 7px", maxWidth: "100%" }}>
        {flagged && <WarnFlag size={13} />}
        <span style={{ ...lang(13, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {player ? player.web_name : name}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {player && <span style={val(13, "#FFFFFF", 500)}>{Number(player.price).toFixed(1)}</span>}
        {xp !== null && xp !== undefined && <span style={val(13, T.xp)}>{Number(xp).toFixed(1)}</span>}
      </span>
      {!player && <span style={code(12)}>NOT IN FPL</span>}
    </div>
  );
}

function TeamPanel({ label, short, onTeam, core, scale, xpOf }) {
  const row = LINEUPS.clubs.find((c) => c.short === short) || LINEUPS.clubs[0];
  const club = Object.values(core.teamById).find((t) => t.short_name === row.short);
  const pool = React.useMemo(() => (club
    ? core.players.filter((p) => p.team_id === club.id)
    : []), [core, club]);

  const resolved = React.useMemo(() => row.rows.map((line) => line.map((name) => ({
    name, player: findPlayer(name, pool),
  }))), [row, pool]);

  const matched = resolved.flat().filter((x) => x.player).length;
  const shape = row.rows.slice(1).map((r) => r.length).join("-");
  const fixture = club ? nextFixtures(core.fixtures, core.teamById, club.id, 1)[0] : null;
  const xi = resolved.flat().map((x) => x.player).filter(Boolean);
  const total = xi.reduce((a, p) => a + (xpOf(p) ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Label color={T.green}>{label}</Label>
        <select value={short} onChange={(e) => onTeam(e.target.value)}
          style={{ height: 48, padding: "0 14px", borderRadius: S.radiusSm, background: T.card,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(16, 700), outline: "none", minWidth: 210 }}>
          {LINEUPS.clubs.map((c) => (
            <option key={c.short} value={c.short} style={{ background: T.card }}>{c.club}</option>
          ))}
        </select>
        <span style={val(15)}>{shape}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={code(13, T.green)}>TEAM NEWS · {String(row.updated).toUpperCase()}</span>
        <span style={{ ...lang(13.5, 500) }}>{row.fixture}</span>
        {fixture && <Opp fx={fixture} scale={scale} size="sm" showNumber={false} />}
      </div>

      <section style={{ position: "relative", background: "linear-gradient(180deg,#0E4023,#0A2E19)",
        border: `1px solid ${T.line}`, borderRadius: S.radius, padding: "18px 12px",
        display: "flex", flexDirection: "column-reverse", justifyContent: "space-between",
        gap: 14, minHeight: 520 }}>
        <span style={{ position: "absolute", top: 12, left: 14, zIndex: 2, display: "flex",
          alignItems: "center", gap: 6, background: "rgba(6,0,12,0.82)", borderRadius: S.radiusSm,
          padding: "5px 10px" }}>
          <span style={code(13)}>{metricName(true)}</span>
          <span style={val(15, T.xp)}>{total.toFixed(1)}</span>
        </span>
        {resolved.map((line, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            {line.map((x) => (
              <Shirt key={x.name} name={x.name} player={x.player} short={row.short}
                xp={x.player ? xpOf(x.player) : null} />
            ))}
          </div>
        ))}
      </section>

      {matched < 11 && (
        <span style={{ ...lang(13, 500) }}>{11 - matched} not in the FPL list yet.</span>
      )}
    </div>
  );
}

export default function LineupsClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [left, setLeft] = React.useState("ARS");
  const [right, setRight] = React.useState("MCI");

  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then((c) => { setCore(c); return loadModel(c).then(setModel); }).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const xpOf = React.useCallback((p) => (model ? model.scoreOf(p) : null), [model]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model) {
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap }}><Skeleton h={560} /><Skeleton h={560} /></div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))",
      gap: S.gap, alignItems: "start" }}>
      <TeamPanel label="Team one" short={left} onTeam={setLeft} core={core} scale={scale} xpOf={xpOf} />
      <TeamPanel label="Team two" short={right} onTeam={setRight} core={core} scale={scale} xpOf={xpOf} />
    </div>
  );
}
