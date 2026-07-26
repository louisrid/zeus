"use client";
import React from "react";
import { T, S, Label, Plate, Value, Skeleton, SkeletonRows, ErrorCard, lang, val, code } from "../../lib/ui";
import { sb } from "../../lib/data";
import SCHEDULE from "../../config/schedule.js";
import ModelEvidence from "../../components/ModelEvidence";

/* READINESS BOARD.
 *
 * The failure that costs rank is not a loud one. It is a job that stopped writing three weeks ago
 * while every page kept rendering old numbers as though they were today's. This page exists to make
 * that impossible to miss. Every check states what it needs, what it found, and what to do.
 */

const HOUR = 3600000;

const JOBS = [
  { name: "fpl_bootstrap", label: "Players, prices, fixtures", maxAgeHours: 12, critical: true, fix: "Actions, fpl-pull, Run workflow" },
  { name: "odds_pull", label: "Betting odds", maxAgeHours: 24, critical: true, fix: "Odds pull has not run." },
  { name: "projections_run", label: "Projections and minutes forecasts", maxAgeHours: 84, critical: true, fix: "Actions, projections-run, Run workflow" },
  { name: "understat_pull", label: "Shot data", maxAgeHours: 192, critical: false, fix: "Actions, understat-pull, Run workflow" },
  { name: "presser_pull", label: "Team news", maxAgeHours: 192, critical: false, fix: "Actions, presser-pull, Run workflow" },
  { name: "archive_2526", label: "Last season archive", maxAgeHours: null, critical: false, fix: "Actions, archive-2526, Run workflow" },
  { name: "history_load", label: "Ten-season training set", maxAgeHours: null, critical: true, fix: "Actions, history-load, Run workflow" },
  { name: "baseline_gate", label: "Baseline gate", maxAgeHours: null, critical: false, fix: "Actions, baseline-gate, Run workflow" },
  { name: "minutes_scorecard", label: "Minutes scorecard", maxAgeHours: null, critical: false, fix: "Actions, minutes-scorecard, Run workflow" },
  { name: "component_attribution", label: "Component attribution", maxAgeHours: null, critical: false, fix: "Actions, component-attribution, Run workflow" },
  { name: "reliability", label: "Reliability and coverage", maxAgeHours: null, critical: false, fix: "Actions, reliability, Run workflow" },
  { name: "penalty_duty", label: "Penalty takers", maxAgeHours: null, critical: false, fix: "Actions, penalty-duty, Run workflow" },
  { name: "rival_pull", label: "Top-rank squads", maxAgeHours: null, critical: false, fix: "Nothing to fetch until GW1 has been played" },
];

const ageOf = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / HOUR : null);

function jobVerdict(beat, spec) {
  if (!beat) return { tone: spec.critical ? T.pink : "#FFFFFF", label: "NEVER RUN", detail: spec.fix };
  if (beat.status === "error") return { tone: T.pink, label: "FAILED", detail: beat.message || spec.fix };
  const age = ageOf(beat.last_success_at);
  if (age === null) return { tone: T.pink, label: "NO SUCCESS", detail: spec.fix };
  if (spec.maxAgeHours !== null && age > spec.maxAgeHours) {
    return { tone: T.pink, label: "STALE", detail: `Last success ${Math.round(age)}h ago, expected within ${spec.maxAgeHours}h. ${spec.fix}` };
  }
  return { tone: T.green, label: "OK", detail: beat.message || "" };
}

function Section({ eyebrow, title, note, children, accent = T.green }) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label color={accent}>{eyebrow}</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>{title}</h2>
      </div>
      {children}
      {note && <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: 0 }}>{note}</p>}
    </section>
  );
}

