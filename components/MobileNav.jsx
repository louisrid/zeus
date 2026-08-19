"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Shirt, Hammer, Users, ClipboardList } from "lucide-react";
import { T, lang } from "../lib/ui";
import { PRIMARY_ROUTES } from "../lib/routes.mjs";

const ICONS = {
  dashboard: LayoutGrid,
  builder: Hammer,
  squad: Shirt,
  players: Users,
  lineups: ClipboardList,
};

/* WHY FIVE AND NOT SIX.
 *
 * The desktop rail carries six destinations plus a status strip, which is free when they are stacked
 * vertically down a 248px column. Laid across the bottom of a phone each one gets about 75px, and a
 * label at that width either truncates or drops to a font size nobody can read. Five fits with the
 * labels intact.
 *
 * News is the one left out, because it is the only destination that is read rather than used: nothing
 * on it feeds a squad decision, so it is the cheapest thing to reach through the dashboard instead. It
 * remains fully routable, it simply is not one of the five thumb targets. */
const TABS = PRIMARY_ROUTES.filter((route) => route.key !== "news")
  .map((route) => [route.label, route.href, ICONS[route.key]]);

export default function MobileNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
        background: T.row, borderTop: `1px solid ${T.line}`,
        /* The inset keeps the bar above the home indicator on notched phones. Without it the last few
           pixels of every tap target sit under the system gesture area and stop responding. */
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        display: "grid", gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
      }}
    >
      {TABS.map(([name, href, Icon]) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{
              textDecoration: "none",
              /* 56px, above the 44px minimum, because this sits at the very bottom of the screen where
                 thumbs are least accurate. */
              height: 58, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
              borderTop: `2px solid ${active ? T.green : "transparent"}`,
            }}
          >
            <Icon size={18} strokeWidth={active ? 2.6 : 2.1} color={active ? T.green : "#FFFFFF"} />
            <span style={{ ...lang(12, 700, active ? T.green : "#FFFFFF"), letterSpacing: "0.01em" }}>
              {name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
