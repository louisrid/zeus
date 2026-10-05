"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DEFCON from "../../../config/defcon-2026-27.mjs";
import DEFCON_LIVE from "../../../config/defcon-live-2026-27.mjs";
import SEASON_ACTUALS from "../../../config/season-actuals-2026-27.mjs";
import Collapsible from "../../../components/Collapsible";
import DataTable from "../../../components/DataTable";
import {
  T, S, Kit, Face, Label, POS_LABEL, riskInfo, WarnFlag,
  Skeleton, SkeletonRows, ErrorCard, lang, val, code,
} from "../../../lib/ui";
import { sb, loadCore, nextFixtures } from "../../../lib/data";
import { loadModel } from "../../../lib/projections";
import { buildOpponentScale } from "../../../lib/opponent";
import { FixtureRun } from "../../../components/FixtureXP";

/* THE PLAYER PAGE CARRIES WHAT A TRANSFER DECISION NEEDS AND NOTHING ELSE.
 *
 * It had grown to a header, three stat cards, a defensive breakdown with its own prose, a week-by-week
 * table, a career table, a finishing table, a shot-data table and a price table: eight sections, four
 * of them about seasons that have no bearing on who to buy this week. It now reads top to bottom as
 * the questions get asked: who is he and what does he face next; what has he done this season; what did
 * he do last season; does he earn the defensive points; and, folded until wanted, the week-by-week and
 * price records. Nothing older than last season, and no paragraphs explaining a number that is already
 * on the screen. */

const LAST_SEASON = "2025-26";
const LAST_SEASON_LABEL = "2025/26";
const THIS_SEASON_LABEL = "2026/27";

function Section({ eyebrow, title, accent = T.green, children, empty = null, fold = null, count = null }) {
  const body = empty ? <p style={{ ...lang(15), lineHeight: 1.6, margin: 0 }}>{empty}</p> : children;
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: S.gap }}>
      <div>
        <Label color={accent}>{eyebrow}</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>{title}</h2>
      </div>
      {fold && !empty
        ? <Collapsible id={`player.${fold}`} title={count || "Full table"} accent={accent}>{children}</Collapsible>
        : body}
    </section>
  );
}

/* Every figure on the same dark plate the fixtures use, so the page is one visual language. */
const Stat = ({ label, value, color = "#FFFFFF", bg = T.plate, big = false }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: S.gapXs, minWidth: 0, padding: big ? "14px 18px" : "9px 12px",
    borderRadius: S.radiusSm, background: bg, border: `1px solid ${T.line}` }}>
    <span style={lang(big ? 15 : 13, 700, color)}>{label}</span>
    <span style={val(big ? 30 : 20, color, 700)}>{value}</span>
  </div>
);

/* xG and xA get their own tints in the header, the one place on the site a figure sits on a pale fill:
   they are the two numbers a transfer is most often argued from, and they should be found in a glance. */
const XG_BG = "#B8FFD9"; const XG_INK = "#006B38";
const XA_BG = "#CDEBFF"; const XA_INK = "#005A9E";

const has = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));
const whole = (v) => (has(v) ? String(Math.round(Number(v))) : null);
const two = (v) => (has(v) ? Number(v).toFixed(2) : null);
const one = (v) => (has(v) ? Number(v).toFixed(1) : null);

/* The same eight figures for both seasons, in the same order, so the two cards read as a pair. A
   figure the source does not carry is left out rather than shown as a dash. */
/* Six figures a season, the ones a decision turns on. xG and xA on their own are in the header for this
   season; here they are one combined number. Defensive contributions live in the per-90 rate below. */
function seasonRows({ minutes, points, goals, assists, xg, xa, cleanSheets }, position) {
  return [
    ["Points", whole(points)],
    ["Minutes", whole(minutes)],
    ["Goals", whole(goals)],
    ["Assists", whole(assists)],
    ["xG + xA", has(xg) && has(xa) ? two(Number(xg) + Number(xa)) : null],
    ["Clean sheets", position === "FWD" ? null : whole(cleanSheets)],
  ].filter(([, v]) => v !== null);
}

