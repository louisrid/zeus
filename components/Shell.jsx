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
import { THEMES, DEFAULT_THEME, THEME_META } from "../lib/themes.mjs";

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
  /* Inside the last day the count turns pink: that is when a forgotten transfer costs points. */
  return { gw: dl.gw, when, count, days, hours, minutes, past: ms <= 0, urgent: ms > 0 && ms < 24 * 3600 * 1000, date: d };
}
export const DeadlineContext = React.createContext(null);


/* WHICH VERSION IS ON SCREEN, BESIDE THE DEADLINE.
 *
 * Uploading a change and then wondering whether it has actually deployed is a question this app could
 * always answer and never did. It showed a commit hash for a while, which is precise and unreadable:
 * nobody can tell whether 58a68f4 is newer than 45e7442.
 *
 * A version number and how long ago it landed answers it in one glance. The number is the count of
 * commits on main, so it only goes up and cannot drift from what was deployed.
 */
function BuildPill({ compact = false }) {
  const [info, setInfo] = React.useState(null);
  const [now, setNow] = React.useState(null);
  /* The build this page was loaded from. Anything newer than it is a deploy the page has not seen. */
  const loadedCommit = React.useRef(
    typeof document !== "undefined" ? (document.documentElement.getAttribute("data-build") || null) : null,
  );

  React.useEffect(() => {
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 30000);

    /* A NEW BUILD RELOADS THE PAGE.
     *
     * A tab left open across a deploy kept running the old bundle indefinitely, and nothing on screen said
     * so. The line-ups page showed a team sheet from six days earlier an hour after the fresh one had
     * been published, because the fresh one was in a build the tab had never loaded. Telling someone to
     * reload after every update is not a fix; the page should notice and do it.
     *
     * Every minute, and whenever the tab comes back into view, this asks which build is deployed. The
     * first answer is what this page was loaded from. A different answer later means a newer build is
     * live, and the page reloads itself to pick it up. Drafts, filters, ranges and unsaved edits are all
     * persisted, so a reload costs nothing but a second.
     *
     * It waits if a field has focus, because reloading mid-keystroke throws away the keystroke. */
    const check = async () => {
      try {
        const body = await fetch("/api/build-info", { cache: "no-store" }).then((response) => response.json());
        if (!body?.ok) return;
        setInfo(body);
        const commit = body.commit || null;
        if (!commit) return;
        if (loadedCommit.current === null) { loadedCommit.current = commit; return; }
        if (commit === loadedCommit.current) return;
        const typing = document.activeElement
          && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (typing) return;
        window.location.reload();
      } catch { /* the badge simply keeps its last answer */ }
    };
    check();
    const poll = setInterval(check, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!info || !info.version) return null;

  const when = Date.parse(info.deployed_at || "");
  let ago = "";
  if (Number.isFinite(when) && now !== null) {
    const minutes = Math.max(0, Math.round((now - when) / 60000));
    ago = minutes < 1 ? "just now"
      : minutes < 60 ? `${minutes} min${minutes === 1 ? "" : "s"} ago`
        : minutes < 1440 ? `${Math.round(minutes / 60)}h ago`
          : `${Math.round(minutes / 1440)}d ago`;
  }

  return (
    <span className="zeus-build-pill"
      title={info.commit ? `Commit ${info.commit}` : "Deployed build"}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        /* Taller and narrower than the deadline beside it: two short lines rather than one long one, so
           it reads as a badge rather than as a second sentence competing with the first. */
        /* Plain card fill. It was a neon pink block on every page, which is a lot of colour for a version
           number; it is chrome, so it dresses like chrome. */
        height: compact ? 40 : 52, padding: compact ? "0 10px" : "0 16px",
        borderRadius: compact ? 12 : 16, background: T.card, lineHeight: 1.15 }}>
      <span style={{ ...val(compact ? 12.5 : 14.5, "#FFFFFF") }}>v{info.version}</span>
      {ago && <span style={{ ...lang(compact ? 12 : 12.5, 600, "#FFFFFF"), opacity: 0.9 }}>{ago}</span>}
    </span>
  );
}

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
        setFresh(mins < 60 ? `Updated ${mins}m ago` : `Updated ${Math.round(mins / 60)}h ago`);
      })
      .catch(() => {})).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* THEME. Four grounds from the dots under the logo, remembered per browser. Black is the default,
     purple second. The script in layout.jsx sets the attribute before first paint so a saved theme never
     flashes the default; this keeps it in step when a dot is pressed. */
  const [theme, setTheme] = React.useState(DEFAULT_THEME);
  React.useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (THEMES.some(([key]) => key === current)) setTheme(current);
    /* The interface-size control is gone; drop any size it left behind so the page sits at the default. */
    try { window.localStorage.removeItem("zeus.ui-scale"); document.body.style.zoom = ""; } catch { /* fine */ }
  }, []);
  const pickTheme = (key) => {
    setTheme(key);
    document.documentElement.dataset.theme = key;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_META[key]);
    try { window.localStorage.setItem("zeus.theme", key); } catch { /* fine */ }
  };
  const swatches = (
    <span role="group" aria-label="Colour theme" className="zeus-swatches">
      {THEMES.map(([key, swatch, name]) => (
        <button key={key} type="button" onClick={() => pickTheme(key)} aria-label={`${name} theme`} aria-pressed={theme === key}
          title={name} className="fb-press zeus-swatch" style={{ background: swatch }} />
      ))}
    </span>
  );

  React.useEffect(() => {
    /* A clean load clears the "already reloaded once" flag the error page sets, so the next deploy in
       this tab can be recovered the same way. Fifteen seconds is long enough to know the load was clean. */
    const t = setTimeout(() => { try { window.sessionStorage.removeItem("zeus.chunk-reload"); } catch { /* fine */ } }, 15000);
    return () => clearTimeout(t);
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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                <Link href="/" aria-label="Dashboard" style={{ display: "flex", alignItems: "center" }}>
                  <img src="/fplpal-logo.png" alt="FPLPAL" className="fb-logo" height={18} style={{ height: 18, width: "auto", display: "block" }} />
                </Link>
                {swatches}
              </span>
              {/* The phone has its own header, so anything added to the desktop one has to be added here
                  too or it simply is not there. The badge sits beside the deadline exactly as it does on
                  a wide screen, because the question it answers, "is what I uploaded live yet", is asked
                  more often on a phone than on a desktop. */}
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <BuildPill compact />
                {dl && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, height: S.ctrlSm, padding: "0 11px",
                    borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}` }}>
                    <span style={lang(12, 600)}>GW{dl.gw}</span>
                    <span style={val(12, dl.urgent ? T.pink : T.green)}>{dl.count}</span>
                  </span>
                )}
              </span>
            </div>
            {/* The page title stays, at a size that still reads as a title without eating a third of a
                phone screen the way 42px Michroma would. */}
            <h1 style={{ ...D, color: "var(--ink)", fontSize: 25, lineHeight: 1.05, margin: "14px 0 0",
              textTransform: "uppercase" }}>{title}</h1>
          </header>
          <DeadlineContext.Provider value={dl}>{children}</DeadlineContext.Provider>
        </main>
        <MobileNav />
      </div>
    );
  }

  /* THE NAVIGATION IS A BAR ACROSS THE TOP.
   *
   * The rail took 248px of every desktop screen for six links and a status strip, and a 1280px laptop
   * was left with a 990px page. Across the top the same six links cost 56px of height once, the page
   * gets the full width back, and the layout matches the phone, where the links already sit across the
   * screen rather than down it. The wordmark leads, the links follow, and the live readouts (data age,
   * build, deadline) sit at the far right where the deadline chip already lived. */
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: T.bg, fontFamily: FB, fontWeight: 600 }}>
      <Splash />
      <header className="zeus-topnav" style={{ position: "sticky", top: 0, zIndex: 40, background: T.row, borderBottom: `1px solid ${T.line}` }}>
        {/* One row of controls, all S.ctrl tall: the logo sits on that row, centred with the links and the
            readouts, and the theme dots sit under the logo. The bar is taller to make room for them. */}
        <div style={{ maxWidth: 1480, margin: "0 auto", padding: "16px 40px 14px", display: "flex", alignItems: "flex-start", gap: S.gapLg }}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
            <Link href="/" aria-label="Dashboard" style={{ textDecoration: "none", height: S.ctrl, display: "flex", alignItems: "center" }}>
              <img src="/fplpal-logo.png" alt="FPLPAL" className="fb-logo" height={22} style={{ height: 22, width: "auto", display: "block" }} />
            </Link>
            {swatches}
          </span>
          <nav aria-label="Primary" style={{ display: "flex", alignItems: "center", gap: S.gapXs, minWidth: 0, flex: 1, flexShrink: 0 }}>
            {NAV.map(([name, href, Icon]) => {
              const active = path === href;
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined} style={{ textDecoration: "none" }}>
                  <div className="fb-navitem" style={{ display: "flex", alignItems: "center", gap: S.gapSm, padding: "0 12px", height: S.ctrl,
                    borderRadius: S.radiusXs, background: active ? T.card : "transparent",
                    border: `1px solid ${active ? T.line : "transparent"}`,
                    ...lang(15, 700, active ? T.green : "#FFFFFF") }}>
                    <Icon size={17} strokeWidth={active ? 2.6 : 2.2} /> {name}
                  </div>
                </Link>
              );
            })}
          </nav>
          <span style={{ display: "flex", alignItems: "center", gap: S.gapSm, flexShrink: 0 }}>
            <Link href="/status" aria-label="Status" style={{ textDecoration: "none" }}>
              <div className="fb-navitem" style={{ display: "flex", alignItems: "center", gap: S.gapSm, padding: "0 12px", height: S.ctrl, borderRadius: S.radiusXs,
                background: path === "/status" ? T.card : "transparent",
                border: `1px solid ${path === "/status" ? T.green : T.line}`, ...lang(13.5, 700, path === "/status" ? T.green : "#FFFFFF") }}>
                <span className="fb-pulse" style={{ width: 9, height: 9, borderRadius: S.radiusXs, background: T.green, display: "inline-block", flexShrink: 0 }} />
                {fresh === null ? "Pipeline status" : fresh}
              </div>
            </Link>
            <BuildPill compact />
            {dl && (
              <span style={{ display: "flex", alignItems: "center", gap: S.gapSm, height: S.ctrl, padding: "0 14px", borderRadius: S.radiusXs,
                background: T.card, border: `1px solid ${T.line}` }}>
                <span style={lang(13.5, 600)}>GW{dl.gw} deadline · {dl.when}</span>
                <span style={val(13.5, dl.urgent ? T.pink : T.green)}>{dl.count}</span>
              </span>
            )}
          </span>
        </div>
      </header>
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", padding: "0 40px 60px" }}>
          <header style={{ padding: "28px 0 20px" }}>
            <h1 style={{ ...D, color: "var(--ink)", fontSize: 36, lineHeight: 1, margin: 0, textTransform: "uppercase" }}>{title}</h1>
          </header>
          <DeadlineContext.Provider value={dl}>{children}</DeadlineContext.Provider>
        </div>
      </main>
    </div>
  );
}
