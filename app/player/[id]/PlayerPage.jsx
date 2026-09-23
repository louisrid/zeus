"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DEFCON from "../../../config/defcon-2026-27.mjs";
import DEFCON_LIVE from "../../../config/defcon-live-2026-27.mjs";
import SEASON_ACTUALS from "../../../config/season-actuals-2026-27.mjs";
import Collapsible from "../../../components/Collapsible";
import DataTable from "../../../components/DataTable";
import { xrOf, XR_ENABLED } from "../../../lib/xr.mjs";
import {
  T, S, Kit, Face, Label, Plate, POS_LABEL, riskInfo, WarnFlag,
  Skeleton, SkeletonRows, ErrorCard, lang, val, code,
} from "../../../lib/ui";
import { sb, loadCore, nextFixtures } from "../../../lib/data";
import { loadModel } from "../../../lib/projections";
import { buildOpponentScale } from "../../../lib/opponent";
import { buildXPrice } from "../../../lib/xprice.mjs";
import Opp from "../../../components/Opp";
import { FixtureRun } from "../../../components/FixtureXP";
import { fmtPts } from "../../../lib/format.mjs";

/* A section only renders when it has real data. Nothing on this page shows a zero or a dash
   standing in for a number we do not have; instead the section states where the data comes from. */
/* `fold`, when given, makes the section's body a shared Collapsible under the heading, closed by default
   and remembered per section. The per-gameweek, career, finishing and price tables are reference you open
   when you want them, not things to scroll past on every visit. */
function Section({ eyebrow, title, accent = T.green, note, children, empty, fold = null, count = null }) {
  const body = empty ? <p style={{ ...lang(15), lineHeight: 1.6, margin: 0 }}>{empty}</p> : children;
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label color={accent}>{eyebrow}</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>{title}</h2>
      </div>
      {fold && !empty
        ? <Collapsible id={`player.${fold}`} title={count || "Full table"} accent={accent}>{children}</Collapsible>
        : body}
      {!empty && note && <p style={{ ...lang(13.5, 600), lineHeight: 1.5, margin: 0 }}>{note}</p>}
    </section>
  );
}

/* EVERY FIGURE ON A DARK PLATE.
 *
 * The fixture chips along the top sit on their own dark plates and the statistics below them did not,
 * so one card held two visual languages: figures in boxes and figures floating. Putting every stat on
 * the same plate the fixtures use makes the page one thing rather than two, and gives each number an
 * edge to scan to instead of hanging in space. */
