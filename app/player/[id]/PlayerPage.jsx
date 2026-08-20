"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DEFCON from "../../../config/defcon-2026-27.mjs";
import {
  T, S, Kit, Face, Label, Plate, Value, NameNumber, POS_LABEL, riskInfo, WarnFlag,
  Skeleton, SkeletonRows, ErrorCard, lang, val, code,
} from "../../../lib/ui";
import { sb, loadCore, nextFixtures } from "../../../lib/data";
import { loadModel } from "../../../lib/projections";
import { buildOpponentScale } from "../../../lib/opponent";
import { buildXPrice } from "../../../lib/xprice.mjs";
import Opp from "../../../components/Opp";
import { FixtureRun } from "../../../components/FixtureXP";

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
  /* Before a ball is kicked, the live players table still carries LAST season's totals: the API has
     not reset them yet. Rendering 2609 minutes under a 2026/27 heading is simply a lie, so the
     heading follows the data. */
  const seasonStarted = (core.fixtures || []).some((f) => f.kickoff_utc && new Date(f.kickoff_utc) < new Date());
  const seasonStats = [
    ["Minutes", has(p.minutes) && p.minutes > 0 ? p.minutes : null],
    ["Points", has(p.total_points) && p.total_points > 0 ? p.total_points : null],
    ["Points per game", has(p.ppg) && Number(p.ppg) > 0 ? Number(p.ppg).toFixed(1) : null],
    ["Form", has(p.form) && Number(p.form) > 0 ? Number(p.form).toFixed(1) : null],
    ["Expected goals", has(p.xg_fpl) && Number(p.xg_fpl) > 0 ? Number(p.xg_fpl).toFixed(2) : null],
    ["Expected assists", has(p.xa_fpl) && Number(p.xa_fpl) > 0 ? Number(p.xa_fpl).toFixed(2) : null],
  ].filter(([, v]) => v !== null);

  /* DEFCON. Two points in a match for crossing a defensive-action threshold: ten for a defender, twelve
     for a midfielder or forward, and goalkeepers cannot earn it at all. The table can only carry a rate
     and a margin, so the breakdown lives here: which actions he actually makes, over how many minutes,
     and how far clear of his own line that leaves him. */
  const defcon = DEFCON.rows.find((r) => r.fpl_id === Number(p?.fpl_id)) || null;
  const defconEligible = defcon && defcon.position !== "GKP";
  const defconStats = defconEligible ? [
    ["Actions per 90", defcon.per90 === null ? null : defcon.per90.toFixed(1)],
    ["Threshold", String(defcon.threshold)],
    ["Clear by", defcon.headroom === null ? null
      : `${defcon.headroom > 0 ? "+" : ""}${defcon.headroom.toFixed(1)}`],
    ["Clearances, blocks, interceptions", defcon.cbi > 0 ? String(defcon.cbi) : null],
    ["Tackles", defcon.tackles > 0 ? String(defcon.tackles) : null],
    ...(defcon.position === "DEF" ? [] : [["Recoveries", defcon.recoveries > 0 ? String(defcon.recoveries) : null]]),
    ["Total actions", defcon.actions > 0 ? String(defcon.actions) : null],
    ["Ninety-minute periods", defcon.nineties >= 1 ? defcon.nineties.toFixed(1) : null],
    ["Starts", defcon.starts > 0 ? String(defcon.starts) : null],
  ].filter(([, v]) => v !== null) : [];

  const careerRows = career || [];
  const priceRows = prices || [];
  const usRows = understat || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <button onClick={() => router.back()} className="fb-hover"
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, height: S.btnSm, padding: "0 16px",
          borderRadius: S.radiusSm, background: T.row, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
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
            </div>
            <div style={{ marginTop: 6, ...lang(15, 600) }}>{p.name}</div>
          </div>
          {risk && (
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <WarnFlag size={15} /><span style={lang(14, 600, T.pink)}>{risk}</span>
            </div>
          )}
          {p.news && <p style={{ ...lang(14.5), lineHeight: 1.55, margin: 0 }}>{p.news}</p>}
        </div>
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
          <Stat label="Price" value={p.price.toFixed(1)} />
          {(() => {
            const x = model ? buildXPrice(core.players, (pl) => model.lastSeasonPoints(pl) ?? 0, (pl) => (model.lastSeasonPoints(pl) === null ? "none" : "archive")) : null;
            const r = x ? x.of(p) : null;
            if (!r) return null;
            return <Stat label="x£" value={r.xprice.toFixed(1)}
              color={r.verdict === "under" ? T.green : r.verdict === "over" ? T.pink : "#FFFFFF"} />;
          })()}
          <Stat label="OWNERSHIP %" value={`${p.own.toFixed(1)}%`} color={p.own >= 40 ? T.cyan : "#FFFFFF"} />
          {p.chance_of_playing !== null && (
            <Stat label="Chance next" value={`${p.chance_of_playing}%`} color={p.chance_of_playing < 70 ? T.pink : "#FFFFFF"} />
          )}
        </div>
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Label color={T.green}>Next six</Label>
          <FixtureRun fixtures={fx} scale={scale} n={6}
            xpOf={(gw) => (model ? model.scoreForGw(p, gw) : null)} />
          {run && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 6 }}>
              <span style={lang(13, 700)}>DIFFICULTY</span>
              <Plate w={54} color={run.tone}>{run.difficulty}</Plate>
            </span>
          )}
        </div>
      </section>

      {/* this season */}
      <Section eyebrow={seasonStarted ? "This season" : "Last season"}
        title={seasonStarted ? "2026/27 Premier League" : "2025/26 Premier League"}
        empty={seasonStats.length === 0 ? "No figures recorded." : null}>
        <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
          {seasonStats.map(([l, v]) => <Stat key={l} label={l} value={v} />)}
        </div>
      </Section>

      {/* defensive contribution */}
      {defconEligible ? (
        <Section
          eyebrow="Defensive contribution"
          title={defcon.per90 === null
            ? "Not enough minutes to read a rate"
            : `${defcon.per90.toFixed(1)} actions per 90 against a threshold of ${defcon.threshold}`}
          accent={defcon.headroom !== null && defcon.headroom > 0 ? T.green : T.cyan}
          note={defcon.per90 === null
            ? `A rate needs at least ${DEFCON.minimum_minutes} minutes and ${DEFCON.minimum_starts} starts behind it. He has ${defcon.minutes} minutes and ${defcon.starts} starts, which is too thin to report: a busy cameo off the bench produces a figure that would rank him above every defensive midfielder in the league.`
            : defcon.headroom > 0
              ? "He clears his own line on this rate, so the two points are the expectation rather than the exception."
              : "He falls short of his line on this rate, so the two points would be the exception."}
          empty={defconStats.length === 0 ? "No defensive actions recorded." : null}>
          <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
            {defconStats.map(([l, v]) => (
              <Stat key={l} label={l} value={v}
                color={l === "Clear by" && defcon.headroom > 0 ? T.green : "#FFFFFF"} />
            ))}
          </div>
          {defcon.position_changed ? (
            <div style={{ marginTop: 12, ...lang(13, 500, T.pink) }}>
              He has been reclassified since these actions were recorded. FPL counted {defcon.actions_recorded} of
              them under his old position; {defcon.actions} of them count under the position he holds now, and the
              threshold he must beat has changed with it.
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* career, per season and per competition */}
      <Section eyebrow="Career" title="Season by season, per competition"
        empty={careerRows.length === 0
          ? "No history for this player."
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
        empty={careerRows.filter((r) => r.hasXg).length === 0
          ? "No expected-goals data for this player."
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
          ? `No price changes yet.`
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
    </div>
  );
}
