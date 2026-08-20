"use client";
import React from "react";
import { Wand2 } from "lucide-react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { metricName } from "../../lib/solver/score.mjs";
import { T, S, Skeleton, ErrorCard, Label, lang, val, code } from "../../lib/ui";
import { emptySquad } from "../../lib/solver/squad";
import BuilderPitch from "../../components/BuilderPitch";
import { STRUCTURES } from "../../lib/solver/squad";
import Candidates from "../../components/Candidates";
import { squadAt, transferLedger, saleValue, PLAN_RULES } from "../../lib/plan.mjs";
import ChipControls from "../../components/ChipControls";
import ControlShelf from "../../components/ControlShelf";
import Notice, { NoticeButton } from "../../components/Notice";
import ProjectedScoreBreakdown from "../../components/ProjectedScoreBreakdown";
import { projectSquad } from "../../lib/squad-projection.mjs";
import GameweekRange from "../../components/GameweekRange";
import SquadRangeSummary from "../../components/SquadRangeSummary";
import { applyOptimisedRangeToPlan, optimiseSavedPlanRange } from "../../lib/plan-range.mjs";
import { optimiseSquad } from "../../lib/solver/optimise.mjs";

/* THE SQUAD SCREEN.
 *
 * Same pitch and same player list as the Builder, so swapping a player works identically wherever you
 * are. One difference of substance: a plan here is a SETTLED team, not a blank slate. You get one free
 * transfer a gameweek (banking to five) and anything beyond that costs four points, deducted from the
 * xP figure rather than mentioned in a footnote.
 *
 * The old hard-coded Team 4812 source remains available behind SHOW_HARDCODED_SQUAD_4812, but the flag
 * is false so only real saved drafts appear. Changing that single flag restores the read-only slot.
 */
export const SHOW_HARDCODED_SQUAD_4812 = false;

