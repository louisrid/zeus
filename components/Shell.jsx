"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sb } from "../lib/data";
import { LayoutGrid, Shirt, Hammer, Users, ClipboardList, ArrowLeftRight } from "lucide-react";
import { S, T, FB, D, lang, val } from "../lib/ui";
import Splash from "./Splash";
import { PRIMARY_ROUTES, routeTitleMap } from "../lib/routes.mjs";
import { useIsMobile } from "../lib/use-viewport.mjs";
import MobileNav from "./MobileNav";

const NAV_ICONS = {
  dashboard: LayoutGrid,
  builder: Hammer,
  squad: Shirt,
  transfers: ArrowLeftRight,
  players: Users,
  lineups: ClipboardList,
};
const NAV = PRIMARY_ROUTES.map((route) => [route.label, route.href, NAV_ICONS[route.key]]);
/* Archived Analysis remains reachable directly, but it is deliberately absent from primary navigation
   and dashboard shortcuts. */
const TITLES = routeTitleMap({ "/status": "Status", "/analysis": "Analysis" });

function useDeadline() {
  const [dl, setDl] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    /* THE NEXT DEADLINE IS THE NEXT ONE IN TIME.
     *
     * This took the first gameweek with finished=false, which is only the next deadline while that flag
     * is being kept up to date. When the pull has not run, the flag stays false on a week that has long
     * kicked off and the countdown sticks there: the squad page still offered a GW2 deadline days after
     * GW2 had gone. A deadline in the past is not a deadline, so the clock decides and the flag is only
     * used to break ties. */
    sb().from("gameweeks").select("gw, deadline_utc, finished").order("gw").limit(40)
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : [];
        const upcoming = rows
          .filter((row) => row?.deadline_utc && new Date(row.deadline_utc).getTime() > Date.now())
          .sort((a, b) => new Date(a.deadline_utc) - new Date(b.deadline_utc));
        const next = upcoming[0]
          || rows.filter((row) => !row?.finished).sort((a, b) => Number(a.gw) - Number(b.gw))[0]
          || null;
        if (next) setDl(next);
      });
    /* Every ten seconds, so a minutes reading is never more than a few seconds stale. A thirty-second
       tick was fine while the smallest unit on screen was an hour; it is visibly wrong when a minute is. */
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  if (!dl) return null;
  const d = new Date(dl.deadline_utc);
  const ms = d.getTime() - now;
  const days = Math.max(0, Math.floor(ms / 86400000));
  const hours = Math.max(0, Math.floor((ms % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((ms % 3600000) / 60000));
  const when = d.toLocaleDateString("en-GB", { weekday: "short" }) + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  /* ON THE DAY, MINUTES MATTER.
   *
   * "0d 3h" is the reading you get for three hours running, which is the worst possible time for the
   * clock to stop moving: it is the day changes are actually made, and an hour of slack is enough to
   * miss a deadline by. Days are the right unit while there are days left, and once there are none the
   * count switches to hours and minutes and keeps moving. Past the deadline it says so rather than
   * counting down to something that has already happened. */
  const count = ms <= 0
    ? "DEADLINE PASSED"
    : days > 0
      ? `${days}d ${hours}h`
      : `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return { gw: dl.gw, when, count, days, hours, minutes, past: ms <= 0, date: d };
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
        /* A missing or unparseable timestamp gave "UPDATED NaNH AGO" in the nav on every page. If we do not
           know when the data was refreshed, say nothing rather than something meaningless. */
        const then = new Date(data[0].updated_at).getTime();
        if (!Number.isFinite(then)) return;
        const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
        if (!Number.isFinite(mins)) return;
        setFresh(mins < 60 ? `UPDATED ${mins}M AGO` : `UPDATED ${Math.round(mins / 60)}H AGO`);
      })
      .catch(() => {})).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const path = usePathname();
  const title = TITLES[path] || (path && path.startsWith("/player/") ? "Player" : "FPLBot");
  const dl = useDeadline();
  const isMobile = useIsMobile();

  /* MOBILE IS A SEPARATE BRANCH, NOT A SQUEEZED DESKTOP.
   *
   * The desktop layout is a 248px rail beside a 1480px column, and no amount of narrowing turns that
   * into something usable on a phone: the rail alone is two thirds of the screen. So the phone gets its
   * own shell with the navigation moved to the bottom, where a thumb can reach it.
   *
   * Everything below this branch is the original desktop markup, untouched. That is deliberate: the
   * desktop layout is the one that already works, and the safest way to add a phone version is to leave
   * the working one alone entirely rather than parameterise it and hope. */
  if (isMobile) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: FB, fontWeight: 600 }}>
        <Splash />
        <main className="fb-mobile-main">
          <header style={{ padding: "18px 0 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ ...D, color: "#FFFFFF", fontSize: 17, lineHeight: 1 }}>
                FPLBOT<span style={{ color: T.green }}>.</span>
              </div>
              {dl && (
                <span style={{ display: "flex", alignItems: "center", gap: 7, height: S.ctrlSm, padding: "0 11px",
                  borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}` }}>
                  <span style={lang(12, 600)}>GW{dl.gw}</span>
                  <span style={val(12, T.green)}>{dl.count}</span>
                </span>
              )}
            </div>
            {/* The page title stays, at a size that still reads as a title without eating a third of a
                phone screen the way 42px Michroma would. */}
            <h1 style={{ ...D, color: "#FFFFFF", fontSize: 25, lineHeight: 1.05, margin: "14px 0 0",
              textTransform: "uppercase" }}>{title}</h1>
          </header>
          <DeadlineContext.Provider value={dl}>{children}</DeadlineContext.Provider>
        </main>
        <MobileNav />
      </div>
    );
  }

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
                <div className="fb-navitem" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", height: 40, borderRadius: 16,
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
            <div className="fb-navitem" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", height: 40, borderRadius: 16,
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
              <span style={{ display: "flex", alignItems: "center", gap: 10, height: S.ctrl, padding: "0 20px", borderRadius: S.radiusSm, marginBottom: 4,
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