const Stat = ({ label, value, color = "#FFFFFF" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, padding: "9px 12px",
    borderRadius: S.radiusSm, background: T.plate, border: `1px solid ${T.line}` }}>
    <span style={lang(13, 600)}>{label}</span>
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
  /* This asked whether any loaded fixture had already kicked off. The loaded fixtures start at the
     CURRENT gameweek, so every one of them is in the future and the answer was permanently no: from
     GW2 onwards every player page headed this season's numbers "2025/26 Premier League". The
     gameweek itself is the honest test, because gameweek two existing means gameweek one was played. */
  const seasonStarted = Number(core.currentGw) > 1;
  /* The zero guards below were a pre-season device. Before a ball was kicked the live table still
     carried last season's totals, so anything at zero was genuinely unknown and hiding it was right.
     Once the season is running a zero is a fact: he has played no minutes, or scored no points. Hiding
     it then shows a dash, which reads as missing data rather than as a player who has done nothing. */
  const real = (value, format) => {
    if (!has(value)) return null;
    if (!seasonStarted && Number(value) <= 0) return null;
    return format ? format(Number(value)) : value;
  };
  /* WHAT HE HAS ACTUALLY DONE, BESIDE WHAT HE WAS EXPECTED TO.
     Goals and assists this season were only in the per-gameweek table lower down, while the expected
     versions had a readable plate here. The real ones now sit in the same row, each next to its
     expectation, so goals against xG reads in one glance. Clean sheets and defensive contributions
     follow for the players they matter to. */
  const actuals = (SEASON_ACTUALS.rows || []).find((row) => row.fpl_id === Number(p.fpl_id)) || null;
  const weeks = actuals ? Object.values(actuals.weeks || {}) : [];
  const cleanSheets = weeks.filter((week) => week.clean_sheet).length;
  const defensiveContributions = weeks.reduce((sum, week) => sum + (Number(week.defensive_contribution) || 0), 0);
  const seasonStats = [
    ["Minutes", real(p.minutes)],
    ["Points", real(p.total_points)],
    ["Points per game", real(p.ppg, (n) => n.toFixed(1))],
    ["Form", real(p.form, (n) => n.toFixed(1))],
    ["Goals", actuals && seasonStarted ? String(actuals.goals ?? 0) : null],
    ["Expected goals", has(p.xg_fpl) && Number(p.xg_fpl) > 0 ? Number(p.xg_fpl).toFixed(2) : null],
    ["Assists", actuals && seasonStarted ? String(actuals.assists ?? 0) : null],
    ["Expected assists", has(p.xa_fpl) && Number(p.xa_fpl) > 0 ? Number(p.xa_fpl).toFixed(2) : null],
    ["Clean sheets", actuals && seasonStarted && p.position !== "FWD" ? String(cleanSheets) : null],
    ["Def. contributions", actuals && seasonStarted && p.position !== "GKP" ? String(defensiveContributions) : null],
  ].filter(([, v]) => v !== null);

  /* DEFCON. Two points in a match for crossing a defensive-action threshold: ten for a defender, twelve
     for a midfielder or forward, and goalkeepers cannot earn it at all. The table can only carry a rate
     and a margin, so the breakdown lives here: which actions he actually makes, over how many minutes,
     and how far clear of his own line that leaves him. */
  const defcon = DEFCON.rows.find((r) => r.fpl_id === Number(p?.fpl_id)) || null;
  /* THIS SEASON'S RATE, SHOWN AS A RATE.
   *
   * The card refused to print a number unless a player had six hundred minutes and five starts behind it,
   * on the reasoning that a busy cameo flatters a per-90. That reasoning is sound and the remedy was
   * wrong: it replaced the figure with a paragraph explaining why there was no figure, which is the one
   * thing a reader cannot use. The average is the average. It is shown with the minutes it came from, so
   * a rate off ninety minutes is visibly a rate off ninety minutes and can be judged rather than hidden. */
  const defconThisSeason = (DEFCON_LIVE.rows || []).find((r) => r.fpl_id === Number(p?.fpl_id)) || null;
  const defconEligible = defcon && defcon.position !== "GKP";
  const defconStats = defconEligible ? [
    /* The minutes belong in the label, not the figure: a value of "6.0 (347 mins)" wrapped onto two
       lines inside a phone-width plate, while every other plate held one number. */
    [defconThisSeason && defconThisSeason.per90 !== null
      ? `Per 90 this season, ${defconThisSeason.minutes} mins` : "Actions per 90, this season",
    defconThisSeason && defconThisSeason.per90 !== null ? defconThisSeason.per90.toFixed(1) : null],
    ["Per 90 last season", defcon.per90 === null ? null : defcon.per90.toFixed(1)],
    ["Threshold", String(defcon.threshold)],
    ["Clear by", defcon.headroom === null ? null
      : `${defcon.headroom > 0 ? "+" : ""}${defcon.headroom.toFixed(1)}`],
    ["Clearances, blocks, interceptions", defcon.cbi > 0 ? String(defcon.cbi) : null],
    ["Tackles", defcon.tackles > 0 ? String(defcon.tackles) : null],
    ...(defcon.position === "DEF" ? [] : [["Recoveries", defcon.recoveries > 0 ? String(defcon.recoveries) : null]]),
    ["Total actions", defcon.actions > 0 ? String(defcon.actions) : null],
    ["Ninety-minute periods", defcon.nineties >= 1 ? fmtPts(defcon.nineties) : null],
    ["Starts", defcon.starts > 0 ? String(defcon.starts) : null],
  ].filter(([, v]) => v !== null) : [];

  /* THE CURRENT SEASON IS NOT A CAREER ROW.
   *
   * The career table listed this season from a database copy that updates on its own schedule, so it
   * read 1 appearance and 35 minutes directly beneath the week-by-week table showing 4 and 289. Two
   * answers to one question, on one screen. The live table above is the truth for this season; the
   * career table is for the seasons that are finished. */
  const careerRows = (career || []).filter((row) => String(row.season) !== "2026-27");
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
        display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Face code={p.code} team={p.team} size={92} />
        <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, ...lang(34, 700), lineHeight: 1.05 }}>{p.web_name}</h1>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Kit team={p.team} size={22} />
              <span style={code(14)}>{p.team} · {POS_LABEL[p.position]}</span>
            </div>
            <div style={{ marginTop: 6, ...lang(15, 600) }}>{p.name}</div>
          </div>
          {risk && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <WarnFlag size={15} /><span style={lang(14, 600, T.pink)}>{risk}</span>
            </div>
          )}
          {p.news && <p style={{ ...lang(14.5), lineHeight: 1.55, margin: 0 }}>{p.news}</p>}
        </div>
        <div className="zeus-stat-grid">
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
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Label color={T.green}>Next six</Label>
          <FixtureRun fixtures={fx} scale={scale} n={6}
            xpOf={(gw) => (model ? model.scoreForGw(p, gw) : null)}
            /* xR beside xPTS for each week: the projection weighted by the share of the field that does
               not own him. Ownership is the figure at the top of this page, so the two agree by
               construction. */
            xrOf={!XR_ENABLED ? null : (gw) => {
              if (!model) return null;
              const score = model.scoreForGw(p, gw);
              if (score === null || score === undefined) return null;
              if (!Number.isFinite(Number(p.own)) || p.own === null || p.own === undefined) return null;
              return xrOf(score, p.own);
            }} />
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
        {/* An equal-width grid rather than a wrapping row. Plates sized to their own label wrapped into
            ragged lines of two, three and one; on a grid every plate is the same width and the rows line
            up, at any screen width. */}
        <div className="zeus-stat-grid">
          {seasonStats.map(([l, v]) => <Stat key={l} label={l} value={v} />)}
        </div>
      </Section>

      {/* defensive contribution */}
      {defconEligible ? (
        <Section
          eyebrow="Defensive contribution"
          title={defconThisSeason && defconThisSeason.per90 !== null && defconThisSeason.minutes > 0
            ? `${defconThisSeason.per90.toFixed(1)} actions per 90 this season, from ${defconThisSeason.minutes} minutes`
            : defcon.per90 !== null
              ? `${defcon.per90.toFixed(1)} actions per 90 last season against a threshold of ${defcon.threshold}`
              : "No defensive actions recorded yet"}
          accent={defcon.headroom !== null && defcon.headroom > 0 ? T.green : T.cyan}
          note={defconThisSeason && defconThisSeason.minutes > 0 && defconThisSeason.minutes < DEFCON.minimum_minutes
            ? `That rate comes from ${defconThisSeason.minutes} minutes across ${defconThisSeason.starts} start${defconThisSeason.starts === 1 ? "" : "s"}. A short sample moves a lot: last season's figure, built on a full year, is the steadier read.`
            : defcon.per90 === null
              ? "No minutes recorded yet, so there is nothing to average."
              : defcon.headroom > 0
              ? "He clears his own line on this rate, so the two points are the expectation rather than the exception."
              : "He falls short of his line on this rate, so the two points would be the exception."}
          empty={defconStats.length === 0 ? "No defensive actions recorded." : null}>
          {/* The four figures that answer the question stay in view: rate this season, rate last season,
              the threshold, and the margin. The action-by-action breakdown, six more plates, folds
              beneath them; it ran a full screen on a phone before anything else could be reached. */}
          <div className="zeus-stat-grid">
            {defconStats.slice(0, 4).map(([l, v]) => (
              <Stat key={l} label={l} value={v}
                color={l === "Clear by" && defcon.headroom > 0 ? T.green : "#FFFFFF"} />
            ))}
          </div>
          {defconStats.length > 4 && (
            <Collapsible id="player.defcon-breakdown" title="Action by action" accent={T.cyan}>
              <div className="zeus-stat-grid">
                {defconStats.slice(4).map(([l, v]) => <Stat key={l} label={l} value={v} />)}
              </div>
            </Collapsible>
          )}
          {defcon.position_changed ? (
            <div style={{ marginTop: 12, ...lang(13, 500, T.pink) }}>
              He has been reclassified since these actions were recorded. FPL counted {defcon.actions_recorded} of
              them under his old position; {defcon.actions} of them count under the position he holds now, and the
              threshold he must beat has changed with it.
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* THIS SEASON, WEEK BY WEEK.
          The page showed a career table and a projection and nothing in between, so the one thing a
          reader is usually checking, what this player has actually done so far, was the gap. Minutes
          alongside points, because four points off ten minutes and four off ninety are different facts. */}
      {(() => {
        const record = (SEASON_ACTUALS.rows || []).find((row) => row.fpl_id === Number(p?.fpl_id));
        const weeks = SEASON_ACTUALS.gameweeks_played || [];
        if (!record || !weeks.length) return null;
        return (
          <Section eyebrow="This season" accent={T.cyan} fold="gameweeks" count={`${Object.keys(record.weeks || {}).length} gameweeks`}
            title={`${record.total_points} points from ${record.appearances} appearance${record.appearances === 1 ? "" : "s"}`}
            note={record.points_per_90 === null
              ? "No minutes played yet."
              : `${record.points_per_90} points per 90 · ${record.minutes} minutes · ${record.goals} goals · ${record.assists} assists · ${Object.values(record.weeks || {}).filter((week) => week.clean_sheet).length} clean sheets · ${Object.values(record.weeks || {}).reduce((sum, week) => sum + (Number(week.defensive_contribution) || 0), 0)} def. contributions · ${record.bonus} bonus`}>
            {/* The one shared table, with a row per gameweek. A gameweek he was not involved in reads as a
                dash rather than a zero, because not selected and selected but blank are different
                things. Clean sheet reads Yes rather than 1, since a column of ones looks like a count. */}
            {(() => {
              const rows = weeks.map((gw) => {
                const week = record.weeks[gw] || record.weeks[String(gw)] || null;
                const played = Boolean(week && week.minutes > 0);
                return { gw, week, played };
              });
              const cell = (pick) => (r) => (r.played && r.week && pick(r.week) ? pick(r.week) : null);
              return (
                <DataTable rowKey={(r) => r.gw} minWidth={560}
                  columns={[
                    { key: "gw", heading: "Gameweek", width: "72px", render: (r) => `GW${r.gw}` },
                    { key: "minutes", heading: "Minutes", render: (r) => (r.week ? r.week.minutes : null) },
                    { key: "points", heading: "Points", render: (r) => (r.week ? r.week.points : null), color: () => T.xp },
                    { key: "goals", heading: "Goals", render: cell((w) => w.goals) },
                    { key: "assists", heading: "Assists", render: cell((w) => w.assists) },
                    { key: "cs", heading: "Clean sheet", short: "CS", render: (r) => (r.played && r.week.clean_sheet ? "Yes" : null),
                      color: () => T.green },
                    { key: "dc", heading: "Defensive contributions", short: "DC", render: cell((w) => w.defensive_contribution) },
                    { key: "bonus", heading: "Bonus", render: cell((w) => w.bonus), color: () => T.green },
                  ]}
                  rows={rows} />
              );
            })()}
          </Section>
        );
      })()}

      {/* career, per season and per competition */}
      <Section eyebrow="Career" title="Season by season, per competition" fold="career" count={careerRows.length ? `${careerRows.length} seasons` : null}
        empty={careerRows.length === 0
          ? "No history for this player."
          : null}>
        {careerRows.length > 0 && (
          <DataTable rowKey={(r) => `${r.season}|${r.competition}`} minWidth={640}
            columns={[
              { key: "season", heading: "Season", width: "92px" },
              { key: "competition", heading: "Comp", width: "74px", mono: true, align: "left" },
              { key: "apps", heading: "Apps" },
              { key: "starts", heading: "Starts" },
              { key: "minutes", heading: "Minutes" },
              { key: "goals", heading: "Goals" },
              { key: "assists", heading: "Assists" },
              { key: "points", heading: "Points", color: () => T.green },
            ]}
            rows={careerRows} />
        )}
      </Section>

      {/* expected versus actual, only where the source has it */}
      <Section eyebrow="Finishing" title="Expected against actual" accent={T.cyan} fold="finishing"
        empty={careerRows.filter((r) => r.hasXg).length === 0
          ? "No expected-goals data for this player."
          : null}>
        {careerRows.filter((r) => r.hasXg).length > 0 && (
          <DataTable rowKey={(r) => r.season} minWidth={480}
            columns={[
              { key: "season", heading: "Season", width: "92px" },
              { key: "goals", heading: "Goals" },
              { key: "xg", heading: "Expected goals", short: "xG", render: (r) => r.xg.toFixed(2) },
              { key: "assists", heading: "Assists" },
              { key: "diff", heading: "Over or under", short: "vs xG",
                render: (r) => { const d = r.goals - r.xg; return `${d >= 0 ? "+" : ""}${d.toFixed(2)}`; },
                color: (r) => (r.goals - r.xg >= 0 ? T.green : T.pink) },
            ]}
            rows={careerRows.filter((r) => r.hasXg)} />
        )}
      </Section>

      {/* understat detail where present */}
      {usRows.length > 0 && (
        <Section eyebrow="Shot data" title="Understat, per season" accent={T.cyan} fold="shots">
          <DataTable rowKey={(r) => `${r.season}-${r.competition}`} minWidth={560}
            columns={[
              { key: "season", heading: "Season", width: "92px" },
              { key: "competition", heading: "Comp", width: "74px", mono: true, align: "left", render: (r) => r.competition || "PL" },
              { key: "shots", heading: "Shots" },
              { key: "key_passes", heading: "Key passes" },
              { key: "xg", heading: "Expected goals", short: "xG", render: (r) => Number(r.xg).toFixed(2) },
              { key: "npxg", heading: "Non-penalty xG", short: "npxG", render: (r) => Number(r.npxg).toFixed(2) },
            ]}
            rows={usRows} />
        </Section>
      )}

      {/* price trajectory */}
      <Section eyebrow="Price" title="Every recorded change" fold="price"
        empty={priceRows.length === 0
          ? `No price changes yet.`
          : null}>
        {priceRows.length > 0 && (
          <DataTable rowKey={(r) => `${r.date}-${r.old_price}-${r.new_price}`} minWidth={400}
            columns={[
              { key: "date", heading: "Date", width: "1fr" },
              { key: "old_price", heading: "From", render: (r) => Number(r.old_price).toFixed(1) },
              { key: "new_price", heading: "To", render: (r) => Number(r.new_price).toFixed(1),
                color: (r) => (Number(r.new_price) > Number(r.old_price) ? T.green : T.pink) },
              { key: "move", heading: "Move", render: (r) => (Number(r.new_price) > Number(r.old_price) ? "Rise" : "Fall"),
                color: (r) => (Number(r.new_price) > Number(r.old_price) ? T.green : T.pink) },
            ]}
            rows={priceRows.slice().reverse()} />
        )}
      </Section>

      {/* projection, only once the gate opens */}
    </div>
  );
}
