"use client";
import React from "react";
import { X } from "lucide-react";
import { T, S, lang } from "../lib/ui";

/* ADD TO HOME SCREEN, FOR IPHONE SAFARI ONLY.
 *
 * iOS has no install prompt, so a site that works as an app has to say so itself. This is a thin strip
 * across the very top of every page, shown only in Safari on an iPhone and only while the site is not
 * already installed. Tapping it opens a sheet with the three taps iOS needs; the close button hides it
 * for this page view. It comes back on the next load until the site is installed.
 *
 * It is the one place dark purple ink sits on a neon pink fill. Pink everywhere else is a cost or a
 * warning, and this is neither, which is exactly why it needs to look like nothing else on the page. */

function iphoneSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  /* iPhone and iPod only: an iPad in portrait is 768 wide and gets the desktop shell. Chrome, Firefox,
     Edge, Opera and DuckDuckGo on iOS all carry "Safari" in their agent string and none of them can
     add to the home screen, so each is ruled out by its own marker. */
  const iphone = /iPhone|iPod/.test(ua);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/.test(ua);
  return iphone && safari;
}

function installed() {
  if (typeof window === "undefined") return true;
  if (window.navigator && window.navigator.standalone === true) return true;
  return Boolean(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}


function ShareIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

const STEPS = [
  ["Tap Share", "The square with an arrow, in the bar at the bottom of Safari."],
  ["Tap Add to Home Screen", "Scroll the sheet down a little if it is not showing."],
  ["Tap Add", "FPLBot opens full screen from your home screen, like any other app."],
];

export default function InstallBanner() {
  /* Nothing renders on the server and nothing renders until the browser has answered three questions,
     so the strip never flashes in and out for someone it does not apply to. */
  const [show, setShow] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  /* EVERY VISIT, UNTIL INSTALLED. Closing it hides it for this page view only; the next load shows it
     again, because the one thing it asks for is the one thing that makes it go away for good. */
  React.useEffect(() => {
    setShow(iphoneSafari() && !installed());
  }, []);

  const dismiss = () => {
    setOpen(false);
    setShow(false);
  };

  if (!show) return null;

  return (
    <>
      <div className="zeus-install-banner" role="region" aria-label="Add to home screen"
        style={{ display: "flex", alignItems: "stretch", width: "100%", background: T.install, color: T.onInstall,
          border: `1px solid ${T.onInstall}`, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <button type="button" onClick={() => setOpen(true)} className="fb-press"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: S.gapSm,
            height: S.touch, color: T.onInstall, ...lang(15, 700, T.onInstall) }}>
          <ShareIcon />
          Add to home screen
        </button>
        <button type="button" onClick={dismiss} aria-label="Hide this" className="fb-press"
          style={{ width: S.touch, height: S.touch, display: "flex", alignItems: "center", justifyContent: "center",
            color: T.onInstall, borderLeft: `1px solid ${T.onInstall}` }}>
          <X size={20} strokeWidth={2.4} />
        </button>
      </div>

      {open && (
        <div className="zeus-install-backdrop" onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end" }}>
          <div role="dialog" aria-modal="true" aria-labelledby="install-title" className="zeus-install-sheet"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "100%", background: T.card, borderTop: `1px solid ${T.line}`,
              borderRadius: `${S.radius}px ${S.radius}px 0 0`, padding: `${S.gapMd}px ${S.pad}px`,
              paddingBottom: `calc(${S.gapLg}px + env(safe-area-inset-bottom, 0px))`,
              display: "flex", flexDirection: "column", gap: S.gapMd }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.gapSm }}>
              <h2 id="install-title" style={{ margin: 0, ...lang(S.cardTitle, 700) }}>Add to home screen</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="fb-press"
                style={{ width: S.touch, height: S.touch, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: S.radiusSm, background: T.row, border: `1px solid ${T.line}`, color: "#FFFFFF" }}>
                <X size={20} strokeWidth={2.4} />
              </button>
            </div>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: S.gap }}>
              {STEPS.map(([title, detail], index) => (
                <li key={title} style={{ display: "flex", gap: S.gap, alignItems: "flex-start" }}>
                  <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: S.radiusXs, background: T.green, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", ...lang(16, 700, "#04130A") }}>
                    {index + 1}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ ...lang(17, 700), display: "flex", alignItems: "center", gap: S.gapSm }}>
                      {index === 0 && <ShareIcon size={18} />}
                      {title}
                    </span>
                    <span style={{ ...lang(15, 600), lineHeight: 1.45 }}>{detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={dismiss} className="fb-press"
              style={{ height: S.touch, borderRadius: S.radiusSm, background: T.green, ...lang(16, 700, "#04130A") }}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
