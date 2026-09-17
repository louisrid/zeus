"use client";
import React from "react";
import Link from "next/link";
import { T, S, lang, D } from "../lib/ui";

/* A WRONG ADDRESS, ANSWERED IN THE APP'S OWN VOICE.
 *
 * The framework's default 404 is a white page with a black "404" on it, which looks like the site has
 * broken rather than like a link has gone stale. The old news page was removed and anyone with it
 * bookmarked lands here; so does anyone who mistypes. Both deserve the same answer: this is still the
 * app, that page is not here, and here is where the pages are.
 */
export default function NotFound() {
  return (
    <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, background: T.bg }}>
      <section style={{ maxWidth: 460, width: "100%", display: "flex", flexDirection: "column", gap: 14,
        padding: 22, borderRadius: S.radius, background: T.card, border: `1px solid ${T.line}` }}>
        <div style={{ ...D, color: "#FFFFFF", fontSize: 24, lineHeight: 1.05 }}>That page is not here</div>
        <p style={{ ...lang(14, 600), margin: 0, opacity: 0.9 }}>
          It may have moved or been removed. Everything the app does is reachable from the dashboard.
        </p>
        <Link href="/" className="fb-press"
          style={{ display: "inline-flex", alignItems: "center", alignSelf: "flex-start", height: S.btn,
            padding: "0 20px", borderRadius: S.radiusSm, background: T.green,
            ...lang(14, 700, "#04130A"), textDecoration: "none" }}>
          Go to the dashboard
        </Link>
      </section>
    </main>
  );
}
