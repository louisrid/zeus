"use client";
import React from "react";
import Link from "next/link";
import { Hammer, Users, GitCompareArrows, BarChart3 } from "lucide-react";
import { T, D, S, Label, Card, SkeletonRows, Skeleton, ErrorCard, lang } from "../lib/ui";
import { loadCore, templateSquad, nextFixtures } from "../lib/data";
import { loadModel } from "../lib/projections";
import Opp from "../components/Opp";
import FixtureOutlook from "../components/FixtureOutlook";
import { buildOpponentScale } from "../lib/opponent";
import Pitch from "../components/Pitch";
import { DeadlineContext } from "../components/Shell";

// Each tile carries live state so it reports a reason to open it, not just a destination.
const TILE_DEFS = [
  ["Squad Builder", "/builder", Hammer, (c, drafts) => (drafts === null ? "Draft saving unavailable" : drafts === 0 ? "No draft saved yet" : `${drafts} draft${drafts === 1 ? "" : "s"} saved`)],
  ["Players", "/players", Users, (c) => (c ? `${c.players.length} players · ${c.flagged} flagged` : "Loading")],
  ["Compare", "/players?compare=1", GitCompareArrows, () => "Up to 3 side by side"],
  ["Analysis", "/analysis", BarChart3, () => "Model evidence and calibration"],
];

export default function Dashboard() {
  const [core, setCore] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const dl = React.useContext(DeadlineContext);
  const [draftCount, setDraftCount] = React.useState(0);
  React.useEffect(() => {
    fetch("/api/drafts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setDraftCount(d && Array.isArray(d.drafts) ? d.drafts.length : 0))
      .catch(() => setDraftCount(null));
  }, []);
  const [model, setModel] = React.useState(null);
  const load = React.useCallback(() => {
    setErr(false);
    /* The pitch shows xPTS rather than price, so the dashboard needs the model as well as the player list.
       It loads after the core, and the pitch shows a dash in the meantime rather than a wrong number. */
    loadCore()
      .then(async (c) => { setCore(c); try { setModel(await loadModel(c)); } catch { setModel(null); } })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (err) return <ErrorCard onRetry={load} />;

  const scale = core ? buildOpponentScale(core.teamById) : null;
  const oppOf = (p) => (core ? nextFixtures(core.fixtures, core.teamById, p.team_id, 1)[0] || null : null);
  const squad = core ? templateSquad(core.players) : null;
  const xpOf = model && model.scoreOf ? (p) => model.scoreOf(p) : null;
  const mostOwned = core ? core.players.slice(0, 6) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: S.gap, alignItems: "start" }}>
        <Card eyebrow="Pre-season" title="The template, most-owned XV" accent={T.green}
          right={
            <span style={{ display: "flex", gap: 9 }}>
              <Link href="/builder?from=template" style={{ textDecoration: "none" }}>
                <span className="fb-press" style={{ display: "flex", alignItems: "center", height: S.btnSm, padding: "0 16px", borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
                  EDIT THIS AS A DRAFT
                </span>
              </Link>
              <Link href="/builder" style={{ textDecoration: "none" }}>
                <span className="fb-press" style={{ display: "flex", alignItems: "center", height: S.btnSm, padding: "0 18px", borderRadius: S.radiusSm, background: T.green, ...lang(14, 700, "#04130A") }}>
                  START YOUR DRAFT
                </span>
              </Link>
            </span>
          }>
          {!squad ? <Skeleton h={520} /> : <Pitch squad={squad} scale={scale} oppOf={oppOf} xpOf={xpOf} />}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
          <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 28, textAlign: "center" }}>
            <Label color={T.green}>{dl ? `Gameweek ${dl.gw} deadline` : "Season start"}</Label>
            {dl ? (
              <>
                <div style={{ ...D, color: "#FFFFFF", fontSize: 84, lineHeight: 1, margin: "16px 0 6px" }}>
                  {dl.days}
                </div>
                <div style={lang(15)}>Days to go</div>
              </>
            ) : (
              <div style={{ ...lang(15, 500), marginTop: 14, lineHeight: 1.5 }}>
                Fixtures are not published yet.
              </div>
            )}
            {dl && (
              <div style={{ marginTop: 14 }}>
                <span style={lang(14.5)}>
                  {dl.date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })} · {dl.date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </section>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {TILE_DEFS.map(([name, href, Icon, subOf]) => {
              const sub = subOf(core ? { players: core.players, flagged: core.players.filter((p) => p.chance_of_playing !== null && p.chance_of_playing < 100).length } : null, draftCount);
              return (
              <Link key={name} href={href} style={{ textDecoration: "none" }}>
                <div className="fb-hover" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: "20px 18px", height: 132,
                  display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <Icon size={24} color={T.green} strokeWidth={2.4} />
                  <div>
                    <div style={lang(17, 700)}>{name}</div>
                    <div style={{ marginTop: 3, ...lang(13.5, 500) }}>{sub}</div>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        </div>
      </div>

      <Card eyebrow="Fixtures" title="Best and worst fixtures ahead" accent={T.green}>
        {!core || !scale
          ? <SkeletonRows n={10} h={44} />
          : <FixtureOutlook core={core} scale={scale} gameweeks={5} />}
      </Card>
    </div>
  );
}
