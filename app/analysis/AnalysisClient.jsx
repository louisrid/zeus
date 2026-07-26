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
  const [gate2, setGate2] = React.useState(null);
  const [minutes, setMinutes] = React.useState(null);
  const [attrib, setAttrib] = React.useState(null);
  const [rel, setRel] = React.useState(null);
  const [cov, setCov] = React.useState(null);
  const [calib, setCalib] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    Promise.all([
      sb().from("history_position_season").select("*"),
      sb().from("history_value_band").select("*"),
      sb().from("history_coverage").select("*").order("season"),
      sb().from("model_gates").select("*"),
      sb().from("strategy_findings").select("section, finding, evidence").limit(60),
      sb().from("baseline_gate").select("*").order("run_at", { ascending: false }).limit(40),
      sb().from("minutes_scorecard").select("*").order("run_at", { ascending: false }).limit(20),
      sb().from("component_attribution").select("*").order("run_at", { ascending: false }).limit(60),
      sb().from("reliability_bins").select("*").order("run_at", { ascending: false }).limit(60),
      sb().from("minutes_coverage").select("*").order("run_at", { ascending: false }).limit(1),
      sb().from("calibration_metrics").select("*").order("run_at", { ascending: false }).limit(60),
    ])
      .then(([a, b, c, d, e, g, mins, attrib, rel, cov, calib]) => {
        setPosSeason(a.data || []);
        setBands(b.data || []);
        setCoverage(c.data || []);
        setGate(d.data || []);
        setFindings(e.data || []);
        setGate2(g.data || []);
        setMinutes(mins.data || []);
        setAttrib(attrib.data || []);
        setRel(rel.data || []);
        setCov((cov.data || [])[0] || null);
        setCalib(calib.data || []);
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

      <Section eyebrow="Baseline gate" title="Does the model beat the simple alternatives?" accent={T.cyan}
        note="Judged on rank correlation, not average error. FPL points are heavily skewed, so a constant near the median wins average error while ordering nobody, and the tool's job is to say who to pick. Big misses is root-mean-square error, which punishes being badly wrong more than being slightly wrong."
        empty={!gate2 || gate2.length === 0
          ? "The gate has not run. It grades the on-screen number against three baselines on a season the model has never seen, and its verdict is what turns INTERIM SCORE into a real projection."
          : null}>
        {gate2 && gate2.length > 0 && (() => {
          const latest = gate2[0].run_at;
          const rows = gate2.filter((r) => r.run_at === latest);
          const verdict = rows.find((r) => r.model === "blend" && r.position === null);
          const scopes = [null, "GKP", "DEF", "MID", "FWD"];
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Plate w={110} color={verdict && verdict.beats_best_baseline ? T.green : T.pink}>
                  {verdict && verdict.beats_best_baseline ? "PASSED" : "FAILED"}
                </Plate>
                <span style={lang(15, 700)}>
                  Held out season {rows[0].held_out_season}, never used for fitting
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Row head grid="80px 150px 1fr 1fr 1fr" cells={[
                  <span key="a" style={lang(13, 600)}>Scope</span>,
                  <span key="b" style={lang(13, 600)}>Model</span>,
                  <span key="c" style={{ ...lang(13, 600), textAlign: "center" }}>Ranking</span>,
                  <span key="d" style={{ ...lang(13, 600), textAlign: "center" }}>Big misses</span>,
                  <span key="e" style={{ ...lang(13, 600), textAlign: "center" }}>Avg error</span>,
                ]} />
                {scopes.flatMap((scope) => rows.filter((r) => r.position === scope).map((r) => (
                  <Row key={`${scope}-${r.model}`} grid="80px 150px 1fr 1fr 1fr" cells={[
                    <span key="a" style={code(13)}>{scope || "ALL"}</span>,
                    <span key="b" style={lang(14, r.model === "blend" ? 700 : 600)}>{r.model.replace(/_/g, " ")}</span>,
                    <Value key="c" color={r.model === "blend" ? T.green : "#FFFFFF"}>
                      {r.spearman === null ? "No data" : Number(r.spearman).toFixed(4)}
                    </Value>,
                    <Value key="d">{Number(r.rmse).toFixed(3)}</Value>,
                    <Value key="e">{Number(r.mae).toFixed(3)}</Value>,
                  ]} />
                )))}
              </div>
              {verdict && verdict.note && (
                <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: 0 }}>{verdict.note}</p>
              )}
            </>
          );
        })()}
      </Section>

      <Section eyebrow="Minutes" title="How well minutes are predicted" accent={T.cyan}
        note="Minutes multiply every other component and are far less noisy than points, so they get their own scorecard. Brier score: lower is better. The benchmark is always predicting the league base rate."
        empty={!minutes || minutes.length === 0
          ? "The minutes scorecard has not run. It grades the start and minutes predictions on a season the model has never seen, split by settled and rotation-heavy squads."
          : null}>
        {minutes && minutes.length > 0 && (() => {
          const latest = minutes[0].run_at;
          const rows = minutes.filter((r) => r.run_at === latest);
          const all = rows.find((r) => r.bucket === "ALL");
          const order = ["ALL", "settled", "rotation-heavy", "unknown"];
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Plate w={110} color={all && all.beats_baseline ? T.green : T.pink}>
                  {all && all.beats_baseline ? "PASSED" : "FAILED"}
                </Plate>
                <span style={lang(15, 700)}>Held out season {rows[0].held_out_season}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Row head grid="140px 76px 1fr 1fr 1fr 1fr" cells={[
                  <span key="a" style={lang(13, 600)}>Squad type</span>,
                  <span key="b" style={{ ...lang(13, 600), textAlign: "center" }}>Rows</span>,
                  <span key="c" style={{ ...lang(13, 600), textAlign: "center" }}>Starts right</span>,
                  <span key="d" style={{ ...lang(13, 600), textAlign: "center" }}>Brier start</span>,
                  <span key="e" style={{ ...lang(13, 600), textAlign: "center" }}>Brier 60+</span>,
                  <span key="f" style={{ ...lang(13, 600), textAlign: "center" }}>Minutes off by</span>,
                ]} />
                {order.filter((b) => rows.some((r) => r.bucket === b)).map((b) => {
                  const r = rows.find((x) => x.bucket === b);
                  return (
                    <Row key={b} grid="140px 76px 1fr 1fr 1fr 1fr" cells={[
                      <span key="a" style={lang(14, b === "ALL" ? 700 : 600)}>{b === "ALL" ? "Everyone" : b}</span>,
                      <Value key="b">{Number(r.n).toLocaleString("en-GB")}</Value>,
                      <Value key="c" color={T.green}>{(Number(r.start_accuracy) * 100).toFixed(1)}%</Value>,
                      <Value key="d">{Number(r.brier_start).toFixed(4)}</Value>,
                      <Value key="e">{Number(r.brier_60).toFixed(4)}</Value>,
                      <Value key="f">{Number(r.mae_minutes).toFixed(1)}</Value>,
                    ]} />
                  );
                })}
                {all && (
                  <Row grid="140px 76px 1fr 1fr 1fr 1fr" cells={[
                    <span key="a" style={lang(14, 600)}>Base rate only</span>,
                    <span key="b" />,
                    <span key="c" />,
                    <Value key="d" color={T.pink}>{Number(all.baseline_brier_start).toFixed(4)}</Value>,
                    <span key="e" />,
                    <span key="f" />,
                  ]} />
                )}
              </div>
            </>
          );
        })()}
      </Section>

      <Section eyebrow="Reliability" title="When it says 6.0, does 6.0 happen?" accent={T.tag}
        note="Predictions sorted and split into five equal groups. Bias is predicted minus actual, so positive means over-predicting. A model can rank correctly and still be miscalibrated, and a number that is systematically wrong has not earned a real projection label."
        empty={!rel || rel.length === 0
          ? "Reliability has not run. It compares what the model predicted against what happened, in five bands, on a season it has never seen."
          : null}>
        {rel && rel.length > 0 && (() => {
          const latest = rel[0].run_at;
          const rows = rel.filter((r) => r.run_at === latest && r.position === null).sort((a, b) => a.bin - b.bin);
          const worst = rows.slice().sort((a, b) => Math.abs(Number(b.bias)) - Math.abs(Number(a.bias)))[0];
          return (
            <>
              {worst && (
                <p style={{ ...lang(14.5), lineHeight: 1.6, margin: 0 }}>
                  Largest miscalibration is band {worst.bin}, off by {Math.abs(Number(worst.bias)).toFixed(2)} points
                  {Number(worst.bias) > 0 ? " too high" : " too low"}.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Row head grid="80px 90px 1fr 1fr 1fr" cells={[
                  <span key="a" style={lang(13, 600)}>Band</span>,
                  <span key="b" style={{ ...lang(13, 600), textAlign: "center" }}>Rows</span>,
                  <span key="c" style={{ ...lang(13, 600), textAlign: "center" }}>Predicted</span>,
                  <span key="d" style={{ ...lang(13, 600), textAlign: "center" }}>Actual</span>,
                  <span key="e" style={{ ...lang(13, 600), textAlign: "center" }}>Off by</span>,
                ]} />
                {rows.map((r) => (
                  <Row key={r.bin} grid="80px 90px 1fr 1fr 1fr" cells={[
                    <span key="a" style={code(13)}>{r.bin}</span>,
                    <Value key="b">{Number(r.n).toLocaleString("en-GB")}</Value>,
                    <Value key="c">{Number(r.mean_predicted).toFixed(3)}</Value>,
                    <Value key="d">{Number(r.mean_actual).toFixed(3)}</Value>,
                    <Value key="e" color={Math.abs(Number(r.bias)) > 0.25 ? T.pink : T.green}>
                      {Number(r.bias) >= 0 ? "+" : ""}{Number(r.bias).toFixed(3)}
                    </Value>,
                  ]} />
                ))}
              </div>
            </>
          );
        })()}
      </Section>

      <Section eyebrow="Minutes coverage" title="Is the minutes scaling reaching the squad?"
        note="The scorer multiplies a per-90 rate by expected minutes, which is the largest single source of its accuracy. It only applies where a forecast exists."
        empty={!cov
          ? "No coverage recorded. It is measured by the reliability job."
          : null}>
        {cov && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Plate w={92} color={Number(cov.coverage) >= 0.8 ? T.green : Number(cov.coverage) >= 0.4 ? "#FFFFFF" : T.pink}>
              {(Number(cov.coverage) * 100).toFixed(1)}%
            </Plate>
            <span style={lang(15, 700)}>
              {cov.players_with_forecast} of {cov.players_total} players have a GW{cov.gw} forecast
            </span>
          </div>
        )}
      </Section>

      <Section eyebrow="Attribution" title="Where the points actually come from" accent={T.cyan}
        note="Share of movement is the share of all absolute point movement. A large share is where a single-number projection has the most room to be wrong, because the model predicts a total and never says which component it expects."
        empty={!attrib || attrib.length === 0
          ? "Attribution has not run. It decomposes every scoring event on the held-out season into appearance, goals, assists, clean sheets, bonus, saves and negatives, so a miss can be traced to a component."
          : null}>
        {attrib && attrib.length > 0 && (() => {
          const latest = attrib[0].run_at;
          const rows = attrib.filter((r) => r.run_at === latest && r.position === null)
            .sort((a, b) => Number(b.share_of_movement) - Number(a.share_of_movement));
          const top = rows[0];
          return (
            <>
              {top && (
                <p style={{ ...lang(14.5), lineHeight: 1.6, margin: 0 }}>
                  {top.component.replace(/_/g, " ")} is the largest single driver at{" "}
                  {(Number(top.share_of_movement) * 100).toFixed(1)} per cent of all point movement.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Row head grid="150px 110px 1fr" cells={[
                  <span key="a" style={lang(13, 600)}>Component</span>,
                  <span key="b" style={{ ...lang(13, 600), textAlign: "center" }}>Season points</span>,
                  <span key="c" style={{ ...lang(13, 600), textAlign: "center" }}>Share of movement</span>,
                ]} />
                {rows.map((r) => {
                  const pct = Number(r.share_of_movement) * 100;
                  return (
                    <Row key={r.component} grid="150px 110px 1fr" cells={[
                      <span key="a" style={lang(14, 600)}>{r.component.replace(/_/g, " ")}</span>,
                      <Value key="b" color={Number(r.total_points) < 0 ? T.pink : "#FFFFFF"}>{Number(r.total_points).toFixed(0)}</Value>,
                      <span key="c" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ flex: 1, height: 6, borderRadius: 3, background: T.plate, overflow: "hidden" }}>
                          <span style={{ display: "block", height: 6, width: `${pct}%`, background: pct >= 25 ? T.green : T.cyan }} />
                        </span>
                        <span style={val(13.5)}>{pct.toFixed(1)}%</span>
                      </span>,
                    ]} />
                  );
                })}
              </div>
            </>
          );
        })()}
      </Section>

      <Section eyebrow="Bonus points" title="BPS backtest" accent={T.cyan}
        note="The 2026/27 bonus rules did not exist in any historical season, so this is graded on 2025/26 match data only."
        empty={!calib || calib.length === 0
          ? "No BPS backtest results recorded. The job runs as part of archive-2526 and writes here."
          : null}>
        {calib && calib.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Row head grid="150px 130px 1fr 1fr" cells={[
              <span key="a" style={lang(13, 600)}>Component</span>,
              <span key="b" style={lang(13, 600)}>Metric</span>,
              <span key="c" style={{ ...lang(13, 600), textAlign: "center" }}>Value</span>,
              <span key="d" style={{ ...lang(13, 600), textAlign: "center" }}>Window</span>,
            ]} />
            {calib.slice(0, 20).map((r, i) => (
              <Row key={i} grid="150px 130px 1fr 1fr" cells={[
                <span key="a" style={lang(14, 600)}>{r.component || "unnamed"}</span>,
                <span key="b" style={code(12.5)}>{r.metric || "none"}</span>,
                <Value key="c">{r.value === null ? "No data" : Number(r.value).toFixed(4)}</Value>,
                <Value key="d">{r.window || "all"}</Value>,
              ]} />
            ))}
          </div>
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
