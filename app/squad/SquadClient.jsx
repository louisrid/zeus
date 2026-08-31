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
import { squadAt, transferLedger, saleValue, squadMoney, PLAN_RULES } from "../../lib/plan.mjs";
import ChipControls from "../../components/ChipControls";
import ControlShelf from "../../components/ControlShelf";
import Notice, { NoticeButton } from "../../components/Notice";
import ProjectedScoreBreakdown from "../../components/ProjectedScoreBreakdown";
import { projectSquad } from "../../lib/squad-projection.mjs";
import GameweekRange from "../../components/GameweekRange";
import SquadRangeSummary from "../../components/SquadRangeSummary";
import { applyOptimisedRangeToPlan, optimiseSavedPlanRange } from "../../lib/plan-range.mjs";
import { optimiseSquad } from "../../lib/solver/optimise.mjs";
import { EXTERNAL_XPTS_GW_TO } from "../../lib/external_xpts.mjs";

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
  const [connecting, setConnecting] = React.useState(false);
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
  /* Escape cancels a swap. Selecting a player then changing your mind had no keyboard way out, and on a
   * long page the only cancel control could be scrolled well off screen. */
  React.useEffect(() => {
    if (!replacing || typeof window === "undefined") return undefined;
    const onKey = (event) => { if (event.key === "Escape") setReplacing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replacing]);

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
        if (current === "live") return current;
        if (nextPlans.some((plan) => String(plan.id) === String(current))) return current;
        const active = nextPlans.find((plan) => plan.is_active);
        if (active) return String(active.id);
        if (nextPlans[0]) return String(nextPlans[0].id);
        if (j.live && Array.isArray(j.live.base) && j.live.base.length > 0) return "live";
        return "";
      });
    }).catch(() => { setPlanError("Plans could not be loaded."); setPlans([]); });
  }, []);
  React.useEffect(() => { loadPlans(); }, [loadPlans]);

  /* CONNECTING THE REAL TEAM.
   *
   * The route that does this has existed for a while and nothing on the site ever called it, so the
   * only way to fill the live slot was a hand-written request. That is not a feature, it is a secret.
   * The team ID is already stored against the live row, so the usual case is one press and no typing.
   * It is read-only against the official API and writes only the live slot, never a saved draft. */
  const connectTeam = async () => {
    const stored = livePlan && livePlan.entry_id ? String(livePlan.entry_id) : "";
    const entered = stored || (typeof window === "undefined" ? "" : window.prompt(
      "Your FPL team ID. It is the number in your team's URL on the official site.", ""));
    const entryId = Number(String(entered || "").trim());
    if (!Number.isFinite(entryId) || entryId <= 0) return;
    setConnecting(true);
    setPlanNotice(null);
    try {
      const response = await fetch("/api/entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const body = await response.json();
      if (!body.ok) { setPlanError(body.error || "The team could not be read."); return; }
      if (body.liveSquadWritten) {
        setPlanNotice(`${body.entry.name} loaded, ${body.liveSquadWritten} players. Pick it from the list above.`);
        loadPlans();
      } else {
        setPlanError(body.liveSquadProblem || "The team was read but no squad could be written.");
      }
    } catch {
      setPlanError("The official API could not be reached.");
    } finally {
      setConnecting(false);
    }
  };


  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const gwBounds = React.useMemo(() => {
    const gws = core ? (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite) : [];
    return gws.length ? { first: Math.min(...gws), last: Math.max(...gws) } : { first: 1, last: 1 };
  }, [core]);
  const firstGw = gwBounds.first, lastGw = Math.min(EXTERNAL_XPTS_GW_TO, gwBounds.last);

  /* THE RANGE YOU LAST CHOSE.
   *
   * This used to overwrite the range with firstGw..firstGw+4 every time the fixture bounds resolved,
   * which is every load. Setting GW3-5 and coming back to GW2-6 was not a default being applied once,
   * it was the choice being thrown away. The last range is remembered and reapplied; the five-week
   * default only fills in when there is nothing stored yet. Anything outside the served horizon is
   * clamped rather than restored, so a remembered range cannot outlive the data behind it. */
  const RANGE_KEY = "zeus.squad.range";
  const readStoredRange = () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(RANGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const from = Number(parsed?.from);
      const to = Number(parsed?.to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
      return { from, to };
    } catch { return null; }
  };
  const [rangeRestored, setRangeRestored] = React.useState(false);
  /* Nothing may be restored or saved until the fixtures are in. Before they load, gwBounds falls back to
   * 1..1, so an early run clamped the remembered range down to a single gameweek, marked itself done, and
   * then wrote that back over the stored value. The choice was destroyed on load rather than restored. */
  const boundsReady = Boolean(core) && Number.isFinite(firstGw) && Number.isFinite(lastGw) && lastGw > firstGw;
  React.useEffect(() => {
    if (rangeRestored || !boundsReady) return;
    const stored = readStoredRange();
    const from = stored ? Math.min(Math.max(stored.from, firstGw), lastGw) : firstGw;
    const to = stored ? Math.min(Math.max(stored.to, from), lastGw) : Math.min(lastGw, firstGw + 4);
    setGw(from);
    setChipGw(from);
    setGwFrom(from);
    setGwTo(to);
    setRangeRestored(true);
  }, [firstGw, lastGw, rangeRestored, boundsReady]);
  React.useEffect(() => {
    if (!rangeRestored || !boundsReady || typeof window === "undefined") return;
    try { window.localStorage.setItem(RANGE_KEY, JSON.stringify({ from: gwFrom, to: gwTo })); }
    catch { /* a full or blocked store must never break the page */ }
  }, [gwFrom, gwTo, rangeRestored]);

  const selected = selectedId === "live"
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
  /* The live team mirrors what is actually entered on the official site, so it is read here rather
     than edited. Editing it here would put the two out of step with no way to tell which is right. */
  const readOnly = !working || selectedId === "live";

  /* Hydrate from the live player list: a stored plan row carries an id and little else. */
  const state = React.useMemo(() => {
    if (!shaped || !core) return null;
    const raw = squadAt(shaped, gw);
    const byId = new Map(core.players.map((p) => [p.fpl_id, p]));
    const players = raw.players
      /* purchasePrice comes across from the plan. Without it every money calculation on this page has
         to assume the squad still costs what it did on the day it was built, which stops being true
         the first night prices move. */
      .map((r) => { const live = byId.get(r.fpl_id); return live ? { ...live, starting: Boolean(r.starting),
        purchasePrice: Number(r.purchasePrice ?? r.price ?? live.price) } : null; })
      .filter(Boolean);
    const startingIds = (shaped.weeks[gw] || {}).startingIds;
    /* Starters are rendered in the order the week names them, so rewriting that list is what moves a
       player along his row. Without this the pitch always fell back to squad order and ORDER FIX would
       have changed the stored plan while the pitch stayed exactly as it was. */
    const withStarting = startingIds
      ? [...players]
        .map((p) => ({ ...p, starting: startingIds.includes(p.fpl_id) }))
        .sort((a, b) => {
          const rank = (player) => {
            const at = startingIds.indexOf(player.fpl_id);
            return at < 0 ? 999 : at;
          };
          return rank(a) - rank(b);
        })
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

  /* SEAT ONCE, THEN LEAVE IT ALONE.
   *
   * The seating above is a display fallback: it works out an eleven when the week does not name one. On
   * its own that recomputes on every render, so a manual substitution was replaced by the solver's pick
   * the moment anything re-rendered, and the eleven appeared to keep re-optimising itself.
   *
   * This writes that eleven into the week the first time it is needed. From then on the week names an
   * eleven, the fallback stops running, and every later change is the user's own and is kept. */
  const seededWeeks = React.useRef(new Set());
  React.useEffect(() => {
    if (readOnly || !state?.seatedAutomatically || !shaped) return;
    const key = `${shaped.id || selectedId}:${gw}`;
    if (seededWeeks.current.has(key)) return;
    seededWeeks.current.add(key);
    const startingIds = state.players.filter((player) => player.starting).map((player) => player.fpl_id);
    if (startingIds.length !== 11) return;
    const benchOrder = state.players.filter((player) => !player.starting).map((player) => player.fpl_id);
    patchWeek({ startingIds, benchOrder, structure: state.structure, captain: state.captain, vice: state.vice });
  }, [state, shaped, gw, readOnly, selectedId]);

  const oppOf = React.useCallback((p) => {
    if (!core) return null;
    return nextFixtures(core.fixtures, core.teamById, p.team_id, 14).find((f) => f.gw === gw) || null;
  }, [core, gw]);
  const xpOf = React.useCallback((p) => (model ? model.scoreForGw(p, gw) : null), [model, gw]);

  /* THE RANGE THE PICKER JUDGES BY.
   *
   * The candidate list scored everyone on the single gameweek being viewed, so a transfer had to be
   * judged on one fixture even when the plan spans several. It carries its own range, seeded from the
   * plan's, so widening it here does not move the pitch you are looking at. xPTS in the list is then
   * the sum across that range, which is the number a transfer decision actually turns on. */
  const [candFrom, setCandFrom] = React.useState(gwFrom);
  const [candTo, setCandTo] = React.useState(gwTo);
  React.useEffect(() => { setCandFrom(gwFrom); setCandTo(gwTo); }, [gwFrom, gwTo]);
  const xpOverCandRange = React.useCallback((p) => {
    if (!model) return null;
    let total = null;
    for (let g = Math.min(candFrom, candTo); g <= Math.max(candFrom, candTo); g += 1) {
      const value = model.scoreForGw(p, g);
      if (value === null || value === undefined) continue;
      total = (total ?? 0) + Number(value);
    }
    return total;
  }, [model, candFrom, candTo]);
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
  const saveableWeeks = (weeks, base, plan = null) => {
    const kept = {};
    let dropped = 0;
    const allWeeks = weeks || {};
    for (const [key, row] of Object.entries(allWeeks)) {
      const gameweek = Number(key);
      if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) { dropped += 1; continue; }

      /* THE SQUAD THIS WEEK, NOT THE SQUAD IN GAMEWEEK ONE.
       *
       * Every lineup used to be checked against `base`, which is the fifteen the plan starts with. Make a
       * transfer at GW3 and every later week still names the player you sold, so the API refused the whole
       * payload: "GW4 starters outside current squad". The squad has to be taken as at that gameweek.
       *
       * The seat also belongs to the slot, not the man, so a sold player's place passes to whoever
       * replaced him rather than being treated as an error. */
      const asAt = plan
        ? squadAt({ ...plan, weeks: allWeeks }, gameweek)
        : { players: base || [] };
      const squadIds = new Set((asAt.players || []).map((player) => Number(player.fpl_id)));

      const replacedBy = new Map();
      for (const [otherKey, otherRow] of Object.entries(allWeeks)) {
        if (Number(otherKey) > gameweek) continue;
        for (const move of (otherRow?.transfers || [])) {
          const out = Number(move?.out);
          const into = Number(move?.in);
          if (Number.isFinite(out) && Number.isFinite(into)) replacedBy.set(out, into);
        }
      }
      const carry = (id) => {
        let current = Number(id);
        for (let hop = 0; hop < 15 && !squadIds.has(current) && replacedBy.has(current); hop += 1) {
          current = replacedBy.get(current);
        }
        return current;
      };

      const namesAnEleven = Array.isArray(row?.startingIds) && row.startingIds.length > 0;
      if (!namesAnEleven) { kept[String(gameweek)] = row; continue; }

      const starting = [...new Set((row?.startingIds || []).map(carry).filter((id) => Number.isInteger(id) && id > 0))];
      const bench = [...new Set((row?.benchOrder || []).map(carry).filter((id) => Number.isInteger(id) && id > 0))];
      /* The armband is repaired before the eleven is judged, not after. A captain who has been benched or
       * sold is a fixable detail, and failing the whole week over it threw away the swap that caused it. */
      let captain = carry(row.captain);
      let vice = carry(row.vice);
      if (!starting.includes(Number(captain))) captain = starting[0] ?? null;
      if (!starting.includes(Number(vice)) || Number(vice) === Number(captain)) {
        vice = starting.find((id) => Number(id) !== Number(captain)) ?? null;
      }

      const elevenIsValid = starting.length === 11
        && starting.every((id) => squadIds.has(id))
        && starting.includes(Number(captain))
        && starting.includes(Number(vice));
      /* A week that still cannot describe a legal eleven loses its LINEUP, never its transfers, chip or
       * formation. Deleting the whole week threw away the very transfer that invalidated the lineup, so a
       * save could silently undo the change being saved. The lineup is derivable; the transfer is not. */
      if (!elevenIsValid) {
        const { startingIds: _ids, benchOrder: _bench, ...rest } = row || {};
        kept[String(gameweek)] = rest;
        dropped += 1;
        continue;
      }

      const withSeats = { ...row, startingIds: starting, captain, vice };
      /* THE FORMATION AND THE ARMBAND MUST MATCH THE ELEVEN THEY SIT WITH.
       *
       * A week only ever stored a structure. Swap a midfielder for a forward and the eleven changed while
       * the structure did not, so the API answered "GW3 structure is 3-5-2, expected 3-4-3" and rejected
       * the save. Captain and vice were never written into the week either, so it also complained they
       * were not starting. All three are derivable from the eleven, so they are derived here rather than
       * left for the manager to reconcile by hand. */
      const positionOf = new Map((asAt.players || []).map((player) => [Number(player.fpl_id), player.position]));
      const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const id of starting) {
        const spot = positionOf.get(Number(id));
        if (counts[spot] !== undefined) counts[spot] += 1;
      }
      const legal = counts.GKP === 1
        && counts.DEF >= 3 && counts.DEF <= 5
        && counts.MID >= 2 && counts.MID <= 5
        && counts.FWD >= 1 && counts.FWD <= 3;
      if (legal) withSeats.structure = `${counts.DEF}-${counts.MID}-${counts.FWD}`;
      const benchIsValid = bench.length === 4
        && bench.every((id) => squadIds.has(id))
        && new Set([...starting, ...bench]).size === squadIds.size;
      if (benchIsValid) { kept[String(gameweek)] = { ...withSeats, benchOrder: bench }; continue; }

      const rebuilt = [...squadIds].filter((id) => !starting.includes(id));
      if (rebuilt.length !== 4) {
        const { startingIds: _ids2, benchOrder: _bench2, ...rest } = row || {};
        kept[String(gameweek)] = rest;
        dropped += 1;
        continue;
      }
      /* Whatever order the week did state is honoured; anyone it left out is appended. */
      const ordered = [...bench.filter((id) => rebuilt.includes(id)), ...rebuilt.filter((id) => !bench.includes(id))];
      kept[String(gameweek)] = { ...withSeats, benchOrder: ordered };
    }
    return { weeks: kept, dropped };
  };

  /* SAVE, overwriting the draft you are looking at. The API updates in place when it is handed an id and
     creates a new row when it is not; only the second path was ever used, so every edit made another copy. */
  const saveDraft = async () => {
    if (!working || selectedId === "live") return;
    const cleaned = saveableWeeks(working.weeks, working.base, working);
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
    const cleaned = saveableWeeks(working.weeks, working.base, working);
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

  /* THE WEEK-BY-WEEK TABLE.
   *
   * The same shape the agent produces in chat: every player, their price, their projected points for
   * each gameweek in the range, and their total, with the captain, vice and bench positions marked
   * against the week they apply to. Built from the optimised range, so it says what the plan actually
   * does rather than what the pitch happens to be showing.
   *
   * Markers: C captain, V vice, Bn bench position n, BGK a benched goalkeeper. */
  const buildRangeTable = () => {
    if (!state || !model || !rangeProjection?.ok) return null;
    const weeks = (rangeProjection.weekly || []).map((week) => Number(week.gw));
    if (!weeks.length) return null;

    /* WHAT THE TABLE DESCRIBES.
     *
     * The plan as it stands, not the optimiser's suggestion. It used to read straight from the range
     * projection, so a manual substitution never appeared: you saved a change, exported, and got the
     * optimiser's eleven back. Where the week names its own line-up that is what is used, and the
     * projection is only the fallback for a week that names nothing. */
    const asPlanned = (week) => {
      const stored = shaped?.weeks?.[String(week.gw)] || shaped?.weeks?.[week.gw];
      if (!stored?.startingIds?.length) return week;
      return {
        ...week,
        starting_ids: stored.startingIds,
        bench_order: stored.benchOrder || week.bench_order || week.benchOrder || [],
        captain: stored.captain ?? week.captain,
        vice_captain: stored.vice ?? week.vice_captain ?? week.vice,
        structure: stored.structure || week.structure,
        chip: stored.chip ?? week.chip,
      };
    };
    const plannedWeeks = (rangeProjection.weekly || []).map(asPlanned);
    const players = [...(state.players || [])].sort((a, b) => {
      const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
      return (order[a.position] ?? 9) - (order[b.position] ?? 9) || Number(b.price) - Number(a.price);
    });

    const markerFor = (player, week) => {
      const id = Number(player.fpl_id);
      if (Number(week.captain) === id) return " C";
      if (Number(week.vice_captain ?? week.vice) === id) return " V";
      const order = (week.bench_order || week.benchOrder || []).map(Number);
      if (!order.includes(id)) return "";
      /* A benched keeper is BGK whatever his index, and the three outfield reserves are numbered among
         themselves from one. Reading the raw index produced "B0", which is not a slot, and called a
         benched keeper "B3" whenever the stored order did not happen to list him first. */
      if (player.position === "GKP") return " BGK";
      const outfieldOrder = order.filter((benchId) => {
        const benched = (state.players || []).find((entry) => Number(entry.fpl_id) === benchId);
        return benched && benched.position !== "GKP";
      });
      const at = outfieldOrder.indexOf(id);
      return at >= 0 ? ` B${at + 1}` : "";
    };

    /* Each cell carries the opponent as well as the number, because a projection without the fixture
       behind it cannot be judged. Read once per player across the whole range rather than per cell. */
    const fixturesFor = (player) => {
      const list = core ? nextFixtures(core.fixtures, core.teamById, player.team_id, 38, weeks[0]) : [];
      const byGw = new Map();
      for (const fixture of list) byGw.set(Number(fixture.gw), fixture);
      return byGw;
    };

    const header = ["Player", "Tm", "Pos", "Price", ...weeks.map((gw) => `GW${gw}`), "Tot"];
    const rows = players.map((player) => {
      let total = 0;
      const fixtures = fixturesFor(player);
      const cells = plannedWeeks.map((week) => {
        const gameweek = Number(week.gw);
        const score = Number(model.scoreForGw(player, gameweek) ?? 0);
        const starting = (week.starting_ids || week.startingIds || []).map(Number).includes(Number(player.fpl_id));
        const captain = Number(week.captain) === Number(player.fpl_id);
        /* Bench Boost pays the reserves too, so on that week everyone counts. */
        const counts = starting || week.chip === "benchboost";
        if (counts) total += score * (captain ? 2 : 1);
        const fixture = fixtures.get(gameweek);
        const opponent = fixture ? ` ${fixture.opp}${fixture.home ? "(H)" : "(A)"}` : " BLANK";
        return `${score.toFixed(2)}${opponent}${markerFor(player, week)}`;
      });
      return [player.web_name, player.team, player.position, Number(player.price).toFixed(1), ...cells, total.toFixed(2)];
    });

    const shapes = plannedWeeks.map((week) => {
      const chip = week.chip ? ` ${String(week.chip).toUpperCase()}` : "";
      return `GW${week.gw} ${week.structure || week.formation || "?"}${chip}`;
    }).join(", ");

    /* A markdown table, not space padding. Padded columns looked like a wall of text and fell apart the
       moment a name or an opponent ran long; pipes render as a real table wherever it is pasted. */
    const line = (cells) => `| ${cells.join(" | ")} |`;
    /* The headline is the sum of the column beside it. It used to be the optimiser's own figure, which
       stopped matching the moment the table began describing the plan as saved rather than the
       optimiser's suggestion, so the header read high against its own rows. */
    const hits = plannedWeeks.reduce((sum, week) => sum + Number(week.hit || week.transfer_hit || 0), 0);
    const total = (rows.reduce((sum, row) => sum + Number(row[row.length - 1]), 0) - hits).toFixed(2);
    const cost = (state.players || []).reduce((sum, player) => sum + Number(player.price || 0), 0).toFixed(1);
    /* The bank is 100.0 less what was PAID, never 100.0 less what the fifteen are worth today. The old
       form here went negative the moment a squad appreciated past 100.0, which is the same bug the money
       block below was fixed for; this copy of the sum was missed. squadMoney is the one accounting the
       validator, the transfers page and the pitch all share, so this cannot drift from them again. */
    const summaryMoney = squadMoney(state.players);

    return [
      `**GW${gwFrom}-${gwTo} · ${total} xPTS · squad £${cost}m · bank £${summaryMoney.bank.toFixed(1)}m**`,
      "",
      line(header),
      line(header.map(() => "---")),
      ...rows.map(line),
      "",
      shapes + ".",
      "C captain · V vice · B1-B3 bench order · BGK benched keeper",
    ].join("\n");
  };

  const copyRangeTable = async () => {
    const text = buildRangeTable();
    if (!text) { setPlanError("Nothing to copy yet: pick a squad and a gameweek range first."); return; }
    try {
      await navigator.clipboard.writeText(text);
      setPlanNotice("Week-by-week table copied to the clipboard.");
    } catch {
      setPlanError("Could not reach the clipboard. Check the browser permission.");
    }
  };

  const exportRangeTable = () => {
    const text = buildRangeTable();
    if (!text) { setPlanError("Nothing to export yet: pick a squad and a gameweek range first."); return; }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(working?.name || "squad").replace(/[^a-z0-9]+/gi, "-")}-GW${gwFrom}-${gwTo}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setPlanNotice("Week-by-week table downloaded.");
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
  /* Whether every week in the range already holds the eleven the optimiser would pick. Without this the
     button gives no sign of whether it did anything, so a second press looks identical to the first. */
  const rangeAlreadyOptimised = React.useMemo(() => {
    if (!shaped || !rangeProjection?.ok) return false;
    return (rangeProjection.weekly || []).every((week) => {
      const stored = shaped.weeks?.[String(week.gw)] || shaped.weeks?.[week.gw];
      if (!stored?.startingIds) return false;
      const want = [...(week.starting_ids || week.startingIds || [])].map(Number).sort((a, b) => a - b);
      const have = [...stored.startingIds].map(Number).sort((a, b) => a - b);
      return want.length === have.length
        && want.every((id, index) => id === have[index])
        && Number(stored.captain) === Number(week.captain);
    });
  }, [shaped, rangeProjection]);

  const doOptimiseRange = () => {
    if (readOnly || !shaped || !rangeProjection?.ok) return;
    if (rangeAlreadyOptimised) {
      setPlanNotice(`GW${gwFrom}-GW${gwTo} is already optimised. Nothing changed.`);
      return;
    }
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
    /* Only move the viewed week if it has fallen outside the new range. Snapping to the first week every
       time is what kept throwing you back to GW1: widening the range, optimising, or anything else that
       re-ran this all did it. */
    setGw((current) => (current < from || current > to ? from : current));
    setChipGw((current) => (current < from || current > to ? from : current));
  };


  /* The gameweek control, at pill size, sitting on the pitch under the formation dropdown. It used to be a
     56px-tall row above the pitch, which pushed the squad down the page for something you touch rarely. */
  const gwControl = (
    <span className="zeus-gw-stepper" style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(6,0,12,0.82)",
      border: `1px solid ${T.line}`, borderRadius: S.radiusSm, padding: "0 4px", height: S.ctrlSm }}>
      <button onClick={() => setGw((g) => Math.max(gwFrom, g - 1))} disabled={gw <= gwFrom} className="fb-press zeus-pitch-control"
        style={{ width: 26, height: S.ctrlSm, borderRadius: 8, background: "transparent", border: "none",
          ...lang(16, 700), opacity: gw <= gwFrom ? 0.35 : 1 }} aria-label="Previous gameweek">‹</button>
      <span style={{ ...val(13), minWidth: 42, textAlign: "center" }}>GW{gw}</span>
      <button onClick={() => setGw((g) => Math.min(gwTo, g + 1))} disabled={gw >= gwTo} className="fb-press zeus-pitch-control"
        style={{ width: 26, height: S.ctrlSm, borderRadius: 8, background: "transparent", border: "none",
          ...lang(16, 700), opacity: gw >= gwTo ? 0.35 : 1 }} aria-label="Next gameweek">›</button>
    </span>
  );

  /* The headline figures, as pills under the budget rather than tall boxes above the pitch. */
  const pill = (label, value, tone) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(6,0,12,0.82)",
      border: `1px solid ${T.line}`, borderRadius: S.radiusSm, padding: "0 10px", height: S.ctrlSm }}>
      <span style={{ ...lang(12, 700), letterSpacing: "0.06em", opacity: 0.85 }}>{label}</span>
      <span style={val(15, tone)}>{value}</span>
    </span>
  );

  const transfers = shaped ? ((shaped.weeks[gw] || {}).transfers || []) : [];

  /* Bench and start, stored as a starting-eleven list for this gameweek. Same-position exchange only,
     so the eleven always stays legal and nobody can be lost the way a dropped drag could lose them. */
  /* A swap is an exchange between two named players, chosen by clicking. Identical to the Builder. */
  /* SWAPPING ACROSS POSITIONS.
   *
   * A swap used to be refused unless both players played the same position, so a midfield could never be
   * traded for a defender even when the eleven that came out was perfectly legal. FPL does not work that
   * way: any eleven is allowed as long as it has one keeper, at least three defenders, at least one
   * forward and eleven players. So the rule here is the real rule. The week's formation is rewritten to
   * match whatever the new eleven actually is, rather than the swap being blocked to protect a shape. */
  const shapeOf = (starters) => {
    const count = (position) => starters.filter((player) => player.position === position).length;
    return { gk: count("GKP"), def: count("DEF"), mid: count("MID"), fwd: count("FWD") };
  };
  const isLegalXi = (starters) => {
    if (starters.length !== 11) return false;
    const { gk, def, mid, fwd } = shapeOf(starters);
    return gk === 1 && def >= 3 && def <= 5 && mid >= 2 && mid <= 5 && fwd >= 1 && fwd <= 3;
  };
  const startersAfterSwap = (a, b) => {
    if (!state) return null;
    const flipped = state.players.map((player) => (
      player.fpl_id === a.fpl_id ? { ...player, starting: !a.starting }
        : player.fpl_id === b.fpl_id ? { ...player, starting: !b.starting }
          : player
    ));
    return flipped.filter((player) => player.starting);
  };

  const swapPair = (a, b) => {
    if (!state || readOnly) return;

    /* Two reserves changing places is a reordering of the autosub queue, not a change to the eleven, so
       it writes the bench order rather than going near the starting list. The reserve keeper is left out:
       he can only replace the keeper, so his place in the queue is meaningless and fixed. */
    if (!a.starting && !b.starting) {
      if (a.position === "GKP" || b.position === "GKP") {
        setPlanError("The reserve keeper's place is fixed. He can only ever replace the keeper.");
        return;
      }
      const current = (shaped?.weeks?.[String(gw)]?.benchOrder || [])
        .map(Number)
        .filter((id) => state.players.some((player) => Number(player.fpl_id) === id && !player.starting));
      const queue = current.length
        ? current
        : state.players.filter((player) => !player.starting && player.position !== "GKP")
          .sort((x, y) => Number(model?.scoreForGw(y, gw) ?? 0) - Number(model?.scoreForGw(x, gw) ?? 0))
          .map((player) => Number(player.fpl_id));
      const outfield = queue.filter((id) => {
        const player = state.players.find((entry) => Number(entry.fpl_id) === id);
        return player && player.position !== "GKP";
      });
      const from = outfield.indexOf(Number(a.fpl_id));
      const to = outfield.indexOf(Number(b.fpl_id));
      if (from < 0 || to < 0) return;
      [outfield[from], outfield[to]] = [outfield[to], outfield[from]];
      /* The keeper leads the stored order, so the week still names all four reserves. */
      const keeperIds = state.players
        .filter((player) => !player.starting && player.position === "GKP")
        .map((player) => Number(player.fpl_id));
      setPlanError(null);
      patchWeek({ benchOrder: [...keeperIds, ...outfield] });
      return;
    }

    const starters = startersAfterSwap(a, b);
    if (!starters || !isLegalXi(starters)) {
      setPlanError("That swap would leave an illegal eleven. FPL needs one keeper, three or more defenders and at least one forward.");
      return;
    }
    const startingIds = starters.map((player) => player.fpl_id);
    const benchOrder = state.players.filter((player) => !startingIds.includes(player.fpl_id)).map((player) => player.fpl_id);
    const { def, mid, fwd } = shapeOf(starters);
    setPlanError(null);
    patchWeek({ startingIds, benchOrder, structure: `${def}-${mid}-${fwd}` });
  };

  /* Every player who could legally change places with this one, regardless of position. */
  const partnersFor = (p) => (state
    ? state.players.filter((x) => {
      if (x.fpl_id === p.fpl_id) return false;
      /* Reserve to reserve is a queue reorder, allowed between outfield reserves only. */
      if (!p.starting && !x.starting) return p.position !== "GKP" && x.position !== "GKP";
      if (Boolean(x.starting) === Boolean(p.starting)) return false;
      const starters = startersAfterSwap(p, x);
      return Boolean(starters) && isLegalXi(starters);
    })
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

  const empty = !state || state.players.length === 0;
  /* THE LIVE TEAM IS A REAL SQUAD NOW, SO IT BELONGS IN THE LIST.
   *
   * It used to be a hard-coded read-only slot behind a flag, because before a gameweek had been played
   * there were no picks to show and the slot would have been an empty box. There are picks now: the
   * team ID connect writes them into this plan. Hiding your actual team behind a flag that is off
   * means the one squad that certainly matters is the one squad you cannot open.
   *
   * It is listed first and only when it actually holds players, so it never appears as an empty box. */
  const liveHasPlayers = Boolean(livePlan && Array.isArray(livePlan.base) && livePlan.base.length > 0);
  const options = [
    ...(liveHasPlayers || SHOW_HARDCODED_SQUAD_4812
      ? [{ id: "live", label: livePlan && livePlan.name ? livePlan.name : "My team" }]
      : []),
    ...(plans || []).map((p) => ({ id: String(p.id), label: p.name })),
  ];
  /* THE DRAFT CYCLER.
   *
   * Sitting above the right-hand reserve, so a draft can be flicked through while scrolled down at the
   * pitch rather than scrolling back to the dropdown at the top of the page every time. The gameweek
   * stepper sits directly above it, for the same reason. */
  const cycleDraft = (step) => {
    if (!options.length) return;
    const at = options.findIndex((option) => String(option.id) === String(selectedId));
    const next = options[(at + step + options.length) % options.length];
    if (!next) return;
    /* Stay on the gameweek being viewed. Comparing two drafts at GW5 means looking at GW5 in both, and
       being dropped back to the first week on every switch made that impossible. */
    setSelectedId(String(next.id));
    setReplacing(null);
  };

  const currentOption = options.find((option) => String(option.id) === String(selectedId)) || null;

  /* Unsaved work is announced where the work happens. Making a swap at the pitch used to leave the only
     SAVE button at the top of the page, out of sight, so a change could be made and lost without ever
     seeing a prompt. This appears only when something is actually unsaved. */
  const pitchSaveBar = !readOnly && dirty && selectedId !== "live" ? (
    <div className="zeus-pitch-savebar" aria-label="Unsaved changes">
      <span style={lang(12.5, 700, T.green)}>UNSAVED</span>
      <button type="button" onClick={undo} disabled={!undoStack.length} className="fb-press"
        aria-label="Undo the last change"
        style={{ background: T.plate, border: `1px solid ${T.line}`, opacity: undoStack.length ? 1 : 0.45, ...lang(12.5, 700) }}>
        UNDO
      </button>
      <button type="button" onClick={saveDraft} className="fb-press"
        aria-label="Save this draft"
        style={{ background: T.green, border: "none", ...lang(12.5, 800, "#04130A") }}>
        SAVE
      </button>
    </div>
  ) : null;

  /* Puts the bench back to xPTS order for this week. Once two reserves are swapped by hand an explicit
     order is stored and the automatic sort stops applying, so there has to be a way back to it. */
  const reoptimiseBench = () => {
    if (readOnly || !state || !model) return;
    /* The stored bench order must name all four reserves, keeper included. Writing only the three
       outfield reserves left the week with a fifteen that did not add up, and the save check then threw
       the whole week away, taking any substitution made that week with it. The keeper is pinned to the
       front, where he is always displayed. */
    const keepers = state.players.filter((player) => !player.starting && player.position === "GKP");
    const outfield = state.players
      .filter((player) => !player.starting && player.position !== "GKP")
      .sort((a, b) => Number(model.scoreForGw(b, gw) ?? 0) - Number(model.scoreForGw(a, gw) ?? 0));
    if (outfield.length < 2) return;
    const order = [...keepers, ...outfield].map((player) => Number(player.fpl_id));
    patchWeek({ benchOrder: order });
    setPlanNotice(`Bench reordered by xPTS for GW${gw}.`);
  };

  /* ORDER FIX.
   *
   * Only the left-to-right order of the eleven already on the pitch, within each row: best first. It
   * does not choose who plays, does not touch the bench, and does not change the formation, so the
   * projection for the week is identical before and after. It is purely how the row reads. */
  const orderFix = () => {
    if (readOnly || !state || !model) return;
    const starters = state.players.filter((player) => player.starting);
    if (starters.length !== 11) return;
    const rank = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
    const ordered = [...starters].sort((a, b) => {
      const byRow = (rank[a.position] ?? 9) - (rank[b.position] ?? 9);
      if (byRow !== 0) return byRow;
      return Number(model.scoreForGw(b, gw) ?? 0) - Number(model.scoreForGw(a, gw) ?? 0);
    });
    patchWeek({ startingIds: ordered.map((player) => player.fpl_id) });
    setPlanNotice(`Line-up reordered by xPTS within each position for GW${gw}.`);
  };

  const benchFooter = !readOnly && !empty ? (
    <button type="button" onClick={reoptimiseBench} className="fb-press zeus-bench-reoptimise"
      aria-label="Reorder the bench by projected points"
      style={{ background: T.plate, border: `1px solid ${T.line}`, ...lang(12.5, 700) }}>
      REOPTIMISE BENCH · GW{gw}
    </button>
  ) : null;

  const benchExtras = (
    <div className="zeus-pitch-extras">
      {pitchSaveBar}
      <div className="zeus-pitch-extras-row">
      {gwControl}
      <div className="zeus-draft-cycler" aria-label="Cycle saved squads">
        <button type="button" onClick={() => cycleDraft(-1)} disabled={options.length < 2}
          aria-label="Previous saved squad" className="fb-press"
          style={{ background: "transparent", border: "none", ...lang(17, 700), opacity: options.length < 2 ? 0.35 : 1 }}>‹</button>
        <span className="zeus-draft-cycler-name" title={currentOption?.label || ""} style={lang(13, 700)}>
          {currentOption?.label || "NO SQUADS"}
        </span>
        <button type="button" onClick={() => cycleDraft(1)} disabled={options.length < 2}
          aria-label="Next saved squad" className="fb-press"
          style={{ background: "transparent", border: "none", ...lang(17, 700), opacity: options.length < 2 ? 0.35 : 1 }}>›</button>
      </div>
      </div>
    </div>
  );

  const hit = week ? week.hit : 0;

  /* MONEY.
   *
   * This used to work the bank out as 100.0 less what the fifteen are worth today. The moment a squad
   * appreciated past 100.0 that went negative, nothing was affordable, and the page became unusable
   * for exactly the managers whose players had gone up. The bank is 100.0 less what was PAID, which
   * cannot go negative, and it is the same figure the validator and the transfers page use.
   *
   * Selling raises the sale value, not the current price: FPL keeps half of any rise. The old call
   * passed the current price in as both arguments, so the rule could never fire and a risen player
   * appeared to be worth more than he sells for. */
  const money = state ? squadMoney(state.players) : { paid: 0, value: 0, bank: 0, spend: 0 };
  const bankNow = money.bank;
  const spendable = replacing
    ? bankNow + (saleValue(replacing.purchasePrice ?? replacing.price, replacing.price) ?? Number(replacing.price))
    : bankNow;

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
          <button type="button" onClick={connectTeam} disabled={connecting}
            aria-label={liveHasPlayers ? "Refresh my real team from the official site" : "Load my real team from the official site"}
            title="Reads your entered team from the official site into the list above. It never changes a saved draft."
            className="fb-press zeus-toolbar-button"
            style={{ background: T.card, border: `1px solid ${liveHasPlayers ? T.line : T.green}`,
              opacity: connecting ? 0.55 : 1, ...lang(14, 700) }}>
            {connecting ? "LOADING" : liveHasPlayers ? "REFRESH MY TEAM" : "LOAD MY TEAM"}
          </button>

          {!readOnly && working && selectedId !== "live" && (
            <button onClick={doOptimiseRange} disabled={!rangeProjection?.ok} className="fb-press zeus-toolbar-button"
              data-zeus-feature="squad-optimise-v3"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: rangeProjection?.ok ? T.green : T.card,
                border: `1px solid ${rangeProjection?.ok ? T.green : T.line}`,
                opacity: rangeProjection?.ok ? 1 : 0.45,
                ...lang(13, 700, rangeProjection?.ok ? "#04130A" : "#FFFFFF") }}>
              <Wand2 size={14} /> {rangeAlreadyOptimised ? "OPTIMISED" : "OPTIMISE"} GW{gwFrom}{gwTo === gwFrom ? "" : `-GW${gwTo}`}
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
              <button onClick={copyRangeTable} className="fb-press zeus-toolbar-button zeus-copy-button"
                title="Copies the week-by-week table for the selected range to the clipboard."
                style={{ background: T.row, border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                COPY PAYLOAD
              </button>
              <button onClick={exportRangeTable} className="fb-press zeus-toolbar-button"
                title="Downloads the same table as a text file."
                style={{ background: T.card, border: `1px solid ${T.line}`, ...lang(13, 700) }}>
                EXPORT
              </button>
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
              onChange={changeRange}
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
              padding: "0 12px", borderRadius: 12, background: T.row }}>
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
            bank={bankNow}
            available={replacing ? spendable : bankNow}
            availableLabel={replacing ? "TO SPEND" : "BANK"}
            captainMultiplier={projection.captainMultiplier}
            underShape={null} benchExtras={benchExtras} benchFooter={benchFooter}
            benchOrder={shaped?.weeks?.[String(gw)]?.benchOrder || null}
            cornerPills={
              <>
                {pill(metricName(model.gateOpen), projection.netXpts.toFixed(1), T.xp)}
                {!readOnly && projection.transferHit > 0 && pill("TRANSFER COST", `-${projection.transferHit.toFixed(0)}`, T.pink)}
                {/* The count is now settable. It used to be simulated from GW1 assuming no transfers had
                    ever been made, which read three at GW3 when the real answer was two, and every hit
                    calculation downstream inherited that. Clicking it stores the number the manager
                    actually has, against the gameweek being viewed. */}
                {!readOnly && (
                  <button type="button" className="fb-press"
                    onClick={() => {
                      const current = week ? week.free : PLAN_RULES.freePerGw;
                      const answer = typeof window !== "undefined"
                        ? window.prompt(`Free transfers available at GW${gw}?`, String(current))
                        : null;
                      if (answer === null) return;
                      const next = Number(answer);
                      if (!Number.isFinite(next) || next < 0 || next > PLAN_RULES.maxBanked) return;
                      writePlan({ ...shaped, free_transfers: next, free_transfers_gw: Number(gw) });
                    }}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    aria-label="Set the number of free transfers available">
                    {pill("FREE", `${week ? week.free : PLAN_RULES.freePerGw} · ${transfers.length} MADE`, "#FFFFFF")}
                  </button>
                )}
                {!readOnly && !empty && (
                  <button type="button" onClick={orderFix} className="fb-press zeus-order-fix"
                    aria-label="Order the line-up by projected points"
                    title="Orders each row of the current eleven best first. The bench, the formation and the projection are untouched."
                    style={{ background: "rgba(6,0,12,0.82)", border: `1px solid ${T.line}`, ...lang(12, 700) }}>
                    ORDER FIX
                  </button>
                )}
              </>
            }
            /* Changing the formation used to set a label on the plan while the week kept its own list of
               eleven, so the pitch did not move. It now reseats this week: the best available players are
               picked for the new shape using the same xPTS as everything else. */
            onStructure={readOnly ? null : (key) => {
              const [def, mid, fwd] = String(key).split("-").map(Number);
              if (![def, mid, fwd].every(Number.isFinite)) return;
              const pick = (position, count) => (state?.players || [])
                .filter((player) => player.position === position)
                .sort((a, b) => Number(model.scoreForGw(b, gw) ?? 0) - Number(model.scoreForGw(a, gw) ?? 0))
                .slice(0, count);
              const starters = [...pick("GKP", 1), ...pick("DEF", def), ...pick("MID", mid), ...pick("FWD", fwd)];
              if (starters.length !== 11) {
                setPlanError(`This squad cannot field ${key}: not enough players in one of the positions.`);
                return;
              }
              const startingIds = starters.map((player) => player.fpl_id);
              const benchOrder = (state?.players || [])
                .filter((player) => !startingIds.includes(player.fpl_id))
                .map((player) => player.fpl_id);
              setPlanError(null);
              patchWeek({ startingIds, benchOrder, structure: key });
            }}
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
              if (p.starting && replacing.starting) return;
              swapPair(replacing, p); setReplacing(null);
            }}
            selectedId={replacing ? replacing.fpl_id : (menuFor ? menuFor.fpl_id : null)}
            swapTargets={replacing ? partnersFor(replacing).map((x) => x.fpl_id) : []}
            />
          {readOnly && (
            <span style={{ ...lang(13.5, 600), display: "block", textAlign: "center", marginTop: 10 }}>
              Read-only. Syncs from the official API at the first deadline.
              {/* Saying only "read-only" left no way to work out why tapping a player did nothing and no
                  hint about where transfers can be planned. The live team mirrors the official site on
                  purpose; a saved plan is the editable copy. */}
              {" "}To plan transfers, pick a saved plan from the team dropdown above.
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

            {/* SWAP was doing two unrelated jobs: moving a player between the XI and the bench, and
                putting him up for transfer. Reading only "SWAP", there was no way to tell the modal
                offered transfers at all, so the feature looked missing. They are now separate buttons
                with separate names; both still set the outgoing player, which is what the picker
                below needs. */}
            <button onClick={() => { setReplacing(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm, background: T.green,
                ...lang(14.5, 700, "#04130A") }}>
              TRANSFER OUT
            </button>

            <button onClick={() => { setReplacing(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm, background: T.card,
                border: `1px solid ${T.line}`,
                ...lang(14.5, 700, "#FFFFFF") }}>
              SWAP WITH ANOTHER PLAYER
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
            ? <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ ...lang(14, 600) }}>
                  Replacing {replacing.web_name}. He sells for {(saleValue(replacing.purchasePrice ?? replacing.price, replacing.price) ?? Number(replacing.price)).toFixed(1)},
                  so you can spend {spendable.toFixed(1)}.
                </span>
                {/* The only way out of a swap was a notice at the top of the page, nowhere near the list
                    being read, so a mis-tap felt permanent. Cancel sits beside the sentence that says a
                    swap is running, and Escape does the same thing. */}
                <button type="button" onClick={() => setReplacing(null)} className="fb-press"
                  style={{ height: S.ctrl, padding: "0 14px", borderRadius: S.radiusSm, background: T.card,
                    border: `1px solid ${T.line}`, ...lang(13, 700, "#FFFFFF") }}>
                  CANCEL
                </button>
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
            gwFrom={candFrom} gwTo={candTo} firstGw={firstGw} maxGw={lastGw}
            setRange={(from, to) => { setCandFrom(from); setCandTo(to); }}
            xpRange={xpOverCandRange} showGameweekRange
            extraFunds={replacing ? (saleValue(replacing.purchasePrice ?? replacing.price, replacing.price) ?? Number(replacing.price)) : 0}
                    clubs={core ? Object.values(core.teamById).sort((a,b)=>(a.name||"").localeCompare(b.name||"")) : []} />
        </div>
      )}
    </div>
  );
}
