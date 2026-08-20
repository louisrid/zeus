"use client";
import React from "react";
import Link from "next/link";
import { T, S, Kit, Label, Value, Skeleton, SkeletonRows, ErrorCard, lang, code } from "../../lib/ui";
import { sb, loadCore, fixtureSwings } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildXPrice } from "../../lib/xprice.mjs";
import { buildInsights } from "../../lib/insights.mjs";

/* NEWS , parsed team news and price movement. Both come from jobs that already run: presser-pull
   on Fridays writes presser_signals, fpl-pull logs every price change. Nothing here is generated;
   if a source is empty the section says where it comes from, per DECISIONS 2.1. */

const SIGNAL_TONE = { out: T.pink, doubt: T.pink, rested: "#FFFFFF", confirmed: T.green };
const SIGNAL_WORD = { out: "Ruled out", doubt: "Doubtful", rested: "Being rested", confirmed: "Confirmed fit" };

function Section({ eyebrow, title, note, children, empty, accent = T.green }) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label color={accent}>{eyebrow}</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>{title}</h2>
      </div>
      {empty ? <p style={{ ...lang(15), lineHeight: 1.6, margin: 0 }}>{empty}</p> : children}
      {!empty && note && <p style={{ ...lang(13.5, 500), lineHeight: 1.5, margin: 0 }}>{note}</p>}
    </section>
  );
}

export default function NewsClient() {
  const [core, setCore] = React.useState(null);
  const [signals, setSignals] = React.useState(null);
  const [prices, setPrices] = React.useState(null);
  const [beats, setBeats] = React.useState(null);
  const [noticed, setNoticed] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then(async (c) => {
        setCore(c);
        const [s, p, h] = await Promise.all([
          sb().from("presser_signals").select("player_id, gw, signal, confidence, summary, source_url, captured_at")
            .order("captured_at", { ascending: false }).limit(60),
          sb().from("player_price_history").select("player_id, date, old_price, new_price")
            .order("date", { ascending: false }).limit(60),
          sb().from("pipeline_heartbeats").select("job_name, status, last_success_at, message"),
        ]);
        setSignals(s.data || []);
        setPrices(p.data || []);
        setBeats(h.data || []);

        // Things worth noticing: every observation carries the numbers that produced it.
        const model = await loadModel(c);
        const pool = c.players;
        const xprice = buildXPrice(pool, (pl) => model.lastSeasonPoints(pl) ?? 0, (pl) => (model.lastSeasonPoints(pl) === null ? "none" : "archive"));
        const { data: duties } = await sb().from("set_piece_duty").select("player_id").eq("kind", "pen");
        const idToFpl = new Map(pool.map((x) => [x.id, x.fpl_id]));
        const takerIds = (duties || []).map((d) => idToFpl.get(d.player_id)).filter(Boolean);
        setNoticed(buildInsights({
          pool, scoreOf: model.scoreOf, xprice, penaltyTakerIds: takerIds,
          swings: fixtureSwings(c.fixtures, c.teamById, c.currentGw),
        }));
      })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(load, [load]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core) return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Skeleton h={110} /><SkeletonRows n={3} h={100} />
    </div>
  );

  const byId = {};
  for (const p of core.players) byId[p.id] = p;
  const presserBeat = (beats || []).find((b) => b.job_name === "presser_pull");
  const pullBeat = (beats || []).find((b) => b.job_name === "fpl_bootstrap");
  const when = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const PlayerCell = ({ id }) => {
    const p = byId[id];
    if (!p) return <span style={lang(14.5, 500)}>Unknown player</span>;
    return (
      <Link href={`/player/${p.fpl_id}`} style={{ textDecoration: "none", minWidth: 0 }}>
        <span className="fb-hover" style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Kit team={p.team} size={20} />
          <span style={{ ...lang(14.5, 500), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
          <span style={code(13)}>{p.team}</span>
        </span>
      </Link>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Section eyebrow="Noticed" title="Things worth knowing about your options" accent={T.tag}
        empty={!noticed || !noticed.insights.length
          ? "Nothing stands out yet."
          : null}>
        {noticed && noticed.insights.length > 0 && (
          <div className="zeus-notice-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {noticed.insights.slice(0, 16).map((i, k) => (
              <div key={k} style={{ background: T.row, borderRadius: S.radiusSm, padding: 16,
                display: "flex", flexDirection: "column", gap: 8, minHeight: 132,
                border: `1px solid ${i.kind === "risky_but_owned" || i.kind === "overpriced" ? T.pink
                  : i.kind === "underpriced" ? T.green : T.line}` }}>
                <PlayerCell id={i.player.id} />
                <span style={{ ...lang(16, 700), lineHeight: 1.3 }}>{i.headline}</span>
                <span style={{ ...lang(14, 500), lineHeight: 1.5 }}>{i.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Section>



      <Section eyebrow="Price moves" title="Every recorded change" accent={T.cyan}
        note={pullBeat && pullBeat.last_success_at
          ? `Prices checked every six hours, last at ${when(pullBeat.last_success_at)}.`
          : null}
        empty={!prices || prices.length === 0
          ? "No price changes recorded."
          : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="zeus-status-head" style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) 96px 78px 78px 90px", gap: 8, alignItems: "center", padding: "0 12px", height: 26 }}>
            {["Player", "Date", "From", "To", "Direction"].map((h, i) => (
              <span key={h} style={{ ...lang(13, 500), textAlign: i === 0 ? "left" : "center" }}>{h}</span>
            ))}
          </div>
          {(prices || []).map((r, i) => {
            const up = Number(r.new_price) > Number(r.old_price);
            return (
              <div key={i} className="zeus-news-row" style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) 96px 78px 78px 90px", gap: 8, alignItems: "center",
                padding: "0 12px", minHeight: 46, borderRadius: S.radiusSm, background: T.row }}>
                <PlayerCell id={r.player_id} />
                <Value>{when(r.date)}</Value>
                <Value>{Number(r.old_price).toFixed(1)}</Value>
                <Value color={up ? T.green : T.pink}>{Number(r.new_price).toFixed(1)}</Value>
                <span style={{ ...lang(13.5, 700, up ? T.green : T.pink), textAlign: "center" }}>{up ? "Rise" : "Fall"}</span>
              </div>
            );
          })}
        </div>
      </Section>

    </div>
  );
}
