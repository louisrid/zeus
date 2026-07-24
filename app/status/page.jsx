"use client";
import React from "react";
import { T, S, Label, Card, SkeletonRows, ErrorCard, lang, val } from "../../lib/ui";
import { sb } from "../../lib/data";

export default function StatusPage() {
  const [beats, setBeats] = React.useState(null);
  const [counts, setCounts] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const load = React.useCallback(() => {
    setErr(false);
    Promise.all([
      sb().from("pipeline_heartbeats").select("*").order("job_name"),
      sb().from("players").select("fpl_id", { count: "exact", head: true }),
      sb().from("fixtures").select("fpl_id", { count: "exact", head: true }),
    ]).then(([b, p, f]) => {
      if (b.error) { setErr(true); return; }
      setBeats(b.data || []);
      setCounts({ players: p.count || 0, fixtures: f.count || 0 });
    }).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <ErrorCard onRetry={load} />;
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: S.gap }}>
      <Card eyebrow="Pipeline" title="Data status">
        {!beats ? <SkeletonRows n={3} h={52} /> : (
          <>
            {counts && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[["Players in database", counts.players], ["Fixtures loaded", counts.fixtures]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: T.row, borderRadius: S.radiusSm, padding: "16px 0" }}>
                    <span style={lang(14.5)}>{l}</span>
                    <span style={val(26)}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {beats.map((b) => (
              <div key={b.job_name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.row, borderRadius: S.radiusSm, padding: "0 16px", height: 52 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: b.status === "ok" ? T.green : T.pink, display: "inline-block" }} />
                  <span style={val(13, "#FFFFFF", 500)}>{b.job_name.toUpperCase()}</span>
                </span>
                <span style={val(13, b.status === "ok" ? T.green : T.pink)}>
                  {b.status === "ok" ? "OK" : "ERROR"} · {b.last_success_at ? new Date(b.last_success_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never"}
                </span>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}