export default function StatusPage() {
  const [beats, setBeats] = React.useState(null);
  const [tables, setTables] = React.useState(null);
  const [gate, setGate] = React.useState(null);
  const [cov, setCov] = React.useState(null);
  const [quarantine, setQuarantine] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    const count = (t, apply) => {
      let q = sb().from(t).select("*", { count: "exact", head: true });
      if (apply) q = apply(q);
      return q.then(({ count: c }) => (c === null || c === undefined ? 0 : c)).catch(() => null);
    };
    Promise.all([
      sb().from("pipeline_heartbeats").select("*").order("job_name"),
      Promise.all([
        count("players", (q) => q.not("archive", "is", true)),
        count("fixtures"), count("history_player_gw"), count("projections"),
        count("minutes_forecasts"), count("understat_player_season"), count("set_piece_duty"),
        count("availability_history"), count("eo_snapshots"), count("squad_drafts"),
      ]),
      sb().from("model_gates").select("*"),
      sb().from("minutes_coverage").select("*").order("run_at", { ascending: false }).limit(1),
      count("ingest_quarantine"),
    ])
      .then(([b, c, g, cv, q]) => {
        if (b.error) { setErr(true); return; }
        setBeats(b.data || []);
        setTables({ players: c[0], fixtures: c[1], history: c[2], projections: c[3], minutes: c[4],
          understat: c[5], setPieces: c[6], availability: c[7], eo: c[8], drafts: c[9] });
        setGate((g.data || []).find((x) => x.key === "xp_visible") || null);
        setCov((cv.data || [])[0] || null);
        setQuarantine(q);
      })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!beats || !tables) return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Skeleton h={120} /><SkeletonRows n={4} h={80} />
    </div>
  );

  const beatBy = new Map(beats.map((b) => [b.job_name, b]));
  const verdicts = JOBS.map((spec) => ({ spec, v: jobVerdict(beatBy.get(spec.name), spec) }));
  const problems = verdicts.filter(({ v }) => v.tone === T.pink);
  const critical = problems.filter(({ spec }) => spec.critical);

  const CHECKS = [
    ["Live players", tables.players, 400, "fpl-pull has not populated the squad"],
    ["Fixtures", tables.fixtures, 300, "fpl-pull has not populated fixtures"],
    ["Training set rows", tables.history, 200000, "history-load has not run to completion",
      // The source files hold 253,900 player-gameweeks. Materially more means duplicates, which is
      // worse than an empty table because every diagnostic still runs and quietly reports nonsense.
      tables.history > 260000 ? "Duplicate rows detected." : null],
    ["Projections", tables.projections, 1, "projections-run has not written any"],
    ["Minutes forecasts", tables.minutes, 1, "projections-run has not written any"],
    ["Shot data rows", tables.understat, 1, "understat-pull has not run"],
    ["Penalty takers", tables.setPieces, 1, "penalty-duty has not run"],
    ["Availability changes", tables.availability, 0, "builds up over time, nothing to do"],
    ["Top-rank snapshots", tables.eo, 0, "rival-pull has nothing to fetch until GW1"],
    ["Saved drafts", tables.drafts, 0, "yours to create"],
  ];
  const tableProblems = CHECKS.filter(([, n, min]) => n !== null && min > 0 && n < min);
  const ready = critical.length === 0 && tableProblems.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Section eyebrow="Readiness" title={ready ? "Everything critical is current" : "Attention needed"}
        accent={ready ? T.green : T.pink}
        note={`Complete project target ${SCHEDULE.complete.label}. Freshness is judged against each job's own schedule, so a weekly job is not called stale after a day.`}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Plate w={132} color={ready ? T.green : T.pink}>{ready ? "READY" : `${critical.length + tableProblems.length} ISSUES`}</Plate>
          <span style={lang(15, 700)}>
            {ready ? "All pipelines current."
                   : "Fix the items below before the deadline."}
          </span>
        </div>
        {problems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {problems.map(({ spec, v }) => (
              <div key={spec.name} style={{ background: T.row, borderRadius: S.radiusSm, padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: 5, borderLeft: `3px solid ${v.tone}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span style={val(13, v.tone, 500)}>{v.label}</span>
                  <span style={lang(15, 700)}>{spec.label}</span>
                  {spec.critical && <span style={val(13, T.pink, 500)}>CRITICAL</span>}
                </span>
                <span style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>{v.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section eyebrow="Pipelines" title="Every job, and when it last succeeded">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) 96px 110px", gap: 8, alignItems: "center", padding: "0 12px", height: 26 }}>
            {["Job", "State", "Last success"].map((h, i) => (
              <span key={h} style={{ ...lang(13, 600), textAlign: i === 0 ? "left" : "center" }}>{h}</span>
            ))}
          </div>
          {verdicts.map(({ spec, v }) => {
            const beat = beatBy.get(spec.name);
            const age = beat ? ageOf(beat.last_success_at) : null;
            return (
              <div key={spec.name} style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) 96px 110px", gap: 8,
                alignItems: "center", padding: "0 12px", minHeight: 44, borderRadius: S.radiusSm, background: T.row }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={lang(14.5, 700)}>{spec.label}</span>
                  <span style={code(13)}>{spec.name}</span>
                </span>
                <span style={{ ...val(13, v.tone, 500), textAlign: "center" }}>{v.label}</span>
                <Value color={v.tone}>{age === null ? "Never" : age < 1 ? "Under 1h" : `${Math.round(age)}h ago`}</Value>
              </div>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="Data" title="What is actually in the database" accent={T.cyan}
        note="A table that should hold rows and holds none is a silent failure: every page keeps rendering, just with nothing behind it.">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CHECKS.map(([label, n, min, fix, overflow]) => {
            const bad = (n !== null && min > 0 && n < min) || Boolean(overflow);
            return (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) 120px 1fr", gap: 8,
                alignItems: "center", padding: "0 12px", minHeight: 44, borderRadius: S.radiusSm, background: T.row,
                borderLeft: `3px solid ${bad ? T.pink : "transparent"}` }}>
                <span style={lang(14.5, 700)}>{label}</span>
                <Value color={bad ? T.pink : n === 0 ? "#FFFFFF" : T.green}>
                  {n === null ? "Unreadable" : Number(n).toLocaleString("en-GB")}
                </Value>
                <span style={{ ...lang(13, 600), lineHeight: 1.4 }}>{overflow || (bad ? fix : "")}</span>
              </div>
            );
          })}
        </div>
        {quarantine !== null && quarantine > 0 && (
          <span style={val(13, T.pink, 500)}>{quarantine} ROWS QUARANTINED AT INGESTION · SEE ingest_quarantine FOR THE REASON</span>
        )}
      </Section>

      <Section eyebrow="Model" title="Where the numbers stand" accent={T.tag}>
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lang(13.5, 600)}>Calibration gate</span>
            <span style={val(18, gate && gate.passed ? T.green : T.pink)}>{gate ? (gate.passed ? "Passed" : "Not run") : "MISSING"}</span>
          </span>
          {cov && (
            <>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lang(13.5, 600)}>Minutes coverage</span>
                <span style={val(18, Number(cov.coverage) >= 0.8 ? T.green : T.pink)}>{(Number(cov.coverage) * 100).toFixed(1)}%</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lang(13.5, 600)}>Forecasts held</span>
                <span style={val(18)}>{cov.players_with_forecast} of {cov.players_total}</span>
              </span>
            </>
          )}
        </div>
        {gate && gate.note && <p style={{ ...lang(14), lineHeight: 1.55, margin: 0 }}>{gate.note}</p>}
        {!gate && (
          <p style={{ ...lang(14), lineHeight: 1.55, margin: 0 }}>
            No gate row exists. The app falls back to hiding real projections, which is the safe
            direction, but the gate should be an explicit record rather than an absence. Run migration 017.
          </p>
        )}
      </Section>

      <ModelEvidence />
    </div>
  );
}
