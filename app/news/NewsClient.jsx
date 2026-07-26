"use client";
import React from "react";
import Link from "next/link";
import { T, S, Kit, Label, Plate, Value, Skeleton, SkeletonRows, ErrorCard, lang, val, code } from "../../lib/ui";
import { sb, loadCore, fixtureSwings } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildXPrice } from "../../lib/xprice.mjs";
import { buildInsights } from "../../lib/insights.mjs";

/* NEWS — parsed team news and price movement. Both come from jobs that already run: presser-pull
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
      {!empty && note && <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: 0 }}>{note}</p>}
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
        const xprice = buildXPrice(pool, model.scoreOf, model.sourceOf);
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
    if (!p) return <span style={lang(14.5, 700)}>Unknown player</span>;
    return (
      <Link href={`/player/${p.fpl_id}`} style={{ textDecoration: "none", minWidth: 0 }}>
        <span className="fb-hover" style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Kit team={p.team} size={20} />
          <span style={{ ...lang(14.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
          <span style={code(12.5)}>{p.team}</span>
        </span>
      </Link>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Section eyebrow="Noticed" title="Things worth knowing about your options" accent={T.tag}
        note="Every line carries the numbers behind it. Nothing here is generated prose."
        empty={!noticed || !noticed.insights.length
          ? "Nothing stands out yet. Observations appear as prices, ownership and availability start moving."
          : null}>
        {noticed && noticed.insights.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {noticed.insights.slice(0, 14).map((i, k) => (
              <div key={k} style={{ background: T.row, borderRadius: S.radiusSm, padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: 5,
                borderLeft: `3px solid ${i.kind === "risky_but_owned" ? T.pink : i.kind === "underpriced" ? T.green : i.kind === "overpriced" ? T.pink : T.cyan}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <PlayerCell id={i.player.id} />
                  <span style={lang(14.5, 700)}>{i.headline}</span>
                </span>
                <span style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>{i.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section eyebrow="Fixture swings" title="Who to own for the easing runs" accent={T.green}
        note="The best-projected players at each club whose fixtures are opening up."
        empty={!noticed || !noticed.swingTargets.length
          ? "No swings to act on. This fills once enough fixtures are published to compare runs."
          : null}>
        {noticed && noticed.swingTargets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {noticed.swingTargets.map((r) => (
              <div key={r.team} style={{ background: T.row, borderRadius: S.radiusSm, padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Kit team={r.team} size={22} />
                  <span style={code(13)}>{r.team}</span>
                  <Plate w={54} color={T.green}>{Math.round(r.difficulty)}</Plate>
                </span>
                {r.players.map((p) => <PlayerCell key={p.fpl_id} id={p.id} />)}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section eyebrow="Team news" title="Parsed press conference signals"
        note={presserBeat && presserBeat.last_success_at
          ? `Last pull ${when(presserBeat.last_success_at)}. The job runs every Friday morning.`
          : "The presser job runs every Friday morning."}
        empty={!signals || signals.length === 0
          ? "No signals yet. The presser job parses Friday press conferences and writes what managers actually said about availability. It has either not run yet this week, or found nothing worth recording."
          : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(signals || []).map((s, i) => (
            <div key={i} style={{ background: T.row, borderRadius: S.radiusSm, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <PlayerCell id={s.player_id} />
                <Plate w={104} color={SIGNAL_TONE[s.signal] || "#FFFFFF"}>{SIGNAL_WORD[s.signal] || s.signal}</Plate>
                {s.confidence !== null && s.confidence !== undefined && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={lang(12.5, 600)}>Confidence</span>
                    <span style={val(13.5)}>{Math.round(Number(s.confidence) * 100)}%</span>
                  </span>
                )}
                <span style={{ ...val(12.5, "#FFFFFF", 500), marginLeft: "auto" }}>GW{s.gw}</span>
              </div>
              {s.summary && <span style={{ ...lang(14), lineHeight: 1.55 }}>{s.summary}</span>}
              {s.source_url && (
                <a href={s.source_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <span style={lang(13, 700, T.green)}>Source</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Price moves" title="Every recorded change" accent={T.cyan}
        note={pullBeat && pullBeat.last_success_at
          ? `Prices checked every six hours, last at ${when(pullBeat.last_success_at)}.`
          : null}
        empty={!prices || prices.length === 0
          ? "No price changes recorded yet. The pull logs a row the first time it sees a price differ from the one it stored, so this stays empty until the first move happens."
          : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) 96px 78px 78px 90px", gap: 8, alignItems: "center", padding: "0 12px", height: 26 }}>
            {["Player", "Date", "From", "To", "Direction"].map((h, i) => (
              <span key={h} style={{ ...lang(13, 600), textAlign: i === 0 ? "left" : "center" }}>{h}</span>
            ))}
          </div>
          {(prices || []).map((r, i) => {
            const up = Number(r.new_price) > Number(r.old_price);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) 96px 78px 78px 90px", gap: 8, alignItems: "center",
                padding: "0 12px", height: 46, borderRadius: S.radiusSm, background: T.row }}>
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

      <Section eyebrow="Tonight's rise risk" title="Who is about to move" accent={T.tag}
        empty="Rise and fall prediction needs net transfer velocity across a full day, which the pull started recording only recently. This fills once there are two consecutive days of transfer counts to compare.">
        <span />
      </Section>
    </div>
  );
}
