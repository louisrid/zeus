"use client";
import React from "react";
import { T, D, val } from "../lib/ui";

export default function Splash() {
  /* Starts VISIBLE, and the effect only ever hides it. Deciding to show it inside an effect meant the
     app painted first and the overlay arrived a frame later, which is the flash. */
  const [show, setShow] = React.useState(true);
  const [fading, setFading] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    // Already seen this session: hide immediately, before anything is drawn.
    if (sessionStorage.getItem("fplbot-splash")) { setShow(false); return; }
    sessionStorage.setItem("fplbot-splash", "1");
    const t1 = setTimeout(() => setFading(true), 1800);
    const t2 = setTimeout(() => setShow(false), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, #1E0630 0%, #0D0014 70%)",
      opacity: fading ? 0 : 1, transition: "opacity 600ms ease", pointerEvents: fading ? "none" : "auto" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ ...D, color: "#FFFFFF", fontSize: 56, lineHeight: 1 }}>FPLBOT<span style={{ color: T.green }}>.</span></div>
        <div style={{ marginTop: 14, ...val(13, "#FFFFFF", 500), letterSpacing: "0.3em" }}>RANK ONE</div>
      </div>
    </div>
  );
}
