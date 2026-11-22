"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Shirt, Hammer, Users, ClipboardList, ArrowLeftRight, CalendarDays, ShieldAlert, Flame, Settings, Ellipsis, X } from "lucide-react";
import { T, S, lang } from "../lib/ui";
import { ALL_ROUTES, MOBILE_TAB_KEYS, MOBILE_MORE_KEYS } from "../lib/routes.mjs";

const ICONS = {
  dashboard: LayoutGrid,
  builder: Hammer,
  squad: Shirt,
  transfers: ArrowLeftRight,
  players: Users,
  lineups: ClipboardList,
  fixtures: CalendarDays,
  defences: ShieldAlert,
  attacks: Flame,
  settings: Settings,
};

/* WHY SIX AND NOT SEVEN.
 *
 * The desktop rail carries every destination plus a status strip, which is free when they are stacked
 * vertically down a 248px column. Laid across the bottom of a phone each one gets about 65px, and a
 * label longer than that either truncates or drops to a font size nobody can read.
 *
 * News is the one left out, because it is the only destination that is read rather than used: nothing
 * on it feeds a squad decision, so it is the cheapest thing to reach through the dashboard instead. It
 * remains fully routable, it simply is not one of the thumb targets.
 *
 * Transfers is the reason a shortLabel exists at all. Six tabs left no room for a nine-character word,
 * and the choice was between clipping it, shrinking every label below the twelve pixel floor, or
 * spelling that one destination differently here. The rail and the page title still read Transfers. */
/* FIVE TABS AND MORE. Five destinations sit on the bar; Line-ups, Fixtures and Defences open from a More
   tab at the bottom right, in a sheet that rises from the bar and stays inside the screen. The desktop
   bar shows every destination. */
const byKey = new Map(ALL_ROUTES.map((route) => [route.key, route]));
const TABS = MOBILE_TAB_KEYS.map((key) => byKey.get(key)).filter(Boolean)
  .map((route) => [route.shortLabel || route.label, route.href, ICONS[route.key]]);
const MORE = MOBILE_MORE_KEYS.map((key) => byKey.get(key)).filter(Boolean)
  .map((route) => [route.shortLabel || route.label, route.href, ICONS[route.key]]);

/* The only mark on the bar is a 3px green line over the active tab. Everything else is transparent: an
   earlier version left the browser's default border colour on the inactive tabs, which showed as stray
   white and purple strips along the top of the bar. */
const tabStyle = (active) => ({
  textDecoration: "none", height: 68, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: 4,
  background: "transparent", padding: 0, width: "100%", margin: 0,
  border: "none", borderTop: `3px solid ${active ? T.green : "transparent"}`,
  WebkitTapHighlightColor: "transparent", transition: "none", outline: "none",
});
const labelStyle = (active) => ({ ...lang(12, 700, active ? T.green : "#FFFFFF"), letterSpacing: "-0.01em", lineHeight: 1,
  maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });

export default function MobileNav() {
  const path = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setOpen(false); }, [path]);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const moreActive = MORE.some(([, href]) => path === href);
  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)} aria-hidden="true"
          style={{ position: "fixed", inset: 0, zIndex: 41, background: "rgba(0,0,0,0.55)" }} />
      )}
      {open && (
        <div role="dialog" aria-label="More pages" className="zeus-more-sheet"
          style={{ position: "fixed", left: 10, right: 10, zIndex: 42,
            bottom: "calc(68px + 10px + env(safe-area-inset-bottom, 0px))",
            background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.gapSm,
            display: "flex", flexDirection: "column", gap: S.gapXs, maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 4px" }}>
            <span style={lang(14, 700)}>More</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="fb-press"
              style={{ background: "transparent", border: "none", padding: 6, display: "flex" }}><X size={18} color="#FFFFFF" /></button>
          </div>
          {MORE.map(([name, href, Icon]) => {
            const active = path === href;
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "0 12px",
                  borderRadius: S.radiusSm, background: active ? "rgba(0,255,106,0.12)" : T.row, border: `1px solid ${active ? T.green : T.line}` }}>
                <Icon size={21} strokeWidth={2.2} color={active ? T.green : "#FFFFFF"} />
                <span style={lang(15, 700, active ? T.green : "#FFFFFF")}>{name}</span>
              </Link>
            );
          })}
        </div>
      )}
      <nav
        aria-label="Primary"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          background: T.row, borderTop: `1px solid ${T.line}`,
          willChange: "transform", transform: "translateZ(0)", WebkitBackfaceVisibility: "hidden",
          WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          display: "grid", gridTemplateColumns: `repeat(${TABS.length + 1}, 1fr)`,
        }}
      >
        {TABS.map(([name, href, Icon]) => {
          const active = path === href;
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} style={tabStyle(active)}>
              <Icon size={21} strokeWidth={active ? 2.6 : 2.1} color={active ? T.green : "#FFFFFF"} />
              <span style={labelStyle(active)}>{name}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
          className="fb-press" style={tabStyle(moreActive || open)}>
          <Ellipsis size={21} strokeWidth={moreActive || open ? 2.6 : 2.1} color={moreActive || open ? T.green : "#FFFFFF"} />
          <span style={labelStyle(moreActive || open)}>More</span>
        </button>
      </nav>
    </>
  );
}
