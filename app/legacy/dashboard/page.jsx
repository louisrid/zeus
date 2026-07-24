"use client";
import React from "react";
import Link from "next/link";
import { T, FB, FN, FNW, Kit, Label, Plate, Card, Donut, POS_LABEL } from "../_lib/ui";
import { loadCore, nextFixtures, fixLabel } from "../_lib/data";

export default function Dashboard() {
  const [core, setCore] = React.useState(null);
  const [beats, setBeats] = React.useState([]);
  React.useEffect(() => {
    loadCore().then(setCore);
    import("../_lib/data").then(({ sb }) =>
      sb().from("pipeline_heartbeats").select("*").order("job_name").then(({ data }) => setBeats(data || []))
    );
  }, []);

  if (!core) return <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 13, paddingTop: 24 }}>LOADING LIVE DATA…</div>;
  const { players, teamById, fixtures, currentGw } = core;

  const mostOwned = players.slice(0, 8);
  const priciest = [...players].sort((a, b) => b.price - a.price).slice(0, 8);
  const top10Own = players.slice(0, 10).reduce((s, p) => s + p.own, 0);
  const gwFixtures = fixtures.filter((f) => f.gw === currentGw).slice(0, 10);

  const Row = ({ p, plate1, plate2 }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.bgRaise, borderRadius: 12, padding: "0 12px", height: 46 }}>
      <Kit team={p.team} size={20} />
      <span style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14.5, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
      <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · {POS_LABEL[p.position]}</span>
      {p.own >= 40 && (
        <span style={{ display: "flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, background: T.tag, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1 }}>TEMPLATE</span>
      )}
      {plate1}{plate2}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Card eyebrow={`Gameweek ${currentGw}`} title="Opening fixtures" accent={T.green}>
        {gwFixtures.length === 0 && <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>FIXTURES NOT PUBLISHED YET</div>}
        {gwFixtures.map((f, i) => {
          const h = teamById[f.home_team], a = teamById[f.away_team];
          const ko = f.kickoff_utc ? new Date(f.kickoff_utc) : null;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: T.bgRaise, borderRadius: 12, padding: "0 12px", height: 44 }}>
              <Kit team={h?.short_name} size={19} />
              <span style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, width: 44 }}>{h?.short_name}</span>
              <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>vs</span>
              <span style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, width: 44, textAlign: "right" }}>{a?.short_name}</span>
              <Kit team={a?.short_name} size={19} />
              <span style={{ marginLeft: "auto" }}>
                <Plate h={28} bg="#0D0014" color={T.dim}>
                  {ko ? ko.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase() + " " + ko.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "TBC"}
                </Plate>
              </span>
            </div>
          );
        })}
      </Card>

      <Card eyebrow="Market" title="Most owned" accent={T.cyan}
        right={
          <Link href="/players" style={{ textDecoration: "none" }}>
            <span style={{ display: "flex", alignItems: "center", height: 36, padding: "0 16px", borderRadius: 999, background: T.bgRaise, color: T.cyan, fontFamily: FB, fontSize: 13, fontWeight: 700 }}>OPEN PLAYERS</span>
          </Link>
        }>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {mostOwned.map((p) => (
              <Row key={p.fpl_id} p={p}
                plate1={<Plate w={56} color={T.dim}>£{p.price.toFixed(1)}</Plate>}
                plate2={<Plate w={56}>{p.own.toFixed(0)}%</Plate>} />
            ))}
          </div>
          <div style={{ paddingTop: 8 }}>
            <Donut value={top10Own} total={1000} label="TOP 10" sub={"SHARE OF ALL OWNERSHIP\nHELD BY THE TOP 10"} color={T.cyan} />
          </div>
        </div>
      </Card>

      <Card eyebrow="Market" title="Price board" accent={T.green}>
        {priciest.map((p) => (
          <Row key={p.fpl_id} p={p}
            plate1={<Plate w={56} color={T.green}>£{p.price.toFixed(1)}</Plate>}
            plate2={<Plate w={56} color={T.dim}>{p.own.toFixed(0)}%</Plate>} />
        ))}
      </Card>

      <Card eyebrow="Pipeline" title="Data status" accent={T.green}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[["PLAYERS", players.length], ["CLUBS", Object.keys(teamById).length], ["FIXTURES LOADED", fixtures.length]].map(([l, v]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Label>{l}</Label>
              <Plate h={34} w={72}>{v}</Plate>
            </div>
          ))}
        </div>
        {beats.map((b) => (
          <div key={b.job_name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bgRaise, borderRadius: 12, padding: "0 12px", height: 44 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: b.status === "ok" ? T.green : T.pink, display: "inline-block" }} />
              {b.job_name.toUpperCase()}
            </span>
            <Plate h={28} bg="#0D0014" color={b.status === "ok" ? T.green : T.pink}>
              {b.status === "ok" ? "OK" : "ERROR"} · {b.last_success_at ? new Date(b.last_success_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase() : "NEVER"}
            </Plate>
          </div>
        ))}
        <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          PROJECTIONS, THE BUILDER AND THE ANALYST ARRIVE WITH THE ENGINE — THE DATABASE UNDERNEATH IS ALREADY LIVE
        </div>
      </Card>
    </div>
  );
}
