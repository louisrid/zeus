"use client";
import React from "react";
import Link from "next/link";
import { X, ArrowRight, Maximize2 } from "lucide-react";
import { T, S, D, Kit, Label, Plate, POS_LABEL, Skeleton, ErrorCard, lang, val, code } from "../../lib/ui";
import { sb, loadCore, nextFixtures } from "../../lib/data";
import { buildOpponentScale } from "../../lib/opponent";
import Opp from "../../components/Opp";
import { NextFixtureXP } from "../../components/FixtureXP";
import { TeamConnect, ChipPlanner } from "../../components/TeamAndChips";
import { loadModel, provenanceLine } from "../../lib/projections";
import { metricName, metricLabel, interimChip } from "../../lib/solver/score.mjs";
import { RULES, xi, benchOf, benchOrder, structureByKey, applyStructure } from "../../lib/solver/squad";
import { evaluateSquad, replacements } from "../../lib/solver/evaluate";
import Pitch from "../../components/Pitch";
import Fan, { FanLarge } from "../../components/Fan";

/* Where the current 15 comes from, in priority order. Each source is named on screen so the
   number on the pitch is never mistaken for something it is not. */
async function loadCurrentSquad(core) {
  const supabase = sb();
  const byId = new Map(core.players.map((p) => [p.fpl_id, p]));
  const internalToFpl = new Map(core.players.map((p) => [p.id, p.fpl_id]));

  const picks = await supabase.from("gw_picks").select("*").eq("gw", core.currentGw).maybeSingle();
  if (!picks.error && picks.data && Array.isArray(picks.data.picks) && picks.data.picks.length) {
    const players = picks.data.picks
      .map((k) => {
        const fpl = k.fpl_id ?? internalToFpl.get(k.player_id) ?? k.element;
        const p = byId.get(fpl);
        return p ? { ...p, starting: k.starting ?? (k.position ? k.position <= 11 : true) } : null;
      })
      .filter(Boolean);
    if (players.length) {
      return { source: "Your submitted team", players, captain: picks.data.captain ?? null, vice: picks.data.vice ?? null, structure: null };
    }
  }

  // my_squad is what the team ID connect writes. Without this the connect populated a table nothing
  // read, so turning on the live team appeared to do nothing.
  const mine = await supabase.from("my_squad").select("*").order("gw", { ascending: false }).limit(1).maybeSingle();
  if (!mine.error && mine.data && mine.data.picks) {
    const raw = Array.isArray(mine.data.picks) ? mine.data.picks : mine.data.picks.picks;
    if (Array.isArray(raw) && raw.length) {
      const players = raw
        .map((k) => {
          const fpl = k.element ?? k.fpl_id ?? internalToFpl.get(k.player_id);
          const p = byId.get(fpl);
          // The official API gives multiplier 0 for a benched player and position 1-11 for starters.
          const starting = k.multiplier !== undefined ? Number(k.multiplier) > 0
            : k.position !== undefined ? Number(k.position) <= 11 : true;
          return p ? { ...p, starting } : null;
        })
        .filter(Boolean);
      if (players.length) {
        const captain = raw.find((k) => k.is_captain);
        const vice = raw.find((k) => k.is_vice_captain);
        return {
          source: `Your live team · GW${mine.data.gw}`,
          players,
          captain: captain ? (captain.element ?? captain.fpl_id ?? null) : null,
          vice: vice ? (vice.element ?? vice.fpl_id ?? null) : null,
          structure: null,
        };
      }
    }
  }

  const draft = await supabase.from("squad_drafts").select("*").eq("is_plan_of_record", true).limit(1).maybeSingle();
  if (!draft.error && draft.data && draft.data.squad) {
    const s = draft.data.squad;
    const players = (s.picks || [])
      .map((k) => { const p = byId.get(k.fpl_id); return p ? { ...p, starting: Boolean(k.starting) } : null; })
      .filter(Boolean);
    if (players.length) {
      return { source: `Plan of record · ${draft.data.name}`, players, captain: s.captain ?? null, vice: s.vice ?? null, structure: s.structure };
    }
  }
  return null;
}

