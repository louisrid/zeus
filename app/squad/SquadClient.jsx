"use client";
import React from "react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { metricName } from "../../lib/solver/score.mjs";
import { T, S, Skeleton, ErrorCard, Label, lang, val } from "../../lib/ui";
import { emptySquad } from "../../lib/solver/squad";
import BuilderPitch from "../../components/BuilderPitch";
import { XpBox, FreeTransferBox } from "../../components/HeadlineBoxes";
import { STRUCTURES } from "../../lib/solver/squad";
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
  const [menuFor, setMenuFor] = React.useState(null);
  const [newName, setNewName] = React.useState("");
  const [managing, setManaging] = React.useState(false);  // the player whose actions are open
  // The player being replaced. His replacement may be an outlined squad member or anyone from the list.
  const [replacing, setReplacing] = React.useState(null);

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

  /* The working copy. Selecting a plan takes a copy; every edit changes the copy. The original draft is
     never touched, which is both what Louis asked for and what stops a bad write damaging it. */
  const [working, setWorking] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    setWorking(selected ? JSON.parse(JSON.stringify({ ...selected, base: selected.base || [], weeks: selected.weeks || {} })) : null);
    setDirty(false); setMenuFor(null); setReplacing(null);
  }, [selectedId, selected && selected.id, selected && selected.updated_at]);
  const shaped = working;
  const readOnly = selectedId === "live";

  /* Hydrate from the live player list: a stored plan row carries an id and little else. */
  const state = React.useMemo(() => {
    if (!shaped || !core) return null;
    const raw = squadAt(shaped, gw);
    const byId = new Map(core.players.map((p) => [p.fpl_id, p]));
    const players = raw.players
      .map((r) => { const live = byId.get(r.fpl_id); return live ? { ...live, starting: Boolean(r.starting) } : null; })
      .filter(Boolean);
    const startingIds = (shaped.weeks[gw] || {}).startingIds;
    const withStarting = startingIds
      ? players.map((p) => ({ ...p, starting: startingIds.includes(p.fpl_id) }))
      : players;
    return { ...raw, players: withStarting };
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

  const planAction = async (action, plan) => {
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: plan.id }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "The request failed." }));
    if (!r.ok) { setPlanError(r.error); return; }
    setPlanError(null);
    if (action === "delete" && String(plan.id) === String(selectedId)) setSelectedId("live");
    loadPlans();
  };

  // Local only. The original draft is never modified from this screen.
  const writePlan = (next) => { setWorking(next); setDirty(true); };

  const saveAsNewDraft = async () => {
    if (!working) return;
    const name = (newName || "").trim() || `${working.name} plan`;
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",                       // sending no identifier creates a new row
        name, structure: working.structure, captain: working.captain, vice: working.vice,
        base: working.base, weeks: working.weeks,
        ignores: working.ignores || [], maybeIds: working.maybe_ids || [],
      }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "The draft could not be saved." }));
    if (!r.ok) { setPlanError(r.error); return; }
    setPlanError(null); setNewName(""); setDirty(false);
    loadPlans();
    if (r.id) setSelectedId(String(r.id));
  };

  const patchWeek = (patch) => {
    if (!shaped) return;
    const weeks = { ...shaped.weeks };
    weeks[gw] = { ...(weeks[gw] || {}), ...patch };
    writePlan({ ...shaped, weeks });
  };

  const transfers = shaped ? ((shaped.weeks[gw] || {}).transfers || []) : [];

  /* Bench and start, stored as a starting-eleven list for this gameweek. Same-position exchange only,
     so the eleven always stays legal and nobody can be lost the way a dropped drag could lose them. */
  /* A swap is an exchange between two named players, chosen by clicking. Identical to the Builder. */
  const swapPair = (a, b) => {
    if (!state || readOnly) return;
    const startingIds = state.players
      .filter((x) => (x.fpl_id === a.fpl_id ? !a.starting : x.fpl_id === b.fpl_id ? !b.starting : x.starting))
      .map((x) => x.fpl_id);
    patchWeek({ startingIds });
  };
  const partnersFor = (p) => (state
    ? state.players.filter((x) => x.position === p.position && Boolean(x.starting) !== Boolean(p.starting))
    : []);

  const addToSquad = (incoming) => {
    if (readOnly || !working) return;
    const base = [...(working.base || []), {
      fpl_id: incoming.fpl_id, position: incoming.position, team_id: incoming.team_id,
      price: Number(incoming.price), purchasePrice: Number(incoming.price), starting: true,
    }];
    writePlan({ ...working, base });
  };

  const completeTransfer = (incoming) => {
    // No outgoing player means an empty slot is being filled, which is free.
    if (!replacing) return addToSquad(incoming);
    if (readOnly) return;
    patchWeek({ transfers: [...transfers, {
      out: replacing.fpl_id, in: incoming.fpl_id,
      position: incoming.position, team_id: incoming.team_id, price: Number(incoming.price),
    }] });
    setReplacing(null);
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
  const spendable = replacing ? bankNow + (saleValue(replacing.price, replacing.price) ?? Number(replacing.price)) : bankNow;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      {/* Team selector and gameweek arrows */}
      <section style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        flexWrap: "wrap", maxWidth: 1040, width: "100%", margin: "0 auto" }}>
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setReplacing(null); }}
          style={{ height: 56, padding: "0 20px", borderRadius: 14, background: T.card,
            border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(19, 700), outline: "none", minWidth: 320 }}>
          {options.map((o) => <option key={o.id} value={o.id} style={{ background: T.card }}>{o.label}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setGw((g) => Math.max(firstGw, g - 1))} disabled={gw <= firstGw} className="fb-press"
            style={{ width: 44, height: 44, borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`,
              ...lang(18, 700), opacity: gw <= firstGw ? 0.4 : 1 }} aria-label="Previous gameweek">‹</button>
          <span style={{ ...val(18), minWidth: 78, textAlign: "center" }}>GW{gw}</span>
          <button onClick={() => setGw((g) => Math.min(lastGw, g + 1))} disabled={gw >= lastGw} className="fb-press"
            style={{ width: 44, height: 44, borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`,
              ...lang(18, 700), opacity: gw >= lastGw ? 0.4 : 1 }} aria-label="Next gameweek">›</button>
        </div>
      </section>

      {/* Save the working copy, and manage drafts */}
      {!readOnly && working && (
        <section style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          flexWrap: "wrap", maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder={`${working.name} plan`}
            style={{ height: 44, padding: "0 14px", borderRadius: 12, background: T.card,
              border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(14.5, 600), outline: "none", minWidth: 220 }} />
          <button onClick={saveAsNewDraft} className="fb-press"
            style={{ height: 44, padding: "0 20px", borderRadius: S.radiusSm, background: dirty ? T.green : T.card,
              border: dirty ? "none" : `1px solid ${T.line}`, ...lang(14, 700, dirty ? "#04130A" : "#FFFFFF") }}>
            SAVE AS NEW DRAFT
          </button>
          {dirty && <span style={{ ...lang(13.5, 600, T.cyan) }}>Unsaved. The original is untouched.</span>}
          <button onClick={() => setManaging((v) => !v)} className="fb-press"
            style={{ height: 44, padding: "0 16px", borderRadius: S.radiusSm, background: T.card,
              border: `1px solid ${T.line}`, ...lang(14, 700) }}>
            MANAGE DRAFTS
          </button>
        </section>
      )}

      {managing && (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
          display: "flex", flexDirection: "column", gap: 8, maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <Label color={T.cyan}>Drafts</Label>
          {(plans || []).length === 0 && <span style={lang(14, 600)}>None saved.</span>}
          {(plans || []).map((pl) => (
            <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 10, height: 42,
              padding: "0 12px", borderRadius: 10, background: T.row }}>
              <span style={{ ...lang(14, 700), flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pl.name}
              </span>
              <span style={val(13, "#FFFFFF", 500)}>{(pl.base || []).length}/15</span>
              <button onClick={() => { setSelectedId(String(pl.id)); setManaging(false); }} className="fb-press"
                style={{ height: 30, padding: "0 12px", borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                OPEN
              </button>
              <button onClick={() => planAction("delete", pl)} className="fb-press"
                style={{ height: 30, padding: "0 12px", borderRadius: S.radiusSm, background: "#3A0217", ...lang(13, 700, T.pink) }}>
                DELETE
              </button>
            </div>
          ))}
        </section>
      )}

      {!readOnly && state && state.players.length > 0 && state.players.length < PLAN_RULES.squadSize && (
        <section style={{ background: "#2A0410", border: `1px solid ${T.pink}`, borderRadius: S.radius,
          padding: 14, maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <span style={{ ...lang(14, 600), lineHeight: 1.5 }}>
            This draft holds {state.players.length} players, not {PLAN_RULES.squadSize}. Fill the empty
            slots from the list below, then save it as a new draft.
          </span>
        </section>
      )}

      {replacing && (
        <section style={{ background: T.card, border: `1px solid ${T.cyan}`, borderRadius: S.radius, padding: 14,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <span style={{ ...lang(14.5, 700) }}>
            Pick who replaces {replacing.web_name}: an outlined player from your squad, or anyone in the list below.
          </span>
          <button onClick={() => setReplacing(null)} className="fb-press"
            style={{ height: 34, padding: "0 14px", borderRadius: S.radiusSm, background: T.plate, ...lang(13.5, 700), marginLeft: "auto" }}>
            CANCEL
          </button>
        </section>
      )}

      {planError && <span style={{ ...lang(14, 600, T.pink), lineHeight: 1.5, textAlign: "center" }}>{planError}</span>}

      <div style={{ maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <XpBox label={metricName(model.gateOpen)} gross={grossXp} hit={readOnly ? 0 : hit} />
            {!readOnly && <FreeTransferBox free={week ? week.free : PLAN_RULES.freePerGw}
              made={transfers.length} hitCost={PLAN_RULES.hitCost} />}
          </div>
          <BuilderPitch fill structures={STRUCTURES}
            squad={empty
              ? emptySquad((shaped && shaped.structure) || "3-5-2")
              : { structure: state.structure, players: state.players, captain: state.captain, vice: state.vice }}
            scoreOf={xpOf} metricName={metricName(model.gateOpen)} showMetric={!empty}
            oppOf={oppOf} scale={scale}
            activeSlot={replacing ? replacing.position : null}
            onSlotClick={() => {}}
            onOpenPlayer={(p) => {
              if (readOnly) return;
              if (!replacing) return setMenuFor(p);
              if (p.fpl_id === replacing.fpl_id) return setReplacing(null);
              if (p.position !== replacing.position || Boolean(p.starting) === Boolean(replacing.starting)) return;
              swapPair(replacing, p); setReplacing(null);
            }}
            selectedId={replacing ? replacing.fpl_id : (menuFor ? menuFor.fpl_id : null)}
            swapTargets={replacing ? partnersFor(replacing).map((x) => x.fpl_id) : []}
            />
          {readOnly && (
            <span style={{ ...lang(13.5, 600), display: "block", textAlign: "center", marginTop: 10 }}>
              Read-only. Syncs from the official API at the first deadline.
            </span>
          )}
      </div>

      {/* Player actions, mirroring the Builder's menu */}
      {menuFor && !readOnly && (
        <div onClick={() => setMenuFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(4,0,10,0.72)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 40, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20,
              width: 420, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={lang(19, 700)}>{menuFor.web_name}</span>
              <button onClick={() => setMenuFor(null)} className="fb-press"
                style={{ height: 32, padding: "0 12px", borderRadius: S.radiusSm, background: T.plate, ...lang(13.5, 700) }}>
                CLOSE
              </button>
            </div>

            <button onClick={() => { patchWeek({ captain: menuFor.fpl_id, vice: state.vice === menuFor.fpl_id ? null : state.vice }); setMenuFor(null); }}
              className="fb-press" disabled={state.captain === menuFor.fpl_id}
              style={{ height: S.btn, borderRadius: S.radiusSm, background: state.captain === menuFor.fpl_id ? T.plate : T.tag,
                ...lang(14.5, 700), opacity: state.captain === menuFor.fpl_id ? 0.5 : 1 }}>
              {state.captain === menuFor.fpl_id ? "IS CAPTAIN" : "MAKE CAPTAIN"}
            </button>

            <button onClick={() => { patchWeek({ vice: menuFor.fpl_id, captain: state.captain === menuFor.fpl_id ? null : state.captain }); setMenuFor(null); }}
              className="fb-press" disabled={state.vice === menuFor.fpl_id}
              style={{ height: S.btn, borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`,
                ...lang(14.5, 700), opacity: state.vice === menuFor.fpl_id ? 0.5 : 1 }}>
              {state.vice === menuFor.fpl_id ? "IS VICE" : "MAKE VICE"}
            </button>

                <button onClick={() => { setReplacing(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm, background: menuFor.starting ? T.card : T.green,
            border: menuFor.starting ? `1px solid ${T.line}` : "none",
            ...lang(14.5, 700, menuFor.starting ? "#FFFFFF" : "#04130A"),
            opacity: partners.length ? 1 : 0.45 }}>
              REPLACE HIM
            </button>
          </div>
        </div>
      )}

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
                  borderRadius: S.radiusSm, background: "#3A0217", ...val(13, T.pink, 500) }}>-{PLAN_RULES.hitCost}</span>}
                <button onClick={() => { const list = [...transfers]; list.splice(i, 1); patchWeek({ transfers: list }); }}
                  className="fb-press" style={{ height: 28, padding: "0 11px", borderRadius: S.radiusSm, background: T.plate, ...lang(13, 700) }}>
                  UNDO
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* The same player list the Builder uses, at the bottom */}
      {!readOnly && working && (
        <div style={{ maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          {replacing
            ? <span style={{ ...lang(14, 600), display: "block", marginBottom: 10 }}>
                Replacing {replacing.web_name}. He sells for {(saleValue(replacing.price, replacing.price) ?? Number(replacing.price)).toFixed(1)},
                so you can spend {spendable.toFixed(1)}.
              </span>
            : <span style={{ ...lang(14, 600), display: "block", marginBottom: 10 }}>
                {state && state.players.length < PLAN_RULES.squadSize
                  ? "Add a player to fill an empty slot, or click one on the pitch to replace him."
                  : "Click a player on the pitch to replace him."}
              </span>}
          <Candidates pos={replacing ? replacing.position : "ALL"} pool={core.players}
            squad={{ structure: (state && state.structure) || "3-5-2",
              players: state ? (replacing ? state.players.filter((p) => p.fpl_id !== replacing.fpl_id) : state.players) : [],
              captain: state && state.captain, vice: state && state.vice }}
            scoreOf={model.scoreOf} bandOf={model.bandOf} gateOpen={model.gateOpen}
            onAdd={completeTransfer} max={Math.max(6, grossXp / 8)}
            oppOf={oppOf} scale={scale} xpOf={xpOf} run5Of={run5Of} />
        </div>
      )}
    </div>
  );
}