export default function SquadClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const [plans, setPlans] = React.useState(null);
  const [livePlan, setLivePlan] = React.useState(null);
  const [planError, setPlanError] = React.useState(null);
  const [planNotice, setPlanNotice] = React.useState(null);

  const [selectedId, setSelectedId] = React.useState("");
  const [gw, setGw] = React.useState(1);
  /* Which gameweek a chip belongs to, chosen directly. It used to be whichever week the pitch happened to
     be showing, so setting a chip for GW3 meant cycling the pitch to GW3 first and the two ideas were
     tangled together. They are separate now: the pitch shows a week, this picks the chip's week. */
  const [chipGw, setChipGw] = React.useState(1);
  const [gwFrom, setGwFrom] = React.useState(1);
  const [gwTo, setGwTo] = React.useState(1);
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
      const nextPlans = j.plans || [];
      setPlanError(null); setPlans(nextPlans); setLivePlan(j.live || null);
      setSelectedId((current) => {
        if (SHOW_HARDCODED_SQUAD_4812 && current === "live") return current;
        if (nextPlans.some((plan) => String(plan.id) === String(current))) return current;
        const active = nextPlans.find((plan) => plan.is_active);
        if (active) return String(active.id);
        if (nextPlans[0]) return String(nextPlans[0].id);
        return SHOW_HARDCODED_SQUAD_4812 ? "live" : "";
      });
    }).catch(() => { setPlanError("Plans could not be loaded."); setPlans([]); });
  }, []);
  React.useEffect(() => { loadPlans(); }, [loadPlans]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const gwBounds = React.useMemo(() => {
    const gws = core ? (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite) : [];
    return gws.length ? { first: Math.min(...gws), last: Math.max(...gws) } : { first: 1, last: 1 };
  }, [core]);
  const firstGw = gwBounds.first, lastGw = Math.min(8, gwBounds.last);
  React.useEffect(() => {
    setGw(firstGw);
    setChipGw(firstGw);
    setGwFrom(firstGw);
    setGwTo(firstGw);
  }, [firstGw]);

  const selected = SHOW_HARDCODED_SQUAD_4812 && selectedId === "live"
    ? livePlan
    : (plans || []).find((p) => String(p.id) === String(selectedId));

  /* The working copy. Selecting a plan takes a copy; every edit changes the copy. The original draft is
     never touched, which is both what Louis asked for and what stops a bad write damaging it. */
  const [working, setWorking] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    setWorking(selected ? JSON.parse(JSON.stringify({ ...selected, base: selected.base || [], weeks: selected.weeks || {} })) : null);
    setDirty(false); setMenuFor(null); setReplacing(null);
  }, [selectedId, selected && selected.id, selected && selected.updated_at]);
  const shaped = working;
  const readOnly = !working || (SHOW_HARDCODED_SQUAD_4812 && selectedId === "live");

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

    /* SEAT AN ELEVEN IF THE PLAN DOES NOT NAME ONE.
     *
     * A plan written by the agent arrives as fifteen names with no starting flags and no shape, so every
     * player rendered on the bench, the formation showed as "?" and the projection read 0.0. A squad of
     * fifteen always has a best legal eleven, so rather than showing an empty pitch it is worked out
     * here from the same xPTS the rest of the screen uses. Anything the plan does state is respected;
     * this only fills in what is missing. */
    const namedStarters = withStarting.filter((player) => player.starting).length;
    if (namedStarters === 11 || withStarting.length < 11 || !model) {
      return { ...raw, players: withStarting };
    }
    const seated = optimiseSquad({ ...raw, players: withStarting },
      (player) => model.scoreForGw(player, gw) ?? 0);
    if (!seated) return { ...raw, players: withStarting };
    return {
      ...raw,
      structure: seated.structure || raw.structure,
      captain: raw.captain ?? seated.captain,
      vice: raw.vice ?? seated.vice,
      players: seated.players,
      seatedAutomatically: true,
    };
  }, [shaped, core, gw, model]);

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

  const activeChip = state?.chip || null;
  /* The chip shown on the buttons is the one on the chosen chip gameweek, not the one on the pitch week. */
  const chipWeekRow = shaped ? (shaped.weeks?.[chipGw] || shaped.weeks?.[String(chipGw)] || {}) : {};
  const chipOnChosenWeek = chipWeekRow.chip || null;
  const requestedTransferHit = week
    ? Math.max(0, Number(week.made || 0) - Number(week.free || 0)) * PLAN_RULES.hitCost
    : 0;
  const projection = React.useMemo(() => projectSquad({
    players: state?.players || [],
    captain: state?.captain ?? null,
    chip: activeChip,
    transferHit: requestedTransferHit,
    scoreOf: xpOf,
  }), [state, activeChip, requestedTransferHit, xpOf]);
  const rangeProjection = React.useMemo(() => {
    if (!shaped || !core || !model) return null;
    return optimiseSavedPlanRange({
      plan: shaped,
      players: core.players,
      scorer: model,
      gwFrom,
      gwTo,
    });
  }, [shaped, core, model, gwFrom, gwTo]);
  const toggleChip = (chip) => {
    if (readOnly || !shaped) return;
    const target = Number(chipGw);
    if (!Number.isInteger(target) || target < 1 || target > 38) return;
    const weeks = { ...shaped.weeks };
    /* A chip is played once, so selecting it on one week clears it from any other. */
    for (const [key, row] of Object.entries(weeks)) {
      if (chip && Number(key) !== target && row?.chip === chip) weeks[key] = { ...row, chip: null };
    }
    weeks[String(target)] = { ...(weeks[String(target)] || weeks[target] || {}), chip };
    writePlan({ ...shaped, weeks });
  };

  const planAction = async (action, plan) => {
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: plan.id }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "The request failed." }));
    if (!r.ok) { setPlanError(r.error); return; }
    setPlanError(null);
    if (action === "delete" && String(plan.id) === String(selectedId)) setSelectedId("");
    loadPlans();
  };

  // Local only. The original draft is never modified from this screen.
  /* UNDO. Every change to the squad goes through writePlan, so keeping a stack here catches all of them:
     transfers, captaincy, swaps, formation, OPTIMISE. Ten deep, which is more than enough to walk back a
     mistake without holding a whole session in memory. */
  const [undoStack, setUndoStack] = React.useState([]);
  const writePlan = (next) => {
    setUndoStack((prev) => [...prev.slice(-9), working ? JSON.parse(JSON.stringify(working)) : null]
      .filter((x) => x !== null));
    setWorking(next);
    setDirty(true);
  };
  const undo = () => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      setWorking(prev[prev.length - 1]);
      setDirty(true);
      return prev.slice(0, -1);
    });
  };

  /* WHAT MAKES A WEEK SAVEABLE.
   *
   * The API refuses a plan outright if any single week is malformed, and it reports every fault at once,
   * which is how one bad draft produced a wall of red covering GW6 to GW14. Two things go wrong in
   * practice. A key outside "1".."38" is never valid. And a week written against an older fifteen still
   * names players who have since been transferred out, so its eleven no longer matches the squad.
   *
   * Neither is recoverable from the interface, and neither is worth keeping: a lineup for a squad you no
   * longer own says nothing. They are dropped on save so the draft can be written, and the count is
   * reported rather than silently discarded. */
  const saveableWeeks = (weeks, base) => {
    const squadIds = new Set((base || []).map((player) => Number(player.fpl_id)));
    const kept = {};
    let dropped = 0;
    for (const [key, row] of Object.entries(weeks || {})) {
      const gameweek = Number(key);
      if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) { dropped += 1; continue; }

      /* A week that carries no lineup at all is fine: it is a chip or a transfer note and the API does
         not check an XI it was never given. A week that carries a lineup must carry a complete and
         current one. Half a lineup, an empty list, or eleven players you sold last week are all
         rejected by the API, and none of them can be cleared from this screen, which is what left the
         draft unsaveable behind a wall of red. */
      const carriesLineup = row && ("startingIds" in row || "benchOrder" in row
        || "captain" in row || "vice" in row || "structure" in row);
      if (!carriesLineup) { kept[String(gameweek)] = row; continue; }

      const starting = [...new Set((row?.startingIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
      const bench = [...new Set((row?.benchOrder || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
      const complete = starting.length === 11
        && bench.length === 4
        && [...starting, ...bench].every((id) => squadIds.has(id))
        && new Set([...starting, ...bench]).size === squadIds.size
        && starting.includes(Number(row.captain))
        && starting.includes(Number(row.vice));
      if (!complete) { dropped += 1; continue; }
      kept[String(gameweek)] = row;
    }
    return { weeks: kept, dropped };
  };

  /* SAVE, overwriting the draft you are looking at. The API updates in place when it is handed an id and
     creates a new row when it is not; only the second path was ever used, so every edit made another copy. */
  const saveDraft = async () => {
    if (!working || selectedId === "live") return;
    const cleaned = saveableWeeks(working.weeks, working.base);
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save", id: working.id,
        name: working.name, structure: working.structure, captain: working.captain, vice: working.vice,
        base: working.base, weeks: cleaned.weeks,
        ignores: working.ignores || [], maybeIds: working.maybe_ids || [],
      }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "The draft could not be saved." }));
    if (!r.ok) { setPlanError(r.error); return; }
    setPlanError(null);
    setDirty(false);
    if (cleaned.dropped > 0) {
      setWorking((current) => (current ? { ...current, weeks: cleaned.weeks } : current));
      setPlanNotice(`Saved. ${cleaned.dropped} gameweek${cleaned.dropped === 1 ? "" : "s"} described a squad you no longer own and ${cleaned.dropped === 1 ? "was" : "were"} cleared.`);
    } else {
      setPlanNotice(null);
    }
    loadPlans();
  };

  /* Rename the draft on screen, without opening the manage list. */
  const renameDraft = async () => {
    if (!working || selectedId === "live") return;
    const name = window.prompt("Rename this draft", working.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === working.name) return;
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id: working.id, name: trimmed }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "The rename failed." }));
    if (!r.ok) { setPlanError(r.error); return; }
    setPlanError(null); loadPlans();
  };

  const saveAsNewDraft = async () => {
    if (!working) return;
    const cleaned = saveableWeeks(working.weeks, working.base);
    const name = (newName || "").trim() || `${working.name} plan`;
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",                       // sending no identifier creates a new row
        name, structure: working.structure, captain: working.captain, vice: working.vice,
        base: working.base, weeks: cleaned.weeks,
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
    /* Canonical key. A stray one makes the whole draft unsaveable and cannot be cleared from here. */
    const gameweek = Number(gw);
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) return;
    weeks[String(gameweek)] = { ...(weeks[String(gameweek)] || weeks[gameweek] || {}), ...patch };
    writePlan({ ...shaped, weeks });
  };

  /* OPTIMISE THE EXACT RANGE. Each gameweek uses the plan state after that week's transfers, then writes
     formation, XI, bench order, captain and vice in one atomic local update. The base fifteen is unchanged. */
  const doOptimiseRange = () => {
    if (readOnly || !shaped || !rangeProjection?.ok) return;
    /* Hold the week being viewed across the rewrite and put it back afterwards. The handler no longer
       moves it, but rewriting the plan re-runs everything downstream, so this asserts it rather than
       trusting that nothing else does. */
    const viewing = gw;
    writePlan(applyOptimisedRangeToPlan(shaped, rangeProjection));
    setGw(viewing);
    if (typeof window !== "undefined") window.requestAnimationFrame(() => setGw(viewing));
    /* Stay on the gameweek you were looking at. It used to jump back to the first week of the range, so
       the one screen that would show you what changed was the one it took you away from. */
    const weeksDone = (rangeProjection.weekly || []).length;
    const chipWeeks = (rangeProjection.weekly || [])
      .filter((week) => week.chip)
      .map((week) => `${String(week.chip).toUpperCase()} on GW${week.gw}`);
    setPlanNotice(`Optimised GW${gwFrom}-GW${gwTo}: ${weeksDone} gameweek${weeksDone === 1 ? "" : "s"} rewritten, `
      + `${Number(rangeProjection.total?.net_xpts ?? 0).toFixed(1)} xPTS total`
      + `${chipWeeks.length ? `, ${chipWeeks.join(" and ")} included` : ""}.`);
  };

  const changeRange = (from, to) => {
    setGwFrom(from);
    setGwTo(to);
    setGw(from);
    setChipGw((current) => (current < from || current > to ? from : current));
  };


  /* The gameweek control, at pill size, sitting on the pitch under the formation dropdown. It used to be a
     56px-tall row above the pitch, which pushed the squad down the page for something you touch rarely. */
  const gwControl = (
    <span style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(6,0,12,0.82)",
      border: `1px solid ${T.line}`, borderRadius: S.radiusSm, padding: "0 4px", height: S.ctrlSm }}>
      <button onClick={() => setGw((g) => Math.max(gwFrom, g - 1))} disabled={gw <= gwFrom} className="fb-press zeus-pitch-control"
        style={{ width: 22, height: S.tag, borderRadius: 6, background: "transparent", border: "none",
          ...lang(15, 700), opacity: gw <= gwFrom ? 0.35 : 1 }} aria-label="Previous gameweek">‹</button>
      <span style={{ ...val(13), minWidth: 42, textAlign: "center" }}>GW{gw}</span>
      <button onClick={() => setGw((g) => Math.min(gwTo, g + 1))} disabled={gw >= gwTo} className="fb-press zeus-pitch-control"
        style={{ width: 22, height: S.tag, borderRadius: 6, background: "transparent", border: "none",
          ...lang(15, 700), opacity: gw >= gwTo ? 0.35 : 1 }} aria-label="Next gameweek">›</button>
    </span>
  );

  /* The headline figures, as pills under the budget rather than tall boxes above the pitch. */
  const pill = (label, value, tone) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(6,0,12,0.82)",
      border: `1px solid ${T.line}`, borderRadius: S.radiusSm, padding: "0 10px", height: S.ctrlSm }}>
      <span style={{ ...lang(11.5, 700), letterSpacing: "0.06em", opacity: 0.85 }}>{label}</span>
      <span style={val(15, tone)}>{value}</span>
    </span>
  );

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
    return <div data-zeus-ui-version="core-restoration-v3" style={{ display: "flex", flexDirection: "column", gap: S.gap }}><Skeleton h={110} /><Skeleton h={560} /></div>;
  }

  const options = [
    ...(SHOW_HARDCODED_SQUAD_4812
      ? [{ id: "live", label: livePlan && livePlan.entry_id ? `Team ${livePlan.entry_id}` : "Team 4812" }]
      : []),
    ...(plans || []).map((p) => ({ id: String(p.id), label: p.name })),
  ];
  const empty = !state || state.players.length === 0;
  const hit = week ? week.hit : 0;

  // Money available if the selected player is sold: FPL returns half of any rise, so sale value, not price.
  const spend = state ? state.players.reduce((a, p) => a + Number(p.price || 0), 0) : 0;
  const bankNow = PLAN_RULES.budget - spend;
  const spendable = replacing ? bankNow + (saleValue(replacing.price, replacing.price) ?? Number(replacing.price)) : bankNow;

  return (
    <div data-zeus-ui-version="core-restoration-v3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ONE SHELF, TWO DENSE ROWS.
          The team dropdown had a 56px row of its own, the gameweek box a 75px row, the action buttons a
          third and the chips a fourth. They now share two rows and the gameweek sentence is a tooltip. */}
      <ControlShelf ariaLabel="Squad controls">
        <section className="zeus-squad-toolbar" aria-label="Squad actions">
          <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setReplacing(null); }}
            aria-label="Select squad"
            className="zeus-toolbar-select"
            style={{ padding: "0 12px", background: T.card,
              border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(14, 700), outline: "none" }}>
            {options.length === 0 && <option value="" style={{ background: T.card }}>NO SAVED SQUADS</option>}
            {options.map((o) => <option key={o.id} value={o.id} style={{ background: T.card }}>{o.label}</option>)}
          </select>

          {!readOnly && working && selectedId !== "live" && (
            <button onClick={doOptimiseRange} disabled={!rangeProjection?.ok} className="fb-press zeus-toolbar-button"
              data-zeus-feature="squad-optimise-v3"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: rangeProjection?.ok ? T.green : T.card,
                border: `1px solid ${rangeProjection?.ok ? T.green : T.line}`,
                opacity: rangeProjection?.ok ? 1 : 0.45,
                ...lang(13, 700, rangeProjection?.ok ? "#04130A" : "#FFFFFF") }}>
              <Wand2 size={14} /> OPTIMISE GW{gwFrom}{gwTo === gwFrom ? "" : `-GW${gwTo}`}
            </button>
          )}

          {!readOnly && working && (
            <>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder={`${working.name} plan`}
                className="zeus-toolbar-input zeus-plan-name"
                style={{ padding: "0 12px", background: T.card,
                  border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13.5, 600), outline: "none" }} />
              {selectedId !== "live" && (
                <>
                  <button onClick={saveDraft} disabled={!dirty} className="fb-press zeus-toolbar-button"
                    style={{
                      background: dirty ? T.green : T.card,
                      border: `1px solid ${dirty ? T.green : T.line}`,
                      opacity: dirty ? 1 : 0.55,
                      ...lang(13, 700, dirty ? "#04130A" : "#FFFFFF") }}>
                    {dirty ? "SAVE" : "SAVED"}
                  </button>
                  <button onClick={undo} disabled={!undoStack.length} className="fb-press zeus-toolbar-button"
                    style={{ background: T.card,
                      border: `1px solid ${T.line}`, opacity: undoStack.length ? 1 : 0.45,
                      ...lang(13, 700) }}>
                    UNDO
                  </button>
                  <button onClick={renameDraft} className="fb-press zeus-toolbar-button"
                    style={{ background: T.card,
                      border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                    RENAME
                  </button>
                </>
              )}
              <button onClick={() => setManaging((v) => !v)} className="fb-press zeus-toolbar-button"
                style={{ background: T.card,
                  border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                DRAFTS
              </button>
            </>
          )}
        </section>

        {working && (
          <section className="zeus-control-strip" aria-label="Squad settings">
            <GameweekRange from={gwFrom} to={gwTo} min={firstGw} max={lastGw} compact
              onChange={changeRange} showPresets
              description="Each gameweek uses that week's owned 15, planned transfers, chip and transfer cost." />
            {!readOnly && (
              <>
                <label className="zeus-strip-field" title="The gameweek the selected chip is played in.">
                  <span style={code(12)}>CHIP GW</span>
                  <select value={chipGw} onChange={(event) => setChipGw(Number(event.target.value))}
                    aria-label="Chip gameweek" className="zeus-strip-select"
                    style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
                    {Array.from({ length: gwTo - gwFrom + 1 }, (_, index) => gwFrom + index).map((gameweek) => (
                      <option key={gameweek} value={gameweek} style={{ background: T.card }}>GW{gameweek}</option>
                    ))}
                  </select>
                </label>
                <ChipControls compact chip={chipOnChosenWeek} onChange={toggleChip} gw={chipGw} />
              </>
            )}
          </section>
        )}
      </ControlShelf>

      {managing && (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
          display: "flex", flexDirection: "column", gap: 8, maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <Label color={T.cyan}>Drafts</Label>
          {(plans || []).length === 0 && <span style={lang(14, 600)}>None saved.</span>}
          {(plans || []).map((pl) => (
            <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40,
              padding: "0 12px", borderRadius: 10, background: T.row }}>
              <span style={{ ...lang(14, 700), flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pl.name}
              </span>
              <span style={val(13, "#FFFFFF", 500)}>{(pl.base || []).length}/15</span>
              {pl.is_active
                ? (
                  <span style={{ display: "flex", alignItems: "center", height: S.tag, padding: "0 12px",
                    borderRadius: S.radiusSm, background: T.tag, ...lang(13, 700, T.onTag) }}>
                    ACTIVE
                  </span>
                ) : (
                  <button onClick={() => planAction("activate", pl)} className="fb-press"
                    style={{ height: S.ctrlSm, padding: "0 12px", borderRadius: S.radiusSm, background: T.card,
                      border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                    SET ACTIVE
                  </button>
                )}
              <button onClick={() => { setSelectedId(String(pl.id)); setManaging(false); }} className="fb-press"
                style={{ height: S.ctrlSm, padding: "0 12px", borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                OPEN
              </button>
              <button onClick={async () => {
                  const name = window.prompt("Rename this draft", pl.name);
                  if (name === null) return;
                  const trimmed = name.trim();
                  if (!trimmed || trimmed === pl.name) return;
                  const r = await fetch("/api/plans", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "rename", id: pl.id, name: trimmed }),
                  }).then((x) => x.json()).catch(() => ({ ok: false, error: "The rename failed." }));
                  if (!r.ok) { setPlanError(r.error); return; }
                  setPlanError(null); loadPlans();
                }} className="fb-press"
                style={{ height: S.ctrlSm, padding: "0 12px", borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                RENAME
              </button>
              <button onClick={() => planAction("delete", pl)} className="fb-press"
                style={{ height: S.ctrlSm, padding: "0 12px", borderRadius: S.radiusSm, background: "#3A0217", ...lang(13, 700, T.pink) }}>
                DELETE
              </button>
            </div>
          ))}
        </section>
      )}

      {/* An incomplete draft is a normal working state, not a fault, so it no longer gets a red panel. */}
      {!readOnly && state && state.players.length > 0 && state.players.length < PLAN_RULES.squadSize && (
        <Notice label="Draft is incomplete">
          {state.players.length} of {PLAN_RULES.squadSize} picked. Fill the empty slots from the list below, then save as a new draft.
        </Notice>
      )}

      {replacing && (
        <Notice tone="active" label="Swap in progress"
          action={<NoticeButton onClick={() => setReplacing(null)} label="Cancel the swap">CANCEL</NoticeButton>}>
          Swapping {replacing.web_name}. Pick an outlined player, an empty slot, or anyone from the list below.
        </Notice>
      )}

      {state?.seatedAutomatically && !readOnly && (
        <Notice label="Eleven chosen for you">
          This draft arrived without a starting eleven, so the best legal one for GW{gw} is shown. Save to keep it.
        </Notice>
      )}
      {planNotice && (
        <Notice label="Draft saved" onDismiss={() => setPlanNotice(null)}>{planNotice}</Notice>
      )}
      {planError && <span style={{ ...lang(14, 600, T.pink), lineHeight: 1.5, textAlign: "center" }}>{planError}</span>}

      {state && state.players.length > 0 && (
        <ProjectedScoreBreakdown breakdown={projection} metric={metricName(model.gateOpen)} />
      )}
      {working && (
        <SquadRangeSummary result={rangeProjection} metric={metricName(model.gateOpen)} />
      )}

      <div style={{ maxWidth: 1040, width: "100%", margin: "0 auto" }}>
          <BuilderPitch fill readOnly={readOnly} structures={STRUCTURES}
            captainMultiplier={projection.captainMultiplier}
            underShape={gwControl}
            cornerPills={
              <>
                {pill(metricName(model.gateOpen), projection.netXpts.toFixed(1), T.xp)}
                {!readOnly && projection.transferHit > 0 && pill("TRANSFER COST", `-${projection.transferHit.toFixed(0)}`, T.pink)}
                {!readOnly && pill("FREE", `${week ? week.free : PLAN_RULES.freePerGw} · ${transfers.length} MADE`, "#FFFFFF")}
              </>
            }
            onStructure={readOnly ? null : (key) => writePlan({ ...shaped, structure: key })}
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
                ...lang(14.5, 700, state.captain === menuFor.fpl_id ? "#FFFFFF" : T.onTag),
                opacity: state.captain === menuFor.fpl_id ? 0.5 : 1 }}>
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
                ...lang(14.5, 700, menuFor.starting ? "#FFFFFF" : "#04130A") }}>
              SWAP
            </button>
            <a href={`/player/${menuFor.fpl_id}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: S.ctrl,
                padding: "0 16px", borderRadius: S.radiusSm, background: T.plate, textDecoration: "none",
                ...lang(13.5, 700) }}>
              PLAYER PAGE
            </a>
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
            const paid = !week?.unlimited && i >= (week ? week.free : 0);
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
            scoreOf={xpOf} bandOf={model.bandOf} gateOpen={model.gateOpen}
            onAdd={completeTransfer} max={Math.max(6, projection.grossXpts / 8)}
            oppOf={oppOf} scale={scale} xpOf={xpOf} run5Of={run5Of}
                    clubs={core ? Object.values(core.teamById).sort((a,b)=>(a.name||"").localeCompare(b.name||"")) : []} />
        </div>
      )}
    </div>
  );
}
