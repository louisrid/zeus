"use client";
import React from "react";

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
    /* 1.5 seconds, start to gone: 900ms of logo (it fades and swells in over the first 500), then a
       600ms fade of the whole overlay. Any longer and it is in the way; this is the Netflix beat. */
    const t1 = setTimeout(() => setFading(true), 900);
    const t2 = setTimeout(() => setShow(false), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!show) return null;
  return (
    <div className="fb-splash" style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, var(--card) 0%, var(--bg) 70%)", overflow: "hidden", maxWidth: "100vw",
      opacity: fading ? 0 : 1, transition: "opacity 600ms ease", pointerEvents: fading ? "none" : "auto" }}>
      <div style={{ textAlign: "center", maxWidth: "100%", padding: "0 16px" }}>
        {/* The display face at 56px is wider than a phone, and the splash sits over the page while it fades, so for
            those two seconds the whole document could be dragged sideways. It scales to the screen. */}
        <img src="/fplpal-logo.png" alt="FPLPAL" className="fb-splash-logo fb-logo"
          style={{ width: "min(360px, 72vw)", height: "auto", display: "block", margin: "0 auto" }} />
      </div>
    </div>
  );
}
