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
        /* THE JANK.
           Three separate causes, all of them here.
           A translucent bar repaints on every scroll frame on iOS, so this one is opaque.
           A fixed element that the compositor has not promoted gets redrawn rather than moved, which is
           the shudder you see when the page scrolls under it, so it is given its own layer.
           And a tap used to flash a grey box and then leave the pressed style stuck, because there is no
           pointer to move away on a touch screen. */
        willChange: "transform",
        transform: "translateZ(0)",
        WebkitBackfaceVisibility: "hidden",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
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
              /* 68 rather than 58. At the very bottom of the screen a thumb is at its least accurate,
                 and the label needs room to sit under the icon rather than crowd it. */
              height: 68, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
              borderTop: `3px solid ${active ? T.green : "transparent"}`,
              WebkitTapHighlightColor: "transparent",
              /* No transition on the active state. Animating it means the indicator lags a route change
                 that has already happened, which reads as the bar being slow rather than smooth. */
              transition: "none",
            }}
          >
            <Icon size={22} strokeWidth={active ? 2.6 : 2.1} color={active ? T.green : "#FFFFFF"} />
            <span style={{ ...lang(12.5, 700, active ? T.green : "#FFFFFF"), letterSpacing: "0.01em", lineHeight: 1 }}>
              {name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
