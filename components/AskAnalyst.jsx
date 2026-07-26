"use client";
import React from "react";
import { T, S, Label, lang, val } from "../lib/ui";

/* ASK THE ANALYST. Fires only on an explicit press. Shows what the call cost and where the month
   stands against the cap, because a metered feature that hides its meter is how budgets die. */
export default function AskAnalyst({ getPayload, placeholder = "Ask about this squad" }) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState(null);
  const [err, setErr] = React.useState(null);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const payload = getPayload();
      if (!payload) { setErr("Nothing to analyse yet."); return; }
      const r = await fetch("/api/analyst", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, payload }),
      }).then((x) => x.json());
      if (!r.ok) { setErr(r.error || "The Analyst could not answer."); return; }
      setRes(r);
    } catch {
      setErr("The Analyst route is unreachable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label color={T.tag}>Analyst</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>Ask</h2>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          placeholder={placeholder}
          style={{ flex: 1, height: S.btn, padding: "0 16px", borderRadius: 12, background: T.row,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(14.5, 600), outline: "none" }} />
        <button onClick={ask} disabled={busy} className="fb-press"
          style={{ height: S.btn, padding: "0 22px", borderRadius: 999, background: T.green,
            ...lang(14.5, 700, "#04130A"), opacity: busy ? 0.5 : 1 }}>
          {busy ? "Thinking" : "Ask"}
        </button>
      </div>
      {err && <p style={{ ...lang(14, 600), lineHeight: 1.5, margin: 0, color: T.pink }}>{err}</p>}
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ ...lang(14.5), lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{res.answer}</p>
          <span style={val(12.5, "#FFFFFF", 500)}>
            THIS CALL ${res.usd.toFixed(3)} · MONTH ${res.monthSpend.toFixed(2)} OF ${res.cap.toFixed(2)}
          </span>
        </div>
      )}
    </section>
  );
}
