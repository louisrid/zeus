"use client";
import React from "react";
import { T, S, Label, Plate, Value, Skeleton, SkeletonRows, ErrorCard, lang, val, code } from "../../lib/ui";
import { sb } from "../../lib/data";
import FITTED from "../../config/fitted-params.json";
import SCHEDULE from "../../config/schedule.js";
import { metricLabel } from "../../lib/solver/score.mjs";

/* ANALYSIS — the evidence base. Everything on this page is either measured from the ten-season
   training set or read from config/fitted-params.json, where every value records how it was fitted.
   Sections whose data does not exist render a sentence saying where it comes from, per DECISIONS 2.1. */

const POS = ["GKP", "DEF", "MID", "FWD"];
const BANDS = ["under 5.0", "5.0 to 6.9", "7.0 to 8.9", "9.0 to 10.9", "11.0 and over"];

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

const Row = ({ cells, grid, head }) => (
  <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, alignItems: "center", padding: "0 10px",
    height: head ? 26 : 42, borderRadius: head ? 0 : S.radiusSm, background: head ? "transparent" : T.row }}>
    {cells}
  </div>
);

export default function AnalysisPage() {
  const [posSeason, setPosSeason] = React.useState(null);
  const [bands, setBands] = React.useState(null);
  const [coverage, setCoverage] = React.useState(null);
  const [gate, setGate] = React.useState(null);
  const [findings, setFindings] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    Promise.all([
      sb().from("history_position_season").select("*"),
      sb().from("history_value_band").select("*"),
      sb().from("history_coverage").select("*").order("season"),
      sb().from("model_gates").select("*"),
      sb().from("strategy_findings").select("section, finding, evidence").limit(60),
    ])
      .then(([a, b, c, d, e]) => {
        setPosSeason(a.data || []);
        setBands(b.data || []);
        setCoverage(c.data || []);
        setGate(d.data || []);
        setFindings(e.data || []);
      })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(load, [load]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!coverage) return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Skeleton h={120} /><SkeletonRows n={4} h={92} />
    </div>
  );

  const loaded = coverage.length > 0;
  const totalRows = coverage.reduce((a, r) => a + Number(r.rows || 0), 0);
  const seasons = coverage.map((r) => r.season);
  const xgSeasons = coverage.filter((r) => Number(r.rows_with_xg) > 0).map((r) => r.season);
  const defconSeasons = coverage.filter((r) => Number(r.rows_with_defcon) > 0).map((r) => r.season);

  // Points per 90 by position, averaged across whatever seasons are loaded.
  const perPos = {};
  for (const pos of POS) {
    const rows = (posSeason || []).filter((r) => r.position === pos && r.points_per_90 !== null);
    if (!rows.length) continue;
    const mins = rows.reduce((a, r) => a + Number(r.minutes), 0);
    const pts = rows.reduce((a, r) => a + Number(r.points), 0);
    perPos[pos] = { per90: mins ? (pts * 90) / mins : null, starts: rows.reduce((a, r) => a + Number(r.starts), 0) };
  }

  const bandFor = (pos, band) => {
    const rows = (bands || []).filter((r) => r.position === pos && r.band === band && r.points_per_90 !== null);
    if (!rows.length) return null;
    const mins = rows.reduce((a, r) => a + Number(r.minutes), 0);
    const pts = rows.reduce((a, r) => a + Number(r.points_per_90) * Number(r.minutes), 0);
    return mins ? pts / mins : null;
  };

  const xpGate = (gate || []).find((g) => g.key === "xp_visible");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Section eyebrow="Training set" title="What the model is fitted on"
        empty={!loaded
          ? "No history loaded yet. Run the history-load workflow and this page fills with ten seasons of measured evidence."
          : null}>
        <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lang(13.5, 600)}>Seasons</span><span style={val(24)}>{seasons.length}</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lang(13.5, 600)}>Player gameweeks</span><span style={val(24)}>{totalRows.toLocaleString("en-GB")}</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lang(13.5, 600)}>Seasons with expected goals</span><span style={val(24)}>{xgSeasons.length}</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lang(13.5, 600)}>Seasons with defensive contribution</span>
            <span style={val(24, defconSeasons.length <= 1 ? T.pink : "#FFFFFF")}>{defconSeasons.length}</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Row head grid="110px 1fr 1fr 1fr" cells={[
            <span key="s" style={lang(13, 600)}>Season</span>,
            <span key="r" style={{ ...lang(13, 600), textAlign: "center" }}>Rows</span>,
            <span key="x" style={{ ...lang(13, 600), textAlign: "center" }}>With xG</span>,
            <span key="d" style={{ ...lang(13, 600), textAlign: "center" }}>With DefCon</span>,
          ]} />
          {coverage.map((r) => (
            <Row key={r.season} grid="110px 1fr 1fr 1fr" cells={[
              <span key="s" style={val(13.5)}>{r.season}</span>,
              <Value key="r">{Number(r.rows).toLocaleString("en-GB")}</Value>,
              <Value key="x" color={Number(r.rows_with_xg) > 0 ? "#FFFFFF" : T.pink}>{Number(r.rows_with_xg) > 0 ? "Yes" : "No"}</Value>,
              <Value key="d" color={Number(r.rows_with_defcon) > 0 ? "#FFFFFF" : T.pink}>{Number(r.rows_with_defcon) > 0 ? "Yes" : "No"}</Value>,
            ]} />
          ))}
        </div>
        <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: 0 }}>
          Defensive contribution exists in one season only, so it cannot be validated historically.
          The 2026/27 bonus rules did not exist in any of these seasons either, which is what the BPS
          backtest covers separately.
        </p>
      </Section>

      <Section eyebrow="Position returns" title="What each position has returned"
        note="Measured across every loaded season. Points per 90 counts only minutes actually played, so it is not inflated by bench weeks."
        empty={Object.keys(perPos).length === 0 ? "Fills once the history load has run." : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Row head grid="90px 1fr 1fr 1fr" cells={[
            <span key="p" style={lang(13, 600)}>Position</span>,
            <span key="a" style={{ ...lang(13, 600), textAlign: "center" }}>Points per 90</span>,
            <span key="b" style={{ ...lang(13, 600), textAlign: "center" }}>Fitted per start</span>,
            <span key="c" style={{ ...lang(13, 600), textAlign: "center" }}>Starts observed</span>,
          ]} />
          {POS.filter((p) => perPos[p]).map((pos) => (
            <Row key={pos} grid="90px 1fr 1fr 1fr" cells={[
              <span key="p" style={code(13)}>{pos}</span>,
              <Value key="a" color={T.green}>{perPos[pos].per90.toFixed(3)}</Value>,
              <Value key="b">{FITTED.position_points_per_start[pos].toFixed(3)}</Value>,
              <Value key="c">{perPos[pos].starts.toLocaleString("en-GB")}</Value>,
            ]} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Value bands" title="What each price bracket returned" accent={T.cyan}
        note="Price bands are cut on the price recorded in that gameweek, so a player moves between bands across a season exactly as he did in reality."
        empty={!bands || bands.length === 0 ? "Fills once the history load has run." : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Row head grid="140px 1fr 1fr 1fr 1fr" cells={[
            <span key="b" style={lang(13, 600)}>Band</span>,
            ...POS.slice(1).map((p) => <span key={p} style={{ ...lang(13, 600), textAlign: "center" }}>{p}</span>),
            <span key="g" style={{ ...lang(13, 600), textAlign: "center" }}>GKP</span>,
          ]} />
          {BANDS.map((band) => (
            <Row key={band} grid="140px 1fr 1fr 1fr 1fr" cells={[
              <span key="b" style={lang(13.5, 700)}>{band}</span>,
              ...POS.slice(1).map((pos) => {
                const v = bandFor(pos, band);
                return <Value key={pos} color={v === null ? "#FFFFFF" : T.green}>{v === null ? "No data" : v.toFixed(2)}</Value>;
              }),
              (() => { const v = bandFor("GKP", band); return <Value key="g">{v === null ? "No data" : v.toFixed(2)}</Value>; })(),
            ]} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Promoted clubs" title="The promotion discount" accent={T.cyan}
        note={FITTED.promotion_factor._fitted_on}>
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lang(13.5, 600)}>Overall</span>
            <span style={val(24, T.pink)}>{FITTED.promotion_factor.overall.toFixed(3)}</span>
          </span>
          {POS.map((pos) => (
            <span key={pos} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lang(13.5, 600)}>{pos}</span>
              <span style={val(24)}>{FITTED.promotion_factor[pos].toFixed(3)}</span>
            </span>
          ))}
        </div>
        <p style={{ ...lang(14.5), lineHeight: 1.6, margin: 0 }}>
          A promoted-club player returns {(FITTED.promotion_factor.overall * 100).toFixed(0)} per cent of what
          everyone else returns in their first season back. Defenders are hit hardest at{" "}
          {(FITTED.promotion_factor.DEF * 100).toFixed(0)} per cent, forwards least at{" "}
          {(FITTED.promotion_factor.FWD * 100).toFixed(0)} per cent.
        </p>
      </Section>

      <Section eyebrow="Fitted parameters" title="Every value the model uses, and how it was fitted"
        note="Nothing here is hand-picked. Each entry records the seasons it was fitted on and the method.">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Row grid="1fr 120px" cells={[
            <span key="a" style={lang(14.5, 700)}>History blend, k</span>,
            <Value key="b">{FITTED.history_blend_k.value}</Value>,
          ]} />
          <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: "0 0 6px 10px" }}>{FITTED.history_blend_k._note}</p>
          <Row grid="1fr 120px" cells={[
            <span key="a" style={lang(14.5, 700)}>Starts proxy agreement</span>,
            <Value key="b" color={T.green}>{(FITTED.starts_proxy.agreement * 100).toFixed(1)}%</Value>,
          ]} />
          <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: "0 0 0 10px" }}>{FITTED.starts_proxy._note}</p>
        </div>
      </Section>

      <Section eyebrow="Calibration" title="Whether the projections have been proven" accent={T.tag}
        empty={!xpGate
          ? "No calibration gate recorded. Run migration 004 if this persists."
          : null}>
        {xpGate && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Plate w={110} color={xpGate.passed ? T.green : T.pink}>{xpGate.passed ? "PASSED" : "NOT RUN"}</Plate>
              <span style={lang(15, 700)}>Projections show as {metricLabel(Boolean(xpGate.passed))}</span>
            </div>
            <p style={{ ...lang(14.5), lineHeight: 1.6, margin: 0 }}>{xpGate.note}</p>
          </>
        )}
      </Section>

      <Section eyebrow="Strategy study" title="What actually won"
        empty={!findings || findings.length === 0
          ? `The strategy study has not run. Ten seasons of structures, value bands, premium counts, ownership and winner behaviour arrive here by ${SCHEDULE.complete.label}, and the template target band comes with it.`
          : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(findings || []).map((f, i) => (
            <div key={i} style={{ background: T.row, borderRadius: S.radiusSm, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={code(12.5)}>{f.section}</span>
              <span style={lang(15, 700)}>{f.finding}</span>
              {f.evidence && <span style={{ ...lang(13.5, 600), lineHeight: 1.5 }}>{f.evidence}</span>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
