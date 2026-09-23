"use client";
import React from "react";
import { T, S, lang, D } from "../lib/ui";

/* WHAT A CRASH LOOKS LIKE.
 *
 * Without this, a runtime error anywhere in a page produced a blank screen and the sentence "Application
 * error: a client-side exception has occurred (see the browser console for more information)". On a
 * phone there is no console to see, so that sentence is a dead end, and the page it replaced is gone
 * with no way back but the address bar.
 *
 * This is what stands in instead. It says that something went wrong in words a person can act on, it
 * offers to try again, which re-renders the page without a reload and often works, and it offers the
 * dashboard as a way out. It is drawn in the app's own colours so it is obviously still the app and not
 * the browser giving up.
 */
export default function Error({ error, reset }) {
  React.useEffect(() => {
    /* Kept in the console for anyone debugging; never shown to the reader, who cannot use it. */
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, background: T.bg }}>
      <section style={{ maxWidth: 460, width: "100%", display: "flex", flexDirection: "column", gap: 12,
        padding: 22, borderRadius: S.radius, background: T.card, border: `1px solid ${T.line}` }}>
        <div style={{ ...D, color: "#FFFFFF", fontSize: 24, lineHeight: 1.05 }}>Something went wrong</div>
        <p style={{ ...lang(14, 600), margin: 0, opacity: 0.9 }}>
          This page hit an error it could not recover from. Nothing you saved is affected. Trying again
          usually fixes it; if it does not, the dashboard is one tap away.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => reset()} className="fb-press"
            style={{ height: S.btn, padding: "0 20px", borderRadius: S.radiusSm, border: "none",
              background: T.green, ...lang(14, 700, "#04130A"), cursor: "pointer" }}>
            Try again
          </button>
          <a href="/" className="fb-press"
            style={{ display: "inline-flex", alignItems: "center", height: S.btn, padding: "0 20px",
              borderRadius: S.radiusSm, background: T.plate, border: `1px solid ${T.line}`,
              ...lang(14, 700), textDecoration: "none" }}>
            Go to the dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