function Empty() {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 30, maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
      <Label color={T.green}>Nothing to show yet</Label>
      <p style={{ ...lang(16), lineHeight: 1.6, margin: 0 }}>
        This page shows your live fifteen once the season is under way and your team ID sync is on. Until then, build a squad in
        the Builder and mark it as the plan of record and it will appear here.
      </p>
      <Link href="/builder" style={{ textDecoration: "none" }}>
        <span className="fb-press" style={{ display: "inline-flex", alignItems: "center", height: S.btn, padding: "0 24px", borderRadius: 999, background: T.green, ...lang(15, 700, "#04130A") }}>
          OPEN THE BUILDER
        </span>
      </Link>
    </section>
  );
}

function ReplaceDrawer({ player, squad, pool, ctx, gateOpen, max, onClose }) {
  const list = React.useMemo(() => replacements(squad, player, pool, ctx, 10), [squad, player, pool, ctx]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", background: "rgba(6,0,10,0.6)" }}>
      <aside className="fb-drawer" onClick={(e) => e.stopPropagation()} style={{ width: 520, height: "100%", overflowY: "auto", background: T.row, borderLeft: `1px solid ${T.line}` }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "22px 26px", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.row, zIndex: 1 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Kit team={player.team} size={34} />
            <div>
              <div style={{ ...lang(22, 700), lineHeight: 1 }}>Replace {player.web_name}</div>
              <div style={{ marginTop: 7, ...code(13.5) }}>{player.team} · {POS_LABEL[player.position]} · {Number(player.price).toFixed(1)}</div>
            </div>
          </div>
          <button onClick={onClose} className="fb-press" style={{ width: 38, height: 38, borderRadius: 19, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={17} color="#FFFFFF" />
          </button>
        </header>
        <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={lang(14.5, 600)}>
            Ranked same-position options inside your bank. Informational only: you make the move in the official app.
          </span>
          {list.map((r) => (
            <div key={r.player.fpl_id} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) 66px 118px 64px 64px", gap: 8, alignItems: "center",
              background: T.card, borderRadius: S.radiusSm, padding: "0 12px", height: 56 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <Kit team={r.player.team} size={20} />
                <span style={{ ...lang(15, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player.web_name}</span>
              </span>
              <Plate w={62}>{Number(r.player.price).toFixed(1)}</Plate>
              <span style={{ ...val(13.5, r.delta > 0 ? T.green : r.delta < 0 ? T.pink : "#FFFFFF"), textAlign: "center" }}>
                {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}
              </span>
              <span style={{ ...val(13, "#FFFFFF", 500), textAlign: "center" }}>{r.bankAfter.toFixed(1)}</span>
            </div>
          ))}
          {!list.length && <span style={lang(15)}>No same-position option fits your bank.</span>}
        </div>
      </aside>
    </div>
  );
}

export default function SquadClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [current, setCurrent] = React.useState(undefined);
  const [err, setErr] = React.useState(false);
  const [horizon, setHorizon] = React.useState(1);
  const [replaceFor, setReplaceFor] = React.useState(null);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then(async (c) => {
        setCore(c);
        const [m, cur] = await Promise.all([loadModel(c), loadCurrentSquad(c)]);
        setModel(m);
        setCurrent(cur);
      })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setReplaceFor(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const fxOf = React.useCallback((p) => (core ? nextFixtures(core.fixtures, core.teamById, p.team_id, 6) : []), [core]);

  const runByGw = React.useMemo(() => {
    if (!core || !scale) return [];
    const byGw = {};
    for (const f of core.fixtures) {
      const a = scale.difficultyOf(f.away_team, false);
      const b = scale.difficultyOf(f.home_team, true);
      for (const d of [a, b]) {
        if (!d) continue;
        byGw[f.gw] = byGw[f.gw] || [];
        byGw[f.gw].push(d.difficulty);
      }
    }
    return Object.entries(byGw)
      .map(([gw, xs]) => {
        const mean = Math.round(xs.reduce((x, y) => x + y, 0) / xs.length);
        return { gw: Number(gw), difficulty: mean, tone: mean < 40 ? T.green : mean < 60 ? "#FFFFFF" : T.pink };
      })
      .sort((x, y) => x.gw - y.gw);
  }, [core, scale]);

  const ctx = React.useMemo(() => {
    if (!model) return null;
    return {
      scoreOf: model.scoreOf, bandOf: model.bandOf, tailOf: model.tailOf, floorOf: model.floorOf,
      minutes: model.minutes, perGw: model.perGw,
    };
  }, [model]);

  const squad = React.useMemo(() => {
    if (!current || !ctx) return null;
    const base = { structure: current.structure || "3-5-2", players: current.players, captain: current.captain, vice: current.vice };
    return current.structure ? base : applyStructure(base, base.structure, ctx.scoreOf);
  }, [current, ctx]);

  const evaluation = React.useMemo(() => (squad && ctx ? evaluateSquad(squad, horizon, ctx) : null), [squad, horizon, ctx]);
  const maxScore = React.useMemo(() => {
    if (!squad || !ctx) return 10;
    return Math.max(6, ...squad.players.map((p) => ctx.bandOf(p).p90 || 0));
  }, [squad, ctx]);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || current === undefined) {
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: S.gap }}><Skeleton h={560} /><Skeleton h={560} /></div>;
  }
  if (!current || !squad) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
        <TeamConnect />
        <Empty />
        <ChipPlanner runByGw={runByGw} core={core} />
      </div>
    );
  }

  const bench = benchOrder(squad, ctx.floorOf);
  const displaySquad = [...xi(squad), ...bench];
  const cap = evaluation.captaincy;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: S.gap, alignItems: "start" }}>
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <div>
              <Label color={T.green}>{current.source}</Label>
              <h2 style={{ margin: "5px 0 0", ...lang(24, 700) }}>Your fifteen · GW{core.currentGw}</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Plate w={112} h={40} size={15} color={T.green}>{evaluation.points.mean.toFixed(1)}</Plate>
              <span style={{ ...lang(13, 700), maxWidth: 120, lineHeight: 1.3 }}>{metricLabel(model.gateOpen)}</span>
            </div>
          </header>
          <Pitch squad={displaySquad} scale={scale} oppOf={(p) => fxOf(p)[0] || null} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {squad.players.map((p) => (
              <span key={p.fpl_id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setReplaceFor(p)} className="fb-hover"
                style={{ display: "flex", alignItems: "center", gap: 8, height: 42, padding: "0 12px", borderRadius: 999,
                  background: T.row, border: `1px solid ${T.line}` }}>
                <Kit team={p.team} size={18} />
                <span style={lang(14, 700)}>{p.web_name}</span>
                <NextFixtureXP fx={fxOf(p)[0]} scale={scale}
                  xp={(() => { const f = fxOf(p)[0]; return f && model ? model.scoreForGw(p, f.gw) : null; })()} />
                <ArrowRight size={13} color="#FFFFFF" />
              </button>
              <Link href={`/player/${p.fpl_id}`} aria-label={`${p.web_name} player page`} style={{ textDecoration: "none" }}>
                <span className="fb-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 42, width: 34, borderRadius: 999, background: T.plate }}>
                  <Maximize2 size={14} color="#FFFFFF" />
                </span>
              </Link>
              </span>
            ))}
          </div>
          <span style={{ ...lang(13, 600) }}>Tap any player for ranked replacements and the net effect on the squad.</span>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
          <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label color={T.tag}>Captain picker</Label>
              <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>Who takes the armband</h2>
            </div>
            {!cap ? (
              <span style={lang(14.5)}>No starting eleven to choose from.</span>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                  <span style={{ ...D, fontSize: 34, lineHeight: 1, color: "#FFFFFF" }}>{cap.best.ev.toFixed(1)}</span>
                  <span style={{ ...lang(14.5, 700), paddingBottom: 5 }}>{cap.best.p.web_name}</span>
                  <span style={{ ...val(13, "#FFFFFF", 500), paddingBottom: 6 }}>{cap.set ? "SET" : "AUTO"}</span>
                </div>
                <FanLarge band={cap.best.band} max={maxScore} color={T.tag}
                  label={`Doubled: ${(cap.best.band.p10 * 2).toFixed(1)} to ${(cap.best.band.p90 * 2).toFixed(1)} on the armband.`} />
                {cap.ranked.map((r, i) => (
                  <div key={r.p.fpl_id} style={{ display: "grid", gridTemplateColumns: "minmax(90px,1fr) 96px 58px 54px", gap: 8, alignItems: "center",
                    background: i === 0 ? "rgba(255,46,204,0.14)" : T.row, border: `1px solid ${i === 0 ? T.tag : "transparent"}`,
                    borderRadius: S.radiusSm, padding: "0 12px", height: 46 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Kit team={r.p.team} size={18} />
                      <span style={{ ...lang(14, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.p.web_name}</span>
                    </span>
                    <span style={{ ...val(13.5), textAlign: "center" }}>{r.ev.toFixed(1)}</span>
                    <span style={{ ...val(13, "#FFFFFF", 500), textAlign: "center" }}>{Number(r.p.own || 0).toFixed(0)}%</span>
                  </div>
                ))}
                <span style={{ ...lang(13, 600), lineHeight: 1.5 }}>
                  Right column is overall ownership. Top-ten-thousand effective ownership replaces it when the ownership scrape lands.
                </span>
                {cap.best.tail === null && <span style={val(13, "#FFFFFF", 500)}>{interimChip("score")}</span>}
              </>
            )}
          </section>

          <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Label color={T.green}>Horizon</Label>
              <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>{evaluation.points.mean.toFixed(0)} over {horizon} GW</h2>
            </div>
            <input type="range" min={1} max={12} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}
              style={{ width: "100%", accentColor: T.green }} aria-label="Horizon in gameweeks" />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Plate w={64} color={horizon <= 3 ? T.green : horizon <= 6 ? "#FFFFFF" : T.pink}>
                {horizon <= 3 ? "FIRM" : horizon <= 6 ? "SOFT" : "WEAK"}
              </Plate>
              <span style={{ ...lang(13, 600), lineHeight: 1.5 }}>
                {horizon <= 3
                  ? "Fixtures and prices are known this close, so the spread here is mostly minutes uncertainty."
                  : horizon <= 6
                    ? "Beyond three gameweeks rotation and price changes start to dominate. Use it for direction, not totals."
                    : "Past six gameweeks this is a fixture-difficulty sketch. Transfers, injuries and blanks will invalidate the total."}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["FLOOR", evaluation.points.p10.toFixed(0)], ["CEILING", evaluation.points.p90.toFixed(0)],
                ["RISKS", evaluation.risk.count], ["BENCH FLOOR", evaluation.structure.benchQuality.toFixed(1)]].map(([l, v2]) => (
                <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: T.plate, borderRadius: 10, padding: "9px 2px" }}>
                  <span style={{ ...lang(13, 700), textAlign: "center" }}>{l}</span>
                  <span style={val(13.5)}>{v2}</span>
                </div>
              ))}
            </div>
            <span style={{ ...lang(13, 600), lineHeight: 1.5 }}>{provenanceLine(model)}</span>
          </section>

          {evaluation.risk.count > 0 && (
            <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <Label color={T.pink}>Watch list</Label>
                <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>{evaluation.risk.count} flagged</h2>
              </div>
              {evaluation.risk.items.map((r) => (
                <div key={r.player.fpl_id} style={{ display: "flex", alignItems: "center", gap: 9, height: 42, padding: "0 12px", borderRadius: S.radiusSm, background: T.row }}>
                  <Kit team={r.player.team} size={18} />
                  <span style={{ ...lang(14, 700), flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player.web_name}</span>
                  <span style={val(13, T.pink, 500)}>{r.kind.toUpperCase()}</span>
                  {r.detail && <span style={val(13, "#FFFFFF", 500)}>{r.detail}</span>}
                </div>
              ))}
              <span style={val(13, "#FFFFFF", 500)}>{interimChip("minutes")}</span>
            </section>
          )}
        </div>
      </div>

      <TeamConnect />
      <ChipPlanner runByGw={runByGw} core={core} />

      {replaceFor && (
        <ReplaceDrawer player={replaceFor} squad={squad} pool={core.players} ctx={ctx} gateOpen={model.gateOpen}
          max={maxScore} onClose={() => setReplaceFor(null)} />
      )}
    </div>
  );
}
