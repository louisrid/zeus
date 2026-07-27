"use client";
import React from "react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { metricName } from "../../lib/solver/score.mjs";
import { T, S, Skeleton, ErrorCard, Label, lang, val, code } from "../../lib/ui";
import BuilderPitch from "../../components/BuilderPitch";
import TransferPicker from "../../components/TransferPicker";
import { squadAt, transferLedger, saleValue, PLAN_RULES } from "../../lib/plan.mjs";
import { xpWithCaptain } from "../../lib/captain.mjs";

/* THE SQUAD SCREEN: a pitch, a team selector, and gameweek arrows.
 *
 * Same pitch component as the Builder, so a squad looks identical wherever it appears. The previous
 * version was a grid of summary cards, which was not what was asked for and told you nothing you could
 * not see faster on a pitch.
 *
 * Team 4812 is permanently the first entry in the selector. It holds no players until the FPL API
 * returns picks, and then it fills itself.
 *
 * Plan rows are always HYDRATED from the live player list. Plans converted from old drafts stored only
 * an id, a position and a starting flag, with no price and no club, which is why spend read NaN and
 * every shirt fell back to the default colour.
 */

const Plate = ({ label, value, tone = "#FFFFFF" }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 4, background: T.plate, borderRadius: 10, padding: "9px 14px", minWidth: 78 }}>
    <span style={code(13)}>{label}</span>
    <span style={val(16, tone)}>{value}</span>
  </div>
);

export default function SquadClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const [plans, setPlans] = React.useState(null);
  const [livePlan, setLivePlan] = React.useState(null);
  const [planError, setPlanError] = React.useState(null);

  const [selectedId, setSelectedId] = React.useState("live");
  const [gw, setGw] = React.useState(1);
  const [transferOpen, setTransferOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then((c) => { setCore(c); return loadModel(c).then(setModel); })
      .catch(() => setErr(true));
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
  const firstGw = React.useMemo(() => {
    if (!core) return 1;
    const gws = (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite);
    return gws.length ? Math.min(...gws) : 1;
  }, [core]);
  const lastGw = React.useMemo(() => {
    if (!core) return 1;
    const gws = (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite);
    return gws.length ? Math.max(...gws) : 1;
  }, [core]);
  React.useEffect(() => { setGw(firstGw); }, [firstGw]);

  const selected = selectedId === "live" ? livePlan : (plans || []).find((p) => String(p.id) === String(selectedId));
  const shaped = selected ? { ...selected, base: selected.base || [], weeks: selected.weeks || {} } : null;

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

  const gwPoints = React.useMemo(() => {
    if (!state) return null;
    const starters = state.players.filter((p) => p.starting);
    const xi = starters.length ? starters : state.players.slice(0, 11);
    let total = 0;
    for (const p of xi) {
      const v = xpWithCaptain(xpOf(p), state.captain === p.fpl_id);
      total += v.value ?? 0;
    }
    return total;
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

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || plans === null) {
    return <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}><Skeleton h={120} /><Skeleton h={560} /></div>;
  }

  const options = [
    { id: "live", label: livePlan && livePlan.entry_id ? `Team ${livePlan.entry_id}` : "Team 4812" },
    ...(plans || []).map((p) => ({ id: String(p.id), label: p.name })),
  ];
  const transfers = shaped ? ((shaped.weeks[gw] || {}).transfers || []) : [];
  const empty = !state || state.players.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      {/* Team selector and gameweek arrows */}
      <section style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          style={{ height: 44, padding: "0 14px", borderRadius: 12, background: T.card,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(15, 700), outline: "none", minWidth: 240 }}>
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

        {!empty && (
          <>
            <Plate label={metricName(model.gateOpen)} value={gwPoints ? gwPoints.toFixed(1) : "0.0"} />
            <Plate label="FREE" value={week ? week.free : PLAN_RULES.freePerGw} />
            {week && week.hit > 0 && <Plate label="HIT" value={`-${week.hit}`} tone={T.pink} />}
            <button onClick={() => setTransferOpen(true)} className="fb-press"
              style={{ height: 44, padding: "0 18px", borderRadius: 999, background: T.card,
                border: `1px solid ${T.line}`, ...lang(14, 700) }}>
              PLAN A TRANSFER
            </button>
          </>
        )}
      </section>

      {planError && <span style={{ ...lang(14, 600, T.pink), lineHeight: 1.5 }}>{planError}</span>}

      {/* The pitch, exactly as the Builder draws it */}
      {empty ? (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius,
          padding: 30, display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
          <Label color={T.green}>{selectedId === "live" ? "Your team" : "Empty"}</Label>
          <span style={{ ...lang(16), lineHeight: 1.55 }}>
            {selectedId === "live"
              ? "Fills automatically once the first deadline passes."
              : "This plan has no players yet."}
          </span>
        </section>
      ) : (
        <BuilderPitch
          squad={{ structure: state.structure, players: state.players, captain: state.captain, vice: state.vice }}
          scoreOf={xpOf} metricName={metricName(model.gateOpen)} showMetric
          oppOf={oppOf} scale={scale}
          onSlotClick={() => {}}
          onOpenPlayer={(p) => patchWeek({ captain: state.captain === p.fpl_id ? null : p.fpl_id })}
          onSwap={() => {}} />
      )}

      {/* Transfers planned for this gameweek */}
      {!empty && transfers.length > 0 && (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius,
          padding: 16, display: "flex", flexDirection: "column", gap: 9 }}>
          <Label color={T.green}>Transfers in GW{gw}</Label>
          {transfers.map((t, i) => {
            const byId = new Map(core.players.map((p) => [p.fpl_id, p]));
            const out = byId.get(t.out), inn = byId.get(t.in);
            const sold = out ? saleValue(out.price, out.price) : null;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={lang(14, 600)}>{out ? out.web_name : t.out} out{sold !== null ? ` at ${sold.toFixed(1)}` : ""}</span>
                <span style={val(13, "#FFFFFF", 500)}>to</span>
                <span style={lang(14, 700)}>{inn ? inn.web_name : t.in} in at {Number(t.price).toFixed(1)}</span>
                <button onClick={() => {
                  const list = [...transfers]; list.splice(i, 1); patchWeek({ transfers: list });
                }} className="fb-press"
                  style={{ height: 28, padding: "0 11px", borderRadius: 999, background: T.plate, ...lang(13, 700) }}>
                  UNDO
                </button>
              </div>
            );
          })}
        </section>
      )}

      {transferOpen && state && (
        <TransferPicker squad={state.players} pool={core.players} gw={gw}
          bank={PLAN_RULES.budget - state.players.reduce((a, p) => a + Number(p.price || 0), 0)}
          ignores={(shaped && shaped.ignores) || []}
          xpOf={xpOf}
          onClose={() => setTransferOpen(false)}
          onConfirm={(t) => { patchWeek({ transfers: [...transfers, t] }); setTransferOpen(false); }} />
      )}
    </div>
  );
}
