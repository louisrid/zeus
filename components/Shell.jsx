"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { T, FB, FN, FNW, D } from "../lib/ui";

const NAV = [
  ["Dashboard", "/"], ["Squad", "/squad"], ["Builder", "/builder"],
  ["Players", "/players"], ["Analysis", "/analysis"], ["News", "/news"],
];
const TITLES = { "/": "Dashboard", "/squad": "Squad", "/builder": "Squad Builder", "/players": "Players", "/analysis": "Analysis", "/news": "News" };

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
  return { gw: dl.gw, when, count: `${days}D ${hours}H` };
}

export default function Shell({ children }) {
  const path = usePathname();
  const dl = useDeadline();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "row-reverse", background: T.bg, fontFamily: FB, fontWeight: 600 }}>
      <nav style={{ width: 240, flexShrink: 0, background: T.bgRaise, borderLeft: `1px solid ${T.line}`, padding: "28px 20px",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 12px", marginBottom: 28 }}>
          <div style={{ ...D, color: "#FFFFFF", fontSize: 20, lineHeight: 1 }}>FPL<span style={{ color: T.green }}>.</span></div>
          <div style={{ marginTop: 6, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>Rank one</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map(([name, href]) => {
            const active = path === href;
            return (
              <Link key={href} href={href} style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44, borderRadius: 12,
                  background: active ? T.card : "transparent", color: active ? T.green : T.dim,
                  border: `1px solid ${active ? T.line : "transparent"}`, fontFamily: FB, fontSize: 15, fontWeight: 700 }}>
                  {name}
                </div>
              </Link>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green, display: "inline-block" }} /> LIVE FPL DATA
          </div>
          <div style={{ marginTop: 4, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Refreshes every 6 hours</div>
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", padding: "0 40px 56px" }}>
          <header style={{ padding: "32px 0 24px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>FPL 2026/27 · Campaign</div>
              <h1 style={{ ...D, color: "#FFFFFF", fontSize: 40, lineHeight: 1, margin: "8px 0 0", textTransform: "uppercase" }}>{TITLES[path] || "FPL"}</h1>
            </div>
            {dl && (
              <span style={{ display: "flex", alignItems: "center", height: 34, padding: "0 16px", borderRadius: 999, marginBottom: 4,
                background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, lineHeight: 1 }}>
                GW{dl.gw} DEADLINE · {dl.when} · <span style={{ color: T.green, marginLeft: 5 }}>{dl.count}</span>
              </span>
            )}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
