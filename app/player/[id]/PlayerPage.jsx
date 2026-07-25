"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, GitCompareArrows, Flag } from "lucide-react";
import {
  T, S, Kit, Face, Label, Plate, Value, NameNumber, POS_LABEL, riskInfo, Status,
  Skeleton, SkeletonRows, ErrorCard, lang, val, code,
} from "../../../lib/ui";
import { sb, loadCore, nextFixtures } from "../../../lib/data";
import { loadModel, provenanceLine } from "../../../lib/projections";
import { metricLabel } from "../../../lib/solver/score.mjs";
import { buildOpponentScale } from "../../../lib/opponent";
import Opp from "../../../components/Opp";

/* A section only renders when it has real data. Nothing on this page shows a zero or a dash
   standing in for a number we do not have; instead the section states where the data comes from. */
function Section({ eyebrow, title, accent = T.green, note, children, empty }) {
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

const Stat = ({ label, value, color = "#FFFFFF" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
    <span style={lang(13.5, 600)}>{label}</span>
    <span style={val(20, color)}>{value}</span>
  </div>
);

export default function PlayerPage({ id }) {
  const router = useRouter();
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [career, setCareer] = React.useState(null);
  const [prices, setPrices] = React.useState(null);
  const [understat, setUnderstat] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then(async (c) => {
        setCore(c);
        setModel(await loadModel(c));
        const p = c.players.find((x) => String(x.fpl_id) === String(id));
        if (!p) { setCareer([]); setPrices([]); setUnderstat([]); return; }

        const [hist, price, us] = await Promise.all([
          sb().from("history_player_gw")
            .select("season, competition, minutes, started, total_points, goals, assists, xg, xa")
            .eq("player_name", p.name).limit(1000),
          sb().from("player_price_history").select("date, old_price, new_price")
            .eq("player_id", p.id).order("date"),
          sb().from("understat_player_season").select("season, competition, games, minutes, xg, xa, npxg, shots, key_passes")
            .eq("player_id", p.id),
        ]);

        // aggregate raw gameweeks into one row per season per competition
        const agg = new Map();
        for (const r of hist.data || []) {
          const k = `${r.season}|${r.competition || "PL"}`;
          const a = agg.get(k) || { season: r.season, competition: r.competition || "PL", apps: 0, starts: 0, minutes: 0, points: 0, goals: 0, assists: 0, xg: 0, xa: 0, hasXg: false };
          if (r.minutes > 0) a.apps++;
          if (r.started) a.starts++;
          a.minutes += r.minutes || 0;
          a.points += r.total_points || 0;
          a.goals += r.goals || 0;
          a.assists += r.assists || 0;
          if (r.xg !== null && r.xg !== undefined) { a.xg += Number(r.xg); a.hasXg = true; }
          if (r.xa !== null && r.xa !== undefined) a.xa += Number(r.xa);
          agg.set(k, a);
        }
        setCareer([...agg.values()].sort((a, b) => b.season.localeCompare(a.season)));
        setPrices(price.data || []);
        setUnderstat(us.data || []);
      })
      .catch(() => setErr(true));
  }, [id]);
  React.useEffect(load, [load]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core) return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <Skeleton h={150} /><SkeletonRows n={4} h={90} />
    </div>
  );

  const p = core.players.find((x) => String(x.fpl_id) === String(id));
  if (!p) return (
    <Section eyebrow="Not found" title="No such player" accent={T.pink}
      empty="That player is not in the current Premier League database. He may have moved on, or the link is out of date." />
  );

  const scale = buildOpponentScale(core.teamById);
  const fx = nextFixtures(core.fixtures, core.teamById, p.team_id, 6);
  const run = scale.runDifficulty(fx);
  const risk = riskInfo(p);

  // Only show a figure when the underlying value genuinely exists.
  const has = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));
  const seasonStats = [
    ["Minutes", has(p.minutes) && p.minutes > 0 ? p.minutes : null],
    ["Points", has(p.total_points) && p.total_points > 0 ? p.total_points : null],
    ["Points per game", has(p.ppg) && Number(p.ppg) > 0 ? Number(p.ppg).toFixed(1) : null],
    ["Form", has(p.form) && Number(p.form) > 0 ? Number(p.form).toFixed(1) : null],
    ["Expected goals", has(p.xg_fpl) && Number(p.xg_fpl) > 0 ? Number(p.xg_fpl).toFixed(2) : null],
    ["Expected assists", has(p.xa_fpl) && Number(p.xa_fpl) > 0 ? Number(p.xa_fpl).toFixed(2) : null],
  ].filter(([, v]) => v !== null);

  const careerRows = career || [];
  const priceRows = prices || [];
  const usRows = understat || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <button onClick={() => router.back()} className="fb-hover"
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, height: S.btnSm, padding: "0 16px",
          borderRadius: 999, background: T.row, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
        <ArrowLeft size={15} /> Back
      </button>

      {/* header */}
      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
        display: "flex", gap: 26, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Face code={p.code} team={p.team} size={92} />
        <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, ...lang(34, 700), lineHeight: 1.05 }}>{p.web_name}</h1>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Kit team={p.team} size={22} />
              <span style={code(14)}>{p.team} · {POS_LABEL[p.position]}</span>
              <Status p={p} />
            </div>
            <div style={{ marginTop: 6, ...lang(15, 600) }}>{p.name}</div>
          </div>
          {risk && (
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Flag size={14} color={T.pink} /><span style={lang(14, 600, T.pink)}>{risk}</span>
            </div>
          )}
          {p.news && <p style={{ ...lang(14.5), lineHeight: 1.55, margin: 0 }}>{p.news}</p>}
        </div>
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
          <Stat label="Price" value={p.price.toFixed(1)} />
          <Stat label="Owned" value={`${p.own.toFixed(1)}%`} color={p.own >= 40 ? T.cyan : "#FFFFFF"} />
          {p.chance_of_playing !== null && (
            <Stat label="Chance next" value={`${p.chance_of_playing}%`} color={p.chance_of_playing < 70 ? T.pink : "#FFFFFF"} />
          )}
        </div>
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Label color={T.green}>Next six</Label>
          {fx.length === 0
            ? <span style={lang(14, 600)}>Fixtures are not published yet.</span>
            : fx.map((f, i) => (
                <span key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Opp fx={f} scale={scale} size="sm" />
                  <span style={val(12, "#FFFFFF", 500)}>GW{f.gw}</span>
                </span>
              ))}
          {run && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 6 }}>
              <span style={lang(13, 700)}>RUN</span>
              <Plate w={54} color={run.tone}>{run.difficulty}</Plate>
            </span>
          )}
          <Link href="/players?compare=1" style={{ textDecoration: "none", marginLeft: "auto" }}>
            <span className="fb-press" style={{ display: "flex", alignItems: "center", gap: 8, height: S.btnSm, padding: "0 18px",
              borderRadius: 999, background: T.green, ...lang(14, 700, "#04130A") }}>
              <GitCompareArrows size={15} /> Compare
            </span>
          </Link>
        </div>
      </section>

      {/* this season */}
      <Section eyebrow="This season" title="2026/27 Premier League"
        empty={seasonStats.length === 0
          ? "No 2026/27 numbers yet. Minutes, points and expected goals appear here once the season starts and the pull runs."
          : null}>
        <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
          {seasonStats.map(([l, v]) => <Stat key={l} label={l} value={v} />)}
        </div>
      </Section>

      {/* career, per season and per competition */}
      <Section eyebrow="Career" title="Season by season, per competition"
        note="Each competition is its own row. A Championship or foreign-league season is never merged into a Premier League record."
        empty={careerRows.length === 0
          ? "No history loaded for this player yet. This fills from the multi-season dataset once the history load has run."
          : null}>
        {careerRows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "92px 74px 1fr 1fr 1fr 1fr 1fr 1fr", gap: 8, alignItems: "center", padding: "0 10px", height: 26 }}>
              {["Season", "Comp", "Apps", "Starts", "Minutes", "Goals", "Assists", "Points"].map((h, i) => (
                <span key={h} style={{ ...lang(13, 600), textAlign: i < 2 ? "left" : "center" }}>{h}</span>
              ))}
            </div>
            {careerRows.map((r) => (
              <div key={`${r.season}|${r.competition}`}
                style={{ display: "grid", gridTemplateColumns: "92px 74px 1fr 1fr 1fr 1fr 1fr 1fr", gap: 8, alignItems: "center",
                  padding: "0 10px", height: 46, borderRadius: S.radiusSm, background: T.row }}>
                <span style={val(13.5)}>{r.season}</span>
                <span style={code(13)}>{r.competition}</span>
                <Value>{r.apps}</Value>
                <Value>{r.starts}</Value>
                <Value>{r.minutes}</Value>
                <Value>{r.goals}</Value>
                <Value>{r.assists}</Value>
                <Value color={T.green}>{r.points}</Value>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* expected versus actual, only where the source has it */}
      <Section eyebrow="Finishing" title="Expected against actual" accent={T.cyan}
        note="Expected goals exist in the dataset from 2022/23 onward. Earlier seasons have none."
        empty={careerRows.filter((r) => r.hasXg).length === 0
          ? "No expected-goals data for this player yet. It arrives with the history load for seasons from 2022/23 onward."
          : null}>
        {careerRows.filter((r) => r.hasXg).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {careerRows.filter((r) => r.hasXg).map((r) => {
              const diff = r.goals - r.xg;
              return (
                <div key={r.season} style={{ display: "grid", gridTemplateColumns: "92px 1fr 1fr 1fr 1fr", gap: 8, alignItems: "center",
                  padding: "0 10px", height: 46, borderRadius: S.radiusSm, background: T.row }}>
                  <span style={val(13.5)}>{r.season}</span>
                  <NameNumber name="Goals" number={r.goals} align="center" nameSize={13.5} />
                  <NameNumber name="Expected" number={r.xg.toFixed(2)} align="center" nameSize={13.5} />
                  <NameNumber name="Assists" number={r.assists} align="center" nameSize={13.5} />
                  <NameNumber name="Over or under" number={`${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`} align="center" nameSize={13.5}
                    color={diff >= 0 ? T.green : T.pink} />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* understat detail where present */}
      {usRows.length > 0 && (
        <Section eyebrow="Shot data" title="Understat, per season" accent={T.cyan}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {usRows.map((r) => (
              <div key={`${r.season}-${r.competition}`} style={{ display: "grid", gridTemplateColumns: "92px 74px 1fr 1fr 1fr 1fr", gap: 8, alignItems: "center",
                padding: "0 10px", height: 46, borderRadius: S.radiusSm, background: T.row }}>
                <span style={val(13.5)}>{r.season}</span>
                <span style={code(13)}>{r.competition || "PL"}</span>
                <NameNumber name="Shots" number={r.shots} align="center" nameSize={13.5} />
                <NameNumber name="Key passes" number={r.key_passes} align="center" nameSize={13.5} />
                <NameNumber name="Expected goals" number={Number(r.xg).toFixed(2)} align="center" nameSize={13.5} />
                <NameNumber name="Non-penalty" number={Number(r.npxg).toFixed(2)} align="center" nameSize={13.5} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* price trajectory */}
      <Section eyebrow="Price" title="Every recorded change"
        empty={priceRows.length === 0
          ? `No price changes recorded yet. The pull logs them from the moment it first sees a different price, so this stays empty until one happens.`
          : null}>
        {priceRows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {priceRows.slice().reverse().map((r, i) => {
              const up = Number(r.new_price) > Number(r.old_price);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, alignItems: "center",
                  padding: "0 10px", height: 44, borderRadius: S.radiusSm, background: T.row }}>
                  <span style={val(13.5)}>{r.date}</span>
                  <Value>{Number(r.old_price).toFixed(1)}</Value>
                  <Value color={up ? T.green : T.pink}>{Number(r.new_price).toFixed(1)}</Value>
                  <span style={{ ...lang(13.5, 700, up ? T.green : T.pink), textAlign: "center" }}>{up ? "Rise" : "Fall"}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* projection, only once the gate opens */}
      <Section eyebrow="Projection" title={model ? metricLabel(model.gateOpen) : "Projection"} accent={T.tag}
        empty={!model || !model.gateOpen
          ? "The projection distribution appears here once walk-forward calibration passes. Until then nothing is shown rather than a number that has not earned the name."
          : null}>
        {model && model.gateOpen && (
          <p style={{ ...lang(15), lineHeight: 1.6, margin: 0 }}>{provenanceLine(model)}</p>
        )}
      </Section>
    </div>
  );
}