export default function PlayerPage({ id }) {
  const router = useRouter();
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [lastSeason, setLastSeason] = React.useState(null);
  const [prices, setPrices] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then(async (c) => {
        setCore(c);
        setModel(await loadModel(c));
        const p = c.players.find((x) => String(x.fpl_id) === String(id));
        if (!p) { setLastSeason(null); setPrices([]); return; }

        /* Last season only. The career table used to pull every season this player ever had; one
           season of gameweeks is a few dozen rows and is all the page shows. */
        const [hist, price] = await Promise.all([
          sb().from("history_player_gw")
            .select("minutes, total_points, goals, assists, xg, xa, clean_sheets")
            .eq("player_name", p.name).eq("season", LAST_SEASON).eq("competition", "PL").limit(60),
          sb().from("player_price_history").select("date, old_price, new_price")
            .eq("player_id", p.id).order("date"),
        ]);

        const rows = hist.data || [];
        if (!rows.length) {
          setLastSeason(null);
        } else {
          const sum = (key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
          const hasXg = rows.some((row) => row.xg !== null && row.xg !== undefined);
          setLastSeason({
            minutes: sum("minutes"), points: sum("total_points"), goals: sum("goals"), assists: sum("assists"),
            xg: hasXg ? sum("xg") : null, xa: hasXg ? sum("xa") : null,
            cleanSheets: sum("clean_sheets"),
          });
        }
        setPrices(price.data || []);
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
  const risk = riskInfo(p);
  const seasonStarted = Number(core.currentGw) > 1;

  /* This season from the live scores file, which is the same source as the week-by-week table below, so
     the card and the table can never disagree. Expected goals and assists come from the live players
     table, which is where FPL publishes them. */
  const record = (SEASON_ACTUALS.rows || []).find((row) => row.fpl_id === Number(p.fpl_id)) || null;
  const weeks = record ? Object.values(record.weeks || {}) : [];
  const thisSeason = seasonStarted ? seasonRows({
    minutes: record ? record.minutes : p.minutes,
    points: record ? record.total_points : p.total_points,
    goals: record ? record.goals : null,
    assists: record ? record.assists : null,
    xg: has(p.xg_fpl) ? p.xg_fpl : null,
    xa: has(p.xa_fpl) ? p.xa_fpl : null,
    cleanSheets: record ? weeks.filter((week) => week.clean_sheet).length : null,
  }, p.position) : [];
  const lastSeasonStats = lastSeason ? seasonRows(lastSeason, p.position) : [];

  /* DEFCON, one number: his defensive-contribution rate per 90 this season. Keepers cannot earn it. */
  const defcon = DEFCON.rows.find((r) => r.fpl_id === Number(p.fpl_id)) || null;
  const defconThisSeason = (DEFCON_LIVE.rows || []).find((r) => r.fpl_id === Number(p.fpl_id)) || null;
  const defconRate = p.position !== "GKP" && defconThisSeason && defconThisSeason.per90 !== null && defconThisSeason.minutes > 0
    ? one(defconThisSeason.per90) : null;
  const defconClears = defcon && defconRate !== null && Number(defconRate) >= defcon.threshold;

  const priceRows = prices || [];
  const playedWeeks = SEASON_ACTUALS.gameweeks_played || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <button onClick={() => router.back()} className="fb-press zeus-toolbar-button"
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: S.gapSm, height: S.ctrl, padding: "0 14px",
          borderRadius: S.radiusXs, background: T.row, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
        <ArrowLeft size={15} /> Back
      </button>

      {/* Who he is and what he faces next. */}
      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
        display: "flex", flexDirection: "column", gap: S.gapMd }}>
        <div style={{ display: "flex", gap: S.gapMd, alignItems: "flex-start" }}>
          <Face code={p.code} team={p.team} size={72} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: S.gapSm }}>
            <h1 style={{ margin: 0, ...lang(30, 700), lineHeight: 1.05 }}>{p.web_name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: S.gapSm, flexWrap: "wrap" }}>
              <Kit team={p.team} size={22} />
              <span style={code(14)}>{p.team} · {POS_LABEL[p.position]}</span>
            </div>
            {risk && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <WarnFlag size={15} /><span style={lang(14, 600, T.pink)}>{risk}</span>
              </div>
            )}
          </div>
        </div>
        <div className="zeus-stat-grid">
          <Stat label="Price" value={Number(p.price).toFixed(1)} />
          <Stat label="Ownership" value={`${Number(p.own).toFixed(1)}%`} />
          {/* xG and xA this season, up in the header where the eye lands first, half again as large as the
              other figures and on their own tints: pale green for goals, pale blue for assists. The only
              two filled tints on the site, so they read as the two headline numbers. */}
          {has(p.xg_fpl) && (
            <div style={{ display: "flex", flexDirection: "column", gap: S.gapXs, minWidth: 0, padding: "12px 16px",
              borderRadius: S.radiusSm, background: "#CFFFE3" }}>
              <span style={lang(15, 700, "#0A6B3A")}>xG this season</span>
              <span style={val(30, "#0A6B3A", 700)}>{two(p.xg_fpl)}</span>
            </div>
          )}
          {has(p.xa_fpl) && (
            <div style={{ display: "flex", flexDirection: "column", gap: S.gapXs, minWidth: 0, padding: "12px 16px",
              borderRadius: S.radiusSm, background: "#CFF0FF" }}>
              <span style={lang(15, 700, "#0B5E8A")}>xA this season</span>
              <span style={val(30, "#0B5E8A", 700)}>{two(p.xa_fpl)}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: S.gapSm }}>
          <Label color={T.xp}>Next six, with xPTS</Label>
          <FixtureRun fixtures={fx} scale={scale} n={6} xpOf={(gw) => (model ? model.scoreForGw(p, gw) : null)} />
        </div>
      </section>

      {/* This season */}
      <Section eyebrow="This season" title={`${THIS_SEASON_LABEL} Premier League`}
        empty={thisSeason.length === 0 ? "No gameweeks played yet." : null}>
        <div className="zeus-stat-grid">
          {thisSeason.map(([l, v]) => <Stat key={l} label={l} value={v} />)}
          {defconRate !== null && <Stat label="DEFCON per 90" value={defconRate} color={defconClears ? T.green : "#FFFFFF"} />}
        </div>
      </Section>

      {/* Last season */}
      <Section eyebrow="Last season" title={`${LAST_SEASON_LABEL} Premier League`}
        empty={lastSeasonStats.length === 0 ? "No Premier League record for last season." : null}>
        <div className="zeus-stat-grid">
          {lastSeasonStats.map(([l, v]) => <Stat key={l} label={l} value={v} />)}
        </div>
      </Section>

      {/* This season, week by week. Folded: the card above carries the totals. */}
      {record && playedWeeks.length > 0 && (
        <Section eyebrow="Week by week" accent={T.xp} fold="gameweeks"
          count={`${Object.keys(record.weeks || {}).length} gameweeks`}
          title={`${record.total_points} points from ${record.appearances} appearance${record.appearances === 1 ? "" : "s"}`}>
          {(() => {
            const rows = playedWeeks.map((gw) => {
              const week = record.weeks[gw] || record.weeks[String(gw)] || null;
              return { gw, week, played: Boolean(week && week.minutes > 0) };
            });
            const cell = (pick) => (r) => (r.played && r.week && pick(r.week) ? pick(r.week) : null);
            return (
              <DataTable rowKey={(r) => r.gw} minWidth={560}
                columns={[
                  { key: "gw", heading: "Gameweek", width: "72px", render: (r) => `GW${r.gw}` },
                  { key: "minutes", heading: "Minutes", render: (r) => (r.week ? r.week.minutes : null) },
                  { key: "points", heading: "Points", render: (r) => (r.week ? r.week.points : null) },
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
      )}

      {/* Price changes. Folded: the current price is in the header. */}
      <Section eyebrow="Price changes" title={`${Number(p.price).toFixed(1)} now`} fold="price"
        count={priceRows.length ? `${priceRows.length} change${priceRows.length === 1 ? "" : "s"}` : null}
        empty={priceRows.length === 0 ? "No price changes yet." : null}>
        {priceRows.length > 0 && (
          <DataTable rowKey={(r) => `${r.date}-${r.old_price}-${r.new_price}`} minWidth={400}
            columns={[
              { key: "date", heading: "Date", width: "1fr" },
              { key: "old_price", heading: "From", render: (r) => Number(r.old_price).toFixed(1) },
              { key: "new_price", heading: "To", render: (r) => Number(r.new_price).toFixed(1),
                color: (r) => (Number(r.new_price) > Number(r.old_price) ? T.green : "#FFFFFF") },
              { key: "move", heading: "Move", render: (r) => (Number(r.new_price) > Number(r.old_price) ? "Rise" : "Fall"),
                color: (r) => (Number(r.new_price) > Number(r.old_price) ? T.green : "#FFFFFF") },
            ]}
            rows={priceRows.slice().reverse()} />
        )}
      </Section>
    </div>
  );
}
