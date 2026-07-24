"use client";
import React from "react";
import { T, D } from "../lib/ui";

export default function Splash() {
  const [show, setShow] = React.useState(false);
  const [fading, setFading] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("fplbot-splash")) return;
    sessionStorage.setItem("fplbot-splash", "1");
    setShow(true);
    const t1 = setTimeout(() => setFading(true), 1700);
    const t2 = setTimeout(() => setShow(false), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, #1E0630 0%, #0D0014 70%)",
      opacity: fading ? 0 : 1, transition: "opacity 500ms ease", pointerEvents: fading ? "none" : "auto" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ ...D, color: "#FFFFFF", fontSize: 56, lineHeight: 1 }}>FPLBOT<span style={{ color: T.green }}>.</span></div>
        <div style={{ marginTop: 14, color: "rgba(255,255,255,0.66)", fontFamily: "'Martian Mono',monospace", fontWeight: 800, fontSize: 13, letterSpacing: "0.3em" }}>RANK ONE</div>
      </div>
    </div>
  );
}
