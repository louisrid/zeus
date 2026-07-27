"use client";
import React from "react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { metricName } from "../../lib/solver/score.mjs";
import { T, S, Skeleton, ErrorCard, Label, lang, val } from "../../lib/ui";
import { emptySquad } from "../../lib/solver/squad";
import BuilderPitch from "../../components/BuilderPitch";
import Candidates from "../../components/Candidates";
import { squadAt, transferLedger, saleValue, PLAN_RULES } from "../../lib/plan.mjs";
import { xpWithCaptain } from "../../lib/captain.mjs";

/* THE SQUAD SCREEN.
 *
 * Same pitch and same player list as the Builder, so swapping a player works identically wherever you
 * are. One difference of substance: a plan here is a SETTLED team, not a blank slate. You get one free
 * transfer a gameweek (banking to five) and anything beyond that costs four points, deducted from the
 * xP figure rather than mentioned in a footnote.
 *
 * Team 4812 is always first in the dropdown and always read-only: it draws the same empty pitch the
 * Builder shows for an unstarted squad, and fills itself from the API at the first deadline.
 */
export default function SquadClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const [plans, setPlans] = React.useState(null);
  const [livePlan, setLivePlan] = React.useState(null);
  const [planError, setPlanError] = React.useState(null);

  const [selectedId, setSelectedId] = React.useState("live");
  const [gw, setGw] = React.useState(1);
  const [outFor, setOutFor] = React.useState(null);   // the player selected to be transferred out

  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then((c) => { setCore(c); return loadModel(c).then(setModel); }).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const loadPlans = React.useCallback(() => {
    fetch("/api/plans").then((r) => r.json()).then((j) => {
      if (!j.ok) { setPlanError(j.error); setPlans([]); return; }
      setPlanError(null); setPlans(j.plans || []); setLivePlan(j.live || null);
    }).catch(() => { setPlanError("Plans could not be loaded."); setPlans([]); });
  }, []);
  React.useEffect(() => { loadPlans(); }, [loadPlans]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const gwBounds = React.useMemo(() => {
    const gws = core ? (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite) : [];
    return gws.length ? { first: Math.min(...gws), last: Math.max(...gws) } : { first: 1, last: 1 };
  }, [core]);
  const firstGw = gwBounds.first, lastGw = gwBounds.last;
  React.useEffect(() => { setGw(firstGw); }, [firstGw]);

  const selected = selectedId === "live" ? livePlan : (plans || []).find((p) => String(p.id) === String(selectedId));
  const shaped = selected ? { ...selected, base: selected.base || [], weeks: selected.weeks || {} } : null;
  const readOnly = selectedId === "live";

  /* Hydrate from the live player list: a stored plan row carries an id and little else. */
  const state = React.useMemo(() => {
    if (!shaped || !core) return null;
    const raw = squadAt(shaped, gw);
    const byId = new Map(core.players.map((p) => [p.fpl_id, p]));
    const players = raw.players
      .map((r) => { const live = byId.get(r.fpl_id); return live ? { ...live, starting: Boolean(r.starting) } : null; })
      .filter(Boolean);
    return { ...raw, players };
  }, [shaped, core, gw]);

  const week = React.useMemo(() => {
    if (!shaped) return null;
    const rows = transferLedger(shaped, gw);
    return rows[rows.length - 1] || null;
  }, [shaped, gw]);

  const oppOf = React.useCallback((p) => {
    if (!core) return null;
    return nextFixtures(core.fixtures, core.teamById, p.team_id, 14).find((f) => f.gw === gw) || null;
  }, [core, gw]);
  const xpOf = React.useCallback((p) => (model ? model.scoreForGw(p, gw) : null), [model, gw]);
  const run5Of = React.useCallback((p) => {
    if (!model || !core) return null;
    const vals = nextFixtures(core.fixtures, core.teamById, p.team_id, 5)
      .map((f) => model.scoreForGw(p, f.gw)).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
  }, [model, core]);

  const grossXp = React.useMemo(() => {
    if (!state) return 0;
    const starters = state.players.filter((p) => p.starting);
    const xi = starters.length ? starters : state.players.slice(0, 11);
    return xi.reduce((a, p) => a + (xpWithCaptain(xpOf(p), state.captain === p.fpl_id).value ?? 0), 0);
  }, [state, xpOf]);

  const writePlan = async (next) => {
    setPlans((list) => (list || []).map((p) => (p.id === next.id ? next : p)));
    if (livePlan && next.id === livePlan.id) setLivePlan(next);
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save", id: next.id, name: next.name, structure: next.structure,
        captain: next.captain, vice: next.vice, base: next.base, weeks: next.weeks,
        ignores: next.ignores || [], maybeIds: next.maybe_ids || [],
      }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "The change could not be saved." }));
    if (!r.ok) setPlanError(r.error);
  };

  const patchWeek = (patch) => {
    if (!shaped) return;
    const weeks = { ...shaped.weeks };
    weeks[gw] = { ...(weeks[gw] || {}), ...patch };
    writePlan({ ...shaped, weeks });
  };

  const transfers = shaped ? ((shaped.weeks[gw] || {}).transfers || []) : [];

  const completeTransfer = (incoming) => {
    if (!outFor || readOnly) return;
    patchWeek({ transfers: [...transfers, {
      out: outFor.fpl_id, in: incoming.fpl_id,
      position: incoming.position, team_id: incoming.team_id, price: Number(incoming.price),
    }] });
    setOutFor(null);
  };

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || plans === null) {
    return <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}><Skeleton h={110} /><Skeleton h={560} /></div>;
  }

  const options = [
    { id: "live", label: livePlan && livePlan.entry_id ? `Team ${livePlan.entry_id}` : "Team 4812" },
    ...(plans || []).map((p) => ({ id: String(p.id), label: p.name })),
  ];
  const empty = !state || state.players.length === 0;
  const hit = week ? week.hit : 0;

  // Money available if the selected player is sold: FPL returns half of any rise, so sale value, not price.
  const spend = state ? state.players.reduce((a, p) => a + Number(p.price || 0), 0) : 0;
  const bankNow = PLAN_RULES.budget - spend;
  const spendable = outFor ? bankNow + (saleValue(outFor.price, outFor.price) ?? Number(outFor.price)) : bankNow;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      {/* Team selector and gameweek arrows */}
      <section style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        flexWrap: "wrap", maxWidth: 1040, width: "100%", margin: "0 auto" }}>
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setOutFor(null); }}
          style={{ height: 56, padding: "0 20px", borderRadius: 14, background: T.card,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(19, 700), outline: "none", minWidth: 320 }}>
          {options.map((o) => <option key={o.id} value={o.id} style={{ background: T.card }}>{o.label}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setGw((g) => Math.max(firstGw, g - 1))} disabled={gw <= firstGw} className="fb-press"
            style={{ width: 44, height: 44, borderRadius: 999, background: T.card, border: `1px solid ${T.line}`,
              ...lang(18, 700), opacity: gw <= firstGw ? 0.4 : 1 }} aria-label="Previous gameweek">‹</button>
          <span style={{ ...val(18), minWidth: 78, textAlign: "center" }}>GW{gw}</span>
          <button onClick={() => setGw((g) => Math.min(lastGw, g + 1))} disabled={gw >= lastGw} className="fb-press"
            style={{ width: 44, height: 44, borderRadius: 999, background: T.card, border: `1px solid ${T.line}`,
              ...lang(18, 700), opacity: gw >= lastGw ? 0.4 : 1 }} aria-label="Next gameweek">›</button>
        </div>
      </section>

      {planError && <span style={{ ...lang(14, 600, T.pink), lineHeight: 1.5, textAlign: "center" }}>{planError}</span>}

      <div style={{ maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <BuilderPitch
            squad={empty
              ? emptySquad((shaped && shaped.structure) || "3-5-2")
              : { structure: state.structure, players: state.players, captain: state.captain, vice: state.vice }}
            scoreOf={xpOf} metricName={metricName(model.gateOpen)} showMetric={!empty}
            oppOf={oppOf} scale={scale}
            activeSlot={outFor ? outFor.position : null}
            xpTotal={empty ? null : grossXp} xpHit={readOnly ? 0 : hit}
            freeTransfers={readOnly ? null : (week ? Math.max(0, week.free - transfers.length) : PLAN_RULES.freePerGw)}
            onSlotClick={() => {}}
            onOpenPlayer={(p) => { if (!readOnly) setOutFor((cur) => (cur && cur.fpl_id === p.fpl_id ? null : p)); }}
            onSwap={() => {}} />
          {readOnly && (
            <span style={{ ...lang(13.5, 600), display: "block", textAlign: "center", marginTop: 10 }}>
              Read-only. Syncs from the official API at the first deadline.
            </span>
          )}
      </div>

      {/* Transfers planned for this gameweek */}
      {!readOnly && transfers.length > 0 && (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius,
          padding: 16, display: "flex", flexDirection: "column", gap: 9, maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <Label color={T.green}>Transfers in GW{gw}</Label>
          {transfers.map((t, i) => {
            const byId = new Map(core.players.map((p) => [p.fpl_id, p]));
            const out = byId.get(t.out), inn = byId.get(t.in);
            const paid = i >= (week ? week.free : 0);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={lang(14, 600)}>{out ? out.web_name : t.out} out</span>
                <span style={val(13, "#FFFFFF", 500)}>to</span>
                <span style={lang(14, 700)}>{inn ? inn.web_name : t.in} in at {Number(t.price).toFixed(1)}</span>
                {paid && <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px",
                  borderRadius: 999, background: "#3A0217", ...val(13, T.pink, 500) }}>-{PLAN_RULES.hitCost}</span>}
                <button onClick={() => { const list = [...transfers]; list.splice(i, 1); patchWeek({ transfers: list }); }}
                  className="fb-press" style={{ height: 28, padding: "0 11px", borderRadius: 999, background: T.plate, ...lang(13, 700) }}>
                  UNDO
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* The same player list the Builder uses, at the bottom */}
      {!readOnly && !empty && (
        <div style={{ maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          {outFor
            ? <span style={{ ...lang(14, 600), display: "block", marginBottom: 10 }}>
                Replacing {outFor.web_name}. He sells for {(saleValue(outFor.price, outFor.price) ?? Number(outFor.price)).toFixed(1)},
                so you can spend {spendable.toFixed(1)}.
              </span>
            : <span style={{ ...lang(14, 600), display: "block", marginBottom: 10 }}>
                Click a player on the pitch to replace him.
              </span>}
          <Candidates pos={outFor ? outFor.position : "ALL"} pool={core.players}
            squad={{ structure: state.structure, players: outFor ? state.players.filter((p) => p.fpl_id !== outFor.fpl_id) : state.players,
              captain: state.captain, vice: state.vice }}
            scoreOf={model.scoreOf} bandOf={model.bandOf} gateOpen={model.gateOpen}
            onAdd={completeTransfer} max={Math.max(6, grossXp / 8)}
            oppOf={oppOf} scale={scale} xpOf={xpOf} run5Of={run5Of} />
        </div>
      )}
    </div>
  );
}
