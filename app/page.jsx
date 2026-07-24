"use client";
import React from "react";
import Link from "next/link";
import { Hammer, Users, GitCompareArrows, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { T, FB, FN, FNW, D, S, Kit, Label, Plate, Card, Donut, POS_LABEL, SkeletonRows, Skeleton, ErrorCard } from "../lib/ui";
import { loadCore, templateSquad, fixtureSwings } from "../lib/data";
import Pitch from "../components/Pitch";
import { DeadlineContext } from "../components/Shell";

const TILES = [
  ["Squad Builder", "Build your GW1 squad", "/builder", Hammer],
  ["Players", "The full live database", "/players", Users],
  ["Compare", "2–3 players side by side", "/players?compare=1", GitCompareArrows],
  ["Analysis", "The evidence base", "/analysis", BarChart3],
];

export default function Dashboard() {
  const [core, setCore] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const dl = React.useContext(DeadlineContext);
  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then(setCore).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (err) return <ErrorCard onRetry={load} />;

  const squad = core ? templateSquad(core.players) : null;
  const swings = core ? fixtureSwings(core.fixtures, core.teamById, core.currentGw) : null;
  const mostOwned = core ? core.players.slice(0, 6) : [];
  const top10Own = core ? core.players.slice(0, 10).reduce((s, p) => s + p.own, 0) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: S.gap, alignItems: "start" }}>
        <Card eyebrow="Pre-season" title="The template — most-owned XV" accent={T.green}
          right={
            <Link href="/builder" style={{ textDecoration: "none" }}>
              <span className="fb-press" style={{ display: "flex", alignItems: "center", height: S.btnSm, padding: "0 18px", borderRadius: 999, background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14, fontWeight: 700 }}>
                START YOUR DRAFT
              </span>
            </Link>
          }>
          {!squad ? <Skeleton h={520} /> : (
            <>
              <Pitch squad={squad} footer="YOUR DRAFT REPLACES THIS THE MOMENT YOU SAVE ONE" />
              <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                THE 15 MOST-OWNED PLAYERS BY POSITION, ARRANGED AS THE FIELD PLAYS THEM · ⚠ = FLAGGED
              </div>
            </>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
          <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 28, textAlign: "center" }}>
            <Label color={T.green}>{dl ? `Gameweek ${dl.gw} deadline` : "Season start"}</Label>
            <div style={{ ...D, color: "#FFFFFF", fontSize: 84, lineHeight: 1, margin: "16px 0 6px" }}>
              {dl ? dl.days : "—"}
            </div>
            <div style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 14, letterSpacing: "0.14em" }}>DAYS TO GO</div>
            {dl && (
              <div style={{ marginTop: 14, display: "inline-flex" }}>
                <Plate h={S.plate} bg={T.bgRaise}>
                  {dl.date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()} · {dl.date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </Plate>
              </div>
            )}
          </section>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {TILES.map(([name, sub, href, Icon]) => (
              <Link key={name} href={href} style={{ textDecoration: "none" }}>
                <div className="fb-hover" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: "20px 18px", height: 132,
                  display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <Icon size={24} color={T.green} strokeWidth={2.4} />
                  <div>
                    <div style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 17, fontWeight: 700 }}>{name}</div>
                    <div style={{ marginTop: 3, color: T.faint, fontFamily: FB, fontSize: 13.5, fontWeight: 600 }}>{sub}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap }}>
        <Card eyebrow="Market" title="Most owned" accent={T.cyan}
          right={
            <Link href="/players" style={{ textDecoration: "none" }}>
              <span className="fb-press" style={{ display: "flex", alignItems: "center", height: S.btnSm, padding: "0 18px", borderRadius: 999, background: T.bgRaise, color: T.cyan, fontFamily: FB, fontSize: 14, fontWeight: 700 }}>OPEN PLAYERS</span>
            </Link>
          }>
          {!core ? <SkeletonRows n={6} h={52} /> : (
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {mostOwned.map((p) => (
                  <div key={p.fpl_id} style={{ display: "flex", alignItems: "center", gap: 10, background: T.bgRaise, borderRadius: S.radiusSm, padding: "0 14px", height: 52 }}>
                    <Kit team={p.team} size={22} />
                    <span style={{ color: "#FFFFFF", fontFamily: FB, fontSize: S.name, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                    <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{p.team} · {POS_LABEL[p.position]}</span>
                    {p.own >= 40 && <span style={{ display: "flex", alignItems: "center", height: 24, padding: "0 9px", borderRadius: 999, background: T.tag, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1 }}>TEMPLATE</span>}
                    <Plate w={62} color={T.dim}>£{p.price.toFixed(1)}</Plate>
                    <Plate w={62}>{p.own.toFixed(0)}%</Plate>
                  </div>
                ))}
              </div>
              <div style={{ paddingTop: 4 }}>
                <Donut value={top10Own} total={1000} label="TOP 10" sub={"SHARE OF ALL OWNERSHIP\nHELD BY THE TOP 10"} color={T.cyan} />
              </div>
            </div>
          )}
        </Card>

        <Card eyebrow="Fixture swings · interim" title="Runs opening up" accent={T.pink}
          right={<Plate h={S.chip} bg={T.bgRaise} color={T.faint}>ODDS-IMPLIED VERSION LANDS WITH THE ODDS PIPELINE</Plate>}>
          {!core ? <SkeletonRows n={6} h={52} /> : !swings ? (
            <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5, lineHeight: 1.7 }}>
              TEAM STRENGTHS ARRIVE ON THE NEXT DATA REFRESH — RUN THE FPL-PULL ACTION ONCE AFTER THIS UPLOAD
            </div>
          ) : (
            <>
              {[["EASING", swings.easing, T.green, TrendingUp], ["BRUTAL", swings.brutal, T.pink, TrendingDown]].map(([kind, rows, color, Icon]) => (
                <React.Fragment key={kind}>
                  {rows.map((r) => (
                    <div key={kind + r.team} style={{ display: "flex", alignItems: "center", gap: 12, background: T.bgRaise, borderRadius: S.radiusSm, padding: "0 14px", height: 52 }}>
                      <span style={{ ...D, color: "#FFFFFF", fontSize: 15, width: 52 }}>{r.team}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: 999,
                        background: kind === "EASING" ? "#06331D" : "#3A0217", color, fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1 }}>
                        <Icon size={13} /> {kind}
                      </span>
                      <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                        {r.next.map((f, i) => (
                          <Plate key={i} h={S.chip} bg="#0D0014" color={T.dim}>{f.home ? f.opp : f.opp.toLowerCase()}</Plate>
                        ))}
                      </span>
                    </div>
                  ))}
                </React.Fragment>
              ))}
              <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                NEXT 5 FIXTURES BY FPL TEAM STRENGTH · UPPERCASE = HOME
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
