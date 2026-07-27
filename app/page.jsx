"use client";
import React from "react";
import Link from "next/link";
import { Hammer, Users, GitCompareArrows, BarChart3 } from "lucide-react";
import { T, D, S, Kit, Label, Plate, Card, POS_LABEL, SkeletonRows, Skeleton, ErrorCard, lang, code } from "../lib/ui";
import { loadCore, templateSquad, nextFixtures } from "../lib/data";
import Opp from "../components/Opp";
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
  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then(setCore).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (err) return <ErrorCard onRetry={load} />;

  const scale = core ? buildOpponentScale(core.teamById) : null;
  const oppOf = (p) => (core ? nextFixtures(core.fixtures, core.teamById, p.team_id, 1)[0] || null : null);
  const squad = core ? templateSquad(core.players) : null;
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
          {!squad ? <Skeleton h={520} /> : <Pitch squad={squad} scale={scale} oppOf={oppOf} />}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
          <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 28, textAlign: "center" }}>
            <Label color={T.green}>{dl ? `Gameweek ${dl.gw} deadline` : "Season start"}</Label>
            <div style={{ ...D, color: "#FFFFFF", fontSize: 84, lineHeight: 1, margin: "16px 0 6px" }}>
              {dl ? dl.days : ""}
            </div>
            <div style={lang(15)}>Days to go</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap }}>
        <Card eyebrow="Market" title="Most owned" accent={T.cyan}
          right={
            <Link href="/players" style={{ textDecoration: "none" }}>
              <span className="fb-press" style={{ display: "flex", alignItems: "center", height: S.btnSm, padding: "0 18px", borderRadius: S.radiusSm, background: T.row, ...lang(14, 700, T.cyan) }}>OPEN PLAYERS</span>
            </Link>
          }>
          {!core ? <SkeletonRows n={6} h={52} /> : (
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {mostOwned.map((p) => (
                  <div key={p.fpl_id} style={{ display: "flex", alignItems: "center", gap: 10, background: T.row, borderRadius: S.radiusSm, padding: "0 14px", height: 52 }}>
                    <Kit team={p.team} size={22} />
                    <span style={{ ...lang(S.name, 700), flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                    <span style={code()}>{p.team} · {POS_LABEL[p.position]}</span>
                    <Plate w={62}>{p.price.toFixed(1)}</Plate>
                    <Plate w={62}>{p.own.toFixed(0)}%</Plate>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        </div>

      <Card eyebrow="Fixtures" title="Easiest and hardest ahead" accent={T.green}>
          {!core || !scale ? <SkeletonRows n={6} h={52} /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: S.gap }}>
              {[["EASIEST", "asc", T.green], ["HARDEST", "desc", T.pink]].map(([kind, dir, colour]) => {
                /* Built on the same difficulty scale the fixture tags use, so this can never be empty while
                   fixtures exist. The old version returned nothing whenever one club's strength was missing. */
                const clubs = Object.values(core.teamById).map((t) => {
                  const fx = nextFixtures(core.fixtures, core.teamById, t.id, 3);
                  const ds = fx.map((f) => { const d = scale.difficultyOf(f.oppId, f.home); return d ? d.difficulty : null; })
                    .filter((x) => x !== null);
                  return ds.length >= 2 ? { t, fx, avg: ds.reduce((a, b) => a + b, 0) / ds.length } : null;
                }).filter(Boolean).sort((a, b) => (dir === "asc" ? a.avg - b.avg : b.avg - a.avg)).slice(0, 3);
                return (
                  <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Label color={colour}>{kind}</Label>
                    {clubs.map(({ t, fx }) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, height: 46,
                        padding: "0 12px", borderRadius: S.radiusSm, background: T.row }}>
                        <Kit team={t.short_name} size={20} />
                        <span style={{ ...lang(14.5, 700), flex: 1 }}>{t.short_name}</span>
                        {fx.map((f, i) => <Opp key={i} fx={f} scale={scale} size="sm" showNumber={false} />)}
                      </div>
                    ))}
                    {clubs.length === 0 && <span style={lang(13.5, 600)}>Fixtures not published yet.</span>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
    </div>
  );
}
