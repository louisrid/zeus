"use client";
import React from "react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { metricName } from "../../lib/solver/score.mjs";
import { T, S, Kit, Label, Skeleton, ErrorCard, WarnFlag, lang, val, code } from "../../lib/ui";
import Opp from "../../components/Opp";
import PitchSurface from "../../components/PitchSurface";
import PlayerPlate from "../../components/PlayerPlate";
import LINEUPS from "../../config/lineups.json";
import { resolveLineups } from "../../lib/lineups.mjs";

/* PREDICTED LINE-UPS.
 *
 * The data is a checked-in file, transcribed from Fantasy Football Pundit's published pitch graphics.
 * A scrape was built and failed three times: the site challenges automated requests and answers a server
 * with a 202 and an empty body. A file that is right beats a job that does not run.
 *
 * The rows are drawn exactly as the source draws them, back to front, so a 4-2-3-1 renders as four, two,
 * three, one and a 3-4-3 renders as three, four, three. Nothing here derives a shape or picks an eleven:
 * that is what produced twenty identical 4-5-1s from a model with no pre-season signal.
 *
 * Names are matched to our player list for the shirt colour, price and xPTS. An unmatched name still
 * renders, with the name the source used, because the line-up is the point and a gap would be worse.
 */

function Shirt({ name, player, short, xp, metric }) {
  const flagged = player && player.status && player.status !== "a";
  /* The shirt follows the eleven he is published in. Using player.team here drew a transferred player in
     his former club's colours for as long as the stored player list lagged the team news. */
  return (
    <div style={{ width: 92, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <Kit team={short} size={40} />
      <PlayerPlate name={player ? player.web_name : name} xp={xp} muted={!player}
        flag={flagged ? <WarnFlag size={13} /> : null} />
      {!player && <span style={lang(12.5, 500)}>Not in the player list yet</span>}
    </div>
  );
}

function TeamPanel({ label, short, onTeam, core, scale, xpOf, resolved: all }) {
  const entry = all.byClub.get(short) || all.byClub.get(LINEUPS.clubs[0].short);
  const { row, club, lines: resolved } = entry;

  const matched = resolved.flat().filter((x) => x.player).length;
  const shape = row.rows.slice(1).map((r) => r.length).join("-");
  const fixture = club ? nextFixtures(core.fixtures, core.teamById, club.id, 1)[0] : null;
  const xi = resolved.flat().map((x) => x.player).filter(Boolean);
  const total = xi.reduce((a, p) => a + (xpOf(p) ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Label color={T.green}>{label}</Label>
        <select value={short} onChange={(e) => onTeam(e.target.value)}
          style={{ height: S.ctrl, padding: "0 14px", borderRadius: S.radiusSm, background: T.card,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(16, 700), outline: "none", minWidth: 210 }}>
          {LINEUPS.clubs.map((c) => (
            <option key={c.short} value={c.short} style={{ background: T.card }}>{c.club}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={code(13, T.green)}>TEAM NEWS · {String(row.updated).toUpperCase()}</span>
        <span style={{ ...lang(13.5, 500) }}>{row.fixture}</span>
        {fixture && <Opp fx={fixture} scale={scale} size="sm" showNumber={false} />}
      </div>

      <PitchSurface minHeight={540} corners={
        <span style={{ position: "absolute", top: 14, right: 16, zIndex: 3, display: "flex",
          flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(6,0,12,0.82)",
            border: `1px solid ${T.line}`, borderRadius: S.radiusSm, padding: "0 10px", height: S.ctrlSm }}>
            <span style={{ ...lang(11.5, 700), letterSpacing: "0.06em", opacity: 0.85 }}>{metricName(true)}</span>
            <span style={val(15, T.xp)}>{total.toFixed(1)}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(6,0,12,0.82)",
            border: `1px solid ${T.line}`, borderRadius: S.radiusSm, padding: "0 10px", height: S.ctrlSm }}>
            <span style={{ ...lang(11.5, 700), letterSpacing: "0.06em", opacity: 0.85 }}>SHAPE</span>
            <span style={val(15)}>{shape}</span>
          </span>
        </span>
      }>
        {resolved.map((line, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            {line.map((x) => (
              <Shirt key={x.name} name={x.name} player={x.player} short={row.short}
                xp={x.player ? xpOf(x.player) : null} />
            ))}
          </div>
        ))}
      </PitchSurface>

      {matched < 11 && (
        <span style={{ ...lang(13, 500) }}>
          {11 - matched === 1 ? "One player" : `${11 - matched} players`} not yet in the game's list.
        </span>
      )}
    </div>
  );
}

export default function LineupsClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [left, setLeft] = React.useState("ARS");
  const [right, setRight] = React.useState("MCI");

  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then((c) => { setCore(c); return loadModel(c).then(setModel); }).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  /* FORCING A PULL. The scrape runs on GitHub, commits the file, and the app only sees
     it after Vercel redeploys off that commit. So this cannot be a spinner that ends in
     new line-ups: it is a request, and the panel says plainly what happens next rather
     than implying the page is about to change by itself. */
  const [pull, setPull] = React.useState({ state: "idle", message: null });
  const forcePull = React.useCallback(async () => {
    setPull({ state: "sending", message: null });
    try {
      const res = await fetch("/api/lineups-refresh", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setPull({ state: "sent", message: body.note || body.message || "Requested." });
      } else {
        setPull({ state: "failed", message: body.how_to_fix || body.error || `Request failed (${res.status}).` });
      }
    } catch (error) {
      setPull({ state: "failed", message: error.message });
    }
  }, []);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const xpOf = React.useCallback((p) => (model ? model.scoreOf(p) : null), [model]);
  /* Resolved once for the whole league, shared by both panels and identical to what the model used. */
  const resolved = React.useMemo(() => (core
    ? resolveLineups(LINEUPS.clubs, core.players, Object.values(core.teamById))
    : null), [core]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || !resolved) {
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.gap }}><Skeleton h={560} /><Skeleton h={560} /></div>;
  }

  const capturedAt = LINEUPS.captured_at || LINEUPS.captured || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius,
        padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: "1 1 auto" }}>
          <Label color={T.xp}>Predicted line-ups</Label>
          <span style={code(12.5, "#9E86B4")}>
            {LINEUPS.source ? `${LINEUPS.source.toUpperCase()}` : "SOURCE UNKNOWN"}
            {capturedAt ? ` · CAPTURED ${String(capturedAt).replace("T", " ").slice(0, 16)}` : ""}
            {" · PULLS DAILY AT 06:20 UTC"}
          </span>
        </span>
        <button type="button" onClick={forcePull} disabled={pull.state === "sending"} className="fb-press"
          title="Ask GitHub to scrape the line-ups now instead of waiting for the daily run"
          style={{ display: "flex", alignItems: "center", height: S.btnSm, padding: "0 18px",
            borderRadius: S.radiusSm, background: T.xp, border: "none", flexShrink: 0,
            cursor: pull.state === "sending" ? "default" : "pointer",
            opacity: pull.state === "sending" ? 0.55 : 1, ...lang(14, 700, "#04202B") }}>
          {pull.state === "sending" ? "REQUESTING" : "PULL LINE-UPS NOW"}
        </button>
        {pull.message && (
          <span style={{ ...lang(13, 600, pull.state === "failed" ? T.pink : T.green),
            flex: "1 1 100%", lineHeight: 1.45 }}>
            {pull.message}
          </span>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))",
        gap: S.gap, alignItems: "start" }}>
        <TeamPanel label="Team one" short={left} onTeam={setLeft} core={core} scale={scale} xpOf={xpOf} resolved={resolved} />
        <TeamPanel label="Team two" short={right} onTeam={setRight} core={core} scale={scale} xpOf={xpOf} resolved={resolved} />
      </div>
    </div>
  );
}
