"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { LayoutGrid, Shirt, Hammer, Users, BarChart3, Newspaper } from "lucide-react";
import { T, FB, FN, FNW, D, S } from "../lib/ui";
import Splash from "./Splash";

const NAV = [
  ["Dashboard", "/", LayoutGrid], ["Squad", "/squad", Shirt], ["Builder", "/builder", Hammer],
  ["Players", "/players", Users], ["Analysis", "/analysis", BarChart3], ["News", "/news", Newspaper],
];
const TITLES = { "/": "Dashboard", "/squad": "Squad", "/builder": "Squad Builder", "/players": "Players",
  "/analysis": "Analysis", "/news": "News", "/status": "Status", "/legacy": "Legacy screens",
  "/legacy/dashboard": "Dashboard v0", "/legacy/players": "Players v0" };

function useDeadline() {
  const [dl, setDl] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    supabase.from("gameweeks").select("gw, deadline_utc").eq("finished", false).order("gw").limit(1)
      .then(({ data }) => { if (data && data[0]) setDl(data[0]); });
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!dl) return null;
  const d = new Date(dl.deadline_utc);
  const ms = d.getTime() - now;
  const days = Math.max(0, Math.floor(ms / 86400000));
  const hours = Math.max(0, Math.floor((ms % 86400000) / 3600000));
  const when = d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase() + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return { gw: dl.gw, when, count: `${days}D ${hours}H`, days, date: d };
}
export const DeadlineContext = React.createContext(null);

export default function Shell({ children }) {
  const path = usePathname();
  const dl = useDeadline();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "row-reverse", background: T.bg, fontFamily: FB, fontWeight: 600 }}>
      <Splash />
      <nav style={{ width: 248, flexShrink: 0, background: T.bgRaise, borderLeft: `1px solid ${T.line}`, padding: "30px 20px",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 12px", marginBottom: 30 }}>
          <div style={{ ...D, color: "#FFFFFF", fontSize: 22, lineHeight: 1 }}>FPLBOT<span style={{ color: T.green }}>.</span></div>
          <div style={{ marginTop: 7, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase" }}>Rank one</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {NAV.map(([name, href, Icon]) => {
            const active = path === href;
            return (
              <Link key={href} href={href} style={{ textDecoration: "none" }}>
                <div className="fb-navitem" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", height: 48, borderRadius: 14,
                  background: active ? T.card : "transparent", color: active ? T.green : T.dim,
                  border: `1px solid ${active ? T.line : "transparent"}`, fontFamily: FB, fontSize: 16, fontWeight: 700 }}>
                  <Icon size={19} strokeWidth={active ? 2.6 : 2.2} /> {name}
                </div>
              </Link>
            );
          })}
        </div>
        <div style={{ marginTop: "auto" }}>
          <Link href="/status" style={{ textDecoration: "none" }}>
            <div className="fb-navitem" style={{ padding: "12px 12px", borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                <span className="fb-pulse" style={{ width: 7, height: 7, borderRadius: 4, background: T.green, display: "inline-block" }} /> ALL SYSTEMS LIVE
              </div>
              <div style={{ marginTop: 5, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Refreshes every 6h · view status</div>
            </div>
          </Link>
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", padding: "0 40px 60px" }}>
          <header style={{ padding: "34px 0 26px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>FPLBot · 2026/27 Campaign</div>
              <h1 style={{ ...D, color: "#FFFFFF", fontSize: 42, lineHeight: 1, margin: "10px 0 0", textTransform: "uppercase" }}>{TITLES[path] || "FPLBot"}</h1>
            </div>
            {dl && (
              <span style={{ display: "flex", alignItems: "center", height: 40, padding: "0 20px", borderRadius: 999, marginBottom: 4,
                background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 14, lineHeight: 1 }}>
                GW{dl.gw} DEADLINE · {dl.when} · <span style={{ color: T.green, marginLeft: 6 }}>{dl.count}</span>
              </span>
            )}
          </header>
          <DeadlineContext.Provider value={dl}>{children}</DeadlineContext.Provider>
        </div>
      </main>
    </div>
  );
}
