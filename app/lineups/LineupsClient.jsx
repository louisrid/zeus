"use client";
import React from "react";
import Link from "next/link";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { T, S, Kit, Label, Skeleton, ErrorCard, lang, val, code } from "../../lib/ui";
import Opp from "../../components/Opp";

/* PREDICTED LINE-UPS.
 *
 * The minutes model is the only layer in this product that has been properly validated: 81.1% start
 * accuracy and a Brier score of 0.125 against 0.202 for the league base rate. It already runs for every
 * player, and until now its output was only visible as a Start % column.
 *
 * This page is a read-only view over data that already exists. No new modelling, and deliberately so:
 * it shows what the model believes about who plays, which is the single biggest pre-season edge, and
 * where it is uncertain it says so rather than picking an eleven and looking confident.
 */

const POS_ORDER = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
const CERTAIN = 0.8;    // above this, the model is confident he starts
const CONTESTED = 0.35; // between these two, the place is genuinely in question

function ClubCard({ club, players, fixture, scale, startOf, minsOf }) {
  const ranked = [...players].sort((a, b) => (startOf(b) ?? 0) - (startOf(a) ?? 0));
  const eleven = [];
  const byPos = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  // A plausible eleven: the most likely starter in each position, respecting a legal shape.
  const caps = { GKP: 1, DEF: 5, MID: 5, FWD: 3 };
  for (const p of ranked) {
    if (eleven.length >= 11) break;
    if (byPos[p.position] >= caps[p.position]) continue;
    eleven.push(p); byPos[p.position] += 1;
  }
  eleven.sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position]);

  const contested = ranked.filter((p) => {
    const s = startOf(p);
    return s !== null && s > CONTESTED && s < CERTAIN && !eleven.includes(p);
  }).slice(0, 4);

  const flagged = players.filter((p) => p.status && p.status !== "a").slice(0, 4);

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
      display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Kit team={club.short_name} size={22} />
        <span style={{ ...lang(17, 700) }}>{club.short_name}</span>
        <span style={{ marginLeft: "auto" }}><Opp fx={fixture} scale={scale} size="sm" showNumber={false} /></span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {eleven.map((p) => {
          const s = startOf(p);
          const mins = minsOf(p);
          return (
            <Link key={p.fpl_id} href={`/player/${p.fpl_id}`}
              style={{ textDecoration: "none", color: "inherit" }}>
              <div className="fb-hover" style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 54px 54px",
                gap: 8, alignItems: "center", height: 34, padding: "0 9px", borderRadius: 8, background: T.row }}>
                <span style={code(13)}>{p.position === "GKP" ? "GK" : p.position}</span>
                <span style={{ ...lang(13.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.web_name}
                </span>
                <span style={{ display: "flex", justifyContent: "center" }}>
                  <span style={val(13, s !== null && s >= CERTAIN ? T.green : "#FFFFFF")}>
                    {s === null ? "—" : `${Math.round(s * 100)}%`}
                  </span>
                </span>
                <span style={{ display: "flex", justifyContent: "center" }}>
                  <span style={val(13, "#FFFFFF", 500)}>{mins === null ? "—" : `${Math.round(mins)}'`}</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {contested.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Label color={T.cyan}>Also in contention</Label>
          <span style={{ ...lang(13, 600), lineHeight: 1.5 }}>
            {contested.map((p) => `${p.web_name} ${Math.round((startOf(p) ?? 0) * 100)}%`).join(" · ")}
          </span>
        </div>
      )}

      {flagged.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Label color={T.pink}>Flagged</Label>
          <span style={{ ...lang(13, 600), lineHeight: 1.5 }}>
            {flagged.map((p) => `${p.web_name}${p.chance_of_playing !== null ? ` ${p.chance_of_playing}%` : ""}`).join(" · ")}
          </span>
        </div>
      )}
    </section>
  );
}

export default function LineupsClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [q, setQ] = React.useState("");

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then((c) => { setCore(c); return loadModel(c).then(setModel); })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);

  const startOf = React.useCallback((p) => (model ? model.startProbOf(p) : null), [model]);
  const minsOf = React.useCallback((p) => {
    if (!model || !model.minutesForecasts) return null;
    const m = model.minutesForecasts.get(p.fpl_id);
    if (!m) return null;
    const start = Number(m.p_start) || 0, cameo = Number(m.p_cameo) || 0;
    const v = start * (Number(m.exp_min_start) || 0) + cameo * (Number(m.exp_min_cameo) || 0);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [model]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: S.gap }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={380} />)}
      </div>
    );
  }

  const clubs = Object.values(core.teamById)
    .filter((t) => !q || (t.short_name + " " + (t.name || "")).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.short_name || "").localeCompare(b.short_name || ""));


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <section style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search club"
          style={{ height: 44, minWidth: 260, padding: "0 16px", borderRadius: 12, background: T.card,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(14.5, 600), outline: "none" }} />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: S.gap, alignItems: "start" }}>
        {clubs.map((club) => {
          const players = core.players.filter((p) => p.team_id === club.id);
          if (!players.length) return null;
          const fixture = nextFixtures(core.fixtures, core.teamById, club.id, 1)[0] || null;
          return (
            <ClubCard key={club.id} club={club} players={players} fixture={fixture} scale={scale}
              startOf={startOf} minsOf={minsOf} />
          );
        })}
      </div>
    </div>
  );
}
