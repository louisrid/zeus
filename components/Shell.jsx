"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sb } from "../lib/data";
import { LayoutGrid, Shirt, Hammer, Users, BarChart3, Newspaper, ClipboardList } from "lucide-react";
import { S, T, FB, D, lang, val } from "../lib/ui";
import Splash from "./Splash";

const NAV = [
  ["Dashboard", "/", LayoutGrid], ["Builder", "/builder", Hammer], ["Squad", "/squad", Shirt],
  ["Players", "/players", Users], ["Line-ups", "/lineups", ClipboardList],
  ["Analysis", "/analysis", BarChart3], ["News", "/news", Newspaper],
];
/* Every title equals its nav label. A test compares the two lists, because three had drifted apart and
   none of them was visible by reading one file. */
const TITLES = { "/": "Dashboard", "/builder": "Builder", "/squad": "Squad", "/players": "Players",
  "/lineups": "Line-ups", "/analysis": "Analysis", "/news": "News", "/status": "Status" };

function useDeadline() {
  const [dl, setDl] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    sb().from("gameweeks").select("gw, deadline_utc").eq("finished", false).order("gw").limit(1)
      .then(({ data }) => { if (data && data[0]) setDl(data[0]); });
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!dl) return null;
  const d = new Date(dl.deadline_utc);
  const ms = d.getTime() - now;
  const days = Math.max(0, Math.floor(ms / 86400000));
  const hours = Math.max(0, Math.floor((ms % 86400000) / 3600000));
  const when = d.toLocaleDateString("en-GB", { weekday: "short" }) + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return { gw: dl.gw, when, count: `${days}d ${hours}h`, days, date: d };
}
export const DeadlineContext = React.createContext(null);

export default function Shell({ children }) {
  /* Data freshness, read once on load. The players table carries an updated_at from the six-hourly
     pull, so this says how old the numbers on screen are. */
  const [fresh, setFresh] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    import("../lib/supabase").then(({ supabase }) => supabase
      .from("players").select("updated_at").order("updated_at", { ascending: false }).limit(1)
      .then(({ data }) => {
        if (cancelled || !data || !data[0]) return;
        const then = new Date(data[0].updated_at).getTime();
        const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
        setFresh(mins < 60 ? `UPDATED ${mins}M AGO` : `UPDATED ${Math.round(mins / 60)}H AGO`);
      })
      .catch(() => {})).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const path = usePathname();
  const title = TITLES[path] || (path && path.startsWith("/player/") ? "Player" : "FPLBot");
  const dl = useDeadline();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "row-reverse", background: T.bg, fontFamily: FB, fontWeight: 600 }}>
      <Splash />
      <nav style={{ width: 248, flexShrink: 0, background: T.row, borderLeft: `1px solid ${T.line}`, padding: "30px 20px",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 12px", marginBottom: 30 }}>
          <div style={{ ...D, color: "#FFFFFF", fontSize: 22, lineHeight: 1 }}>FPLBOT<span style={{ color: T.green }}>.</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {NAV.map(([name, href, Icon]) => {
            const active = path === href;
            return (
              <Link key={href} href={href} style={{ textDecoration: "none" }}>
                <div className="fb-navitem" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", height: 48, borderRadius: 14,
                  background: active ? T.card : "transparent", borderLeft: `3px solid ${active ? T.green : "transparent"}`,
                  border: `1px solid ${active ? T.line : "transparent"}`, borderLeftWidth: 3, borderLeftColor: active ? T.green : "transparent",
                  ...lang(16, 700, active ? T.green : "#FFFFFF") }}>
                  <Icon size={19} strokeWidth={active ? 2.6 : 2.2} /> {name}
                </div>
              </Link>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", paddingBottom: 4 }}>
          <Link href="/status" aria-label="Status" style={{ textDecoration: "none" }}>
            <div className="fb-navitem" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", height: 44, borderRadius: 14,
              background: path === "/status" ? T.card : "transparent",
              border: `1px solid ${path === "/status" ? T.green : T.line}`, ...lang(14, 700, path === "/status" ? T.green : "#FFFFFF") }}>
              <span className="fb-pulse" style={{ width: 9, height: 9, borderRadius: 5, background: T.green, display: "inline-block", flexShrink: 0 }} />
              {fresh === null ? "PIPELINE STATUS" : fresh}
            </div>
          </Link>
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", padding: "0 40px 60px" }}>
          <header style={{ padding: "34px 0 26px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div style={{ ...lang(13, 700), letterSpacing: "0.18em", textTransform: "uppercase" }}>FPLBot · 2026/27 campaign</div>
              <h1 style={{ ...D, color: "#FFFFFF", fontSize: 42, lineHeight: 1, margin: "10px 0 0", textTransform: "uppercase" }}>{title}</h1>
            </div>
            {dl && (
              <span style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 20px", borderRadius: S.radiusSm, marginBottom: 4,
                background: T.card, border: `1px solid ${T.line}` }}>
                <span style={lang(14.5, 600)}>GW{dl.gw} DEADLINE · {dl.when}</span>
                <span style={val(14.5, T.green)}>{dl.count}</span>
              </span>
            )}
          </header>
          <DeadlineContext.Provider value={dl}>{children}</DeadlineContext.Provider>
        </div>
      </main>
    </div>
  );
}
