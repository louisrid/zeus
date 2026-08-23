"use client";
import React from "react";
import { DEFAULT_MINIMUM_BENCH_SPEND } from "../../lib/minimum-bench-spend.mjs";
import { Wand2, Save, X, Check } from "lucide-react";
import { T, S, Kit, Plate, POS_LABEL, Skeleton, ErrorCard, lang, val, code } from "../../lib/ui";
import { loadCore, nextFixtures, sb } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { metricName } from "../../lib/solver/score.mjs";
import { RULES, STRUCTURES, emptySquad, bank, addPlayer, removePlayer, swapStarter, applyStructure, autoComplete, squadCountPos, clubCount } from "../../lib/solver/squad";
import { evaluateSquad } from "../../lib/solver/evaluate";
import BuilderPitch from "../../components/BuilderPitch";
import ShortlistPanel from "../../components/ShortlistPanel";
import Candidates from "../../components/Candidates";
import { XpBox } from "../../components/HeadlineBoxes";
import GameweekRange from "../../components/GameweekRange";
import Checks from "../../components/Checks";
import Fan from "../../components/Fan";
import Opp from "../../components/Opp";
import { FixtureRun } from "../../components/FixtureXP";
import { buildOpponentScale } from "../../lib/opponent";
import { buildPayload, payloadBrief, alternativesBlock, maybesBlock } from "../../lib/payload.mjs";
import { bestXI } from "../../lib/solver/autobuild.mjs";
import { optimiseOwnedSquadRange } from "../../lib/squad-range.mjs";
import FITTED from "../../config/fitted-params.json";
import SCHEDULE from "../../config/schedule.js";
import { scoreSquad } from "../../lib/scoring";
import { templateSquad } from "../../lib/data";
import ChipControls from "../../components/ChipControls";
import ControlShelf from "../../components/ControlShelf";
import Notice, { NoticeButton } from "../../components/Notice";
import ProjectedScoreBreakdown from "../../components/ProjectedScoreBreakdown";
import { projectSquadRange } from "../../lib/squad-projection.mjs";

const POS_ORDER = ["GKP", "DEF", "MID", "FWD"];

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 34, transform: "translateX(-50%)", zIndex: 60,
      background: T.row, border: `1px solid ${toast.bad ? T.pink : T.green}`, borderRadius: S.radiusSm, padding: "12px 22px",
      boxShadow: "0 12px 36px rgba(0,0,0,0.6)", ...lang(14.5, 700) }}>
      {toast.text}
    </div>
  );
}


/* Ranked candidates for one position, inside the remaining budget envelope. */
/* One list for the whole pool. You search and filter by position rather than picking a slot first,
   because choosing a slot before you know who is available is the wrong order. */






export default function BuilderClient() {
  const [core, setCore] = React.useState(null);
  const [draftsError, setDraftsError] = React.useState(null);
  const [eoByPlayerId, setEoByPlayerId] = React.useState(new Map());
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [squad, setSquad] = React.useState(() => emptySquad("3-5-2"));
  // BEST XI controls. Locks are players Louis has pinned into the eleven; horizon is how many
  // gameweeks the build maximises over.
  const [locks, setLocks] = React.useState([]);
  // Ignored players are excluded from every auto-build for this draft, so the next best option comes
  // through instead. Cleared when a draft is loaded, like locks.
  const [ignores, setIgnores] = React.useState([]);
  // Formation lock: when on, the auto-build may not change the shape.
  const [formationLocked, setFormationLocked] = React.useState(false);
  // Undo: one step back to the squad exactly as it was before the last action.
  const [undoState, setUndoState] = React.useState(null);
    // The player being replaced. His replacement is an outlined squad member or anyone from the list.
  const [replacing, setReplacing] = React.useState(null);
  // The maybe pile: players under consideration but not bought. Feeds the payload so the AI knows
  // what is already on the shortlist.
  const [maybeIds, setMaybeIds] = React.useState([]);
  /* One gameweek control on this page: the yellow slider in the player list below. It sets how many
     gameweeks xPTS adds up over, in the list and in Best XI, so the two can never disagree. */
  /* The gameweek range the numbers cover. Both ends move, so GW2 to GW4 is reachable. */
  const [gwFrom, setGwFrom] = React.useState(1);
  const [gwTo, setGwTo] = React.useState(1);
  const [chipGw, setChipGw] = React.useState(1);
  const [minimumBenchSpendEnabled, setMinimumBenchSpendEnabled] = React.useState(true);
  const [benchBudget, setBenchBudget] = React.useState(DEFAULT_MINIMUM_BENCH_SPEND);
  const rangeInitialisedForGw = React.useRef(null);
  const setRange = React.useCallback((a, b) => { setGwFrom(a); setGwTo(b); }, []);
  const [activeSlot, setActiveSlot] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [drafts, setDrafts] = React.useState([]);
  const [menuFor, setMenuFor] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [planWeeks, setPlanWeeks] = React.useState({});
  const appliedMinimumBenchSpend = minimumBenchSpendEnabled ? benchBudget : 0;

  const say = React.useCallback((text, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then(async (c) => { setCore(c); setModel(await loadModel(c)); })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const firstGw = model && Number.isFinite(Number(model.gw)) ? Number(model.gw) : 1;
  const lastGw = React.useMemo(() => {
    const fixtureGws = core ? (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite) : [];
    const seasonLast = fixtureGws.length ? Math.max(...fixtureGws) : firstGw;
    return Math.max(firstGw, Math.min(8, seasonLast, firstGw + 7));
  }, [core, firstGw]);
  React.useEffect(() => {
    if (!model || rangeInitialisedForGw.current === firstGw) return;
    setRange(firstGw, Math.min(lastGw, firstGw + 4));
    setChipGw(firstGw);
    rangeInitialisedForGw.current = firstGw;
  }, [model, firstGw, lastGw, setRange]);
  React.useEffect(() => {
    setChipGw((current) => current < gwFrom || current > gwTo ? gwFrom : current);
  }, [gwFrom, gwTo]);

  const loadDrafts = React.useCallback(() => {
    fetch("/api/drafts")
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setDrafts(j.drafts); setDraftsError(null); } else setDraftsError(j.error || "Draft saving is unavailable."); })
      .catch(() => setDraftsError("Draft saving is unavailable."));
  }, []);
  React.useEffect(() => { loadDrafts(); }, [loadDrafts]);


  // Top-rank effective ownership, newest snapshot. Absent before any gameweek has been played, and
  // the panel then shows nothing rather than a zero.
  React.useEffect(() => {
    if (!core) return;
    sb().from("eo_snapshots").select("player_id, eo, gw").eq("scope", "top10k_proxy")
      .order("gw", { ascending: false }).limit(1000)
      .then(({ data }) => {
        if (!data || !data.length) return;
        const newest = data[0].gw;
        const fplById = new Map(core.players.map((p) => [p.id, p.fpl_id]));
        const m = new Map();
        for (const r of data) {
          if (r.gw !== newest) continue;
          const fpl = fplById.get(r.player_id);
          if (fpl) m.set(fpl, Number(r.eo));
        }
        setEoByPlayerId(m);
      })
      .catch(() => {});
  }, [core]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setActiveSlot(null); setMenuFor(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pool = React.useMemo(() => {
    if (!core || !model) return [];
    return core.players.map((p) => {
      const env = model.envByTeam.get(p.team_id);
      return { ...p, nextLabel: env ? `GW${env.gw}${env.home ? "" : " (A)"}` : null };
    });
  }, [core, model]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  // Template fifteen is the most-owned legal fifteen, from live ownership.
  // templateSquad returns a flat fifteen, XI first then bench. Not an object.
  const templateFifteen = React.useMemo(() => (core ? templateSquad(core.players) : []), [core]);
  const xpOf = React.useCallback((p) => {
    if (!model || !core) return null;
    const f = nextFixtures(core.fixtures, core.teamById, p.team_id, 1)[0];
    return f ? model.scoreForGw(p, f.gw) : null;
  }, [model, core]);
  const run5Of = React.useCallback((p) => {
    if (!model || !core) return null;
    const vals = nextFixtures(core.fixtures, core.teamById, p.team_id, 5)
      .map((f) => model.scoreForGw(p, f.gw)).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
  }, [model, core]);

  const oppOf = React.useCallback(
    (p) => (core ? nextFixtures(core.fixtures, core.teamById, p.team_id, 1)[0] || null : null),
    [core],
  );

  const ctx = React.useMemo(() => {
    if (!model) return null;
    return {
      scoreOf: model.scoreOf, bandOf: model.bandOf, tailOf: model.tailOf, floorOf: model.floorOf,
      minutes: model.minutes, perGw: model.perGw,
    };
  }, [model]);

  const evaluation = React.useMemo(() => (ctx ? evaluateSquad(squad, Math.max(1, gwTo - gwFrom + 1), ctx) : null), [squad, gwFrom, gwTo, ctx]);
  const scores = React.useMemo(() => {
    if (!ctx || !pool.length) return null;
    const bestCap = evaluation && evaluation.captaincy && evaluation.captaincy.best ? evaluation.captaincy.best.ev : null;
    return scoreSquad({ squad, pool, scoreOf: ctx.scoreOf, bestCaptainEv: bestCap, templateFifteen, eoByPlayerId });
  }, [ctx, pool, squad, evaluation, templateFifteen, eoByPlayerId]);


  const structureScores = React.useMemo(() => {
    if (!ctx || !pool.length) return [];
    // A shape is only worth scoring once there are real players to complete. With an empty squad
    // every shape scores the market's ceiling, not this squad, so no number is shown at all.
    const picked = squad.players.length > 0;
    const ranked = {};
    for (const pos of POS_ORDER) {
      ranked[pos] = pool.filter((p) => p.position === pos).sort((a, b) => ctx.scoreOf(b) - ctx.scoreOf(a));
    }
    return STRUCTURES.map((st) => {
      const base = picked ? { ...squad, structure: st.key } : emptySquad(st.key);
      const filled = autoComplete(base, pool, ctx.scoreOf);
      const readout = evaluateSquad(filled, 1, ctx);
      // Per-line evidence, arithmetic over the live pool only: what the shape demands, what those
      // starters return per million, and how far the score falls at the margin. A steep fall means
      // the shape is asking for players the market prices dearly.
      const lines = ["DEF", "MID", "FWD"].map((pos) => {
        const need = st[pos];
        const list = ranked[pos] || [];
        const starters = list.slice(0, need);
        // Guarded divisor: a sub-£3 price is a data fault, not a bargain, so it cannot inflate value.
        const perM = starters.length
          ? starters.reduce((a, p) => a + ctx.scoreOf(p) / Math.max(3, Number(p.price)), 0) / starters.length
          : 0;
        const last = starters.length ? ctx.scoreOf(starters[starters.length - 1]) : 0;
        const next = list[need] ? ctx.scoreOf(list[need]) : 0;
        return { pos, need, perM, drop: Math.max(0, last - next) };
      });
      const slots = lines.reduce((a, l) => a + l.need, 0);
      const rawValue = slots ? lines.reduce((a, l) => a + l.perM * l.need, 0) / slots : 0;
      const thin = lines.slice().sort((a, b) => b.drop - a.drop)[0];
      // Real historical evidence: what an XI in this shape has returned per gameweek across nine
      // seasons, using points-per-start fitted per position on 2016/17-2024/25. Price-blind by
      // design: it answers "what does this shape return", not "what does it cost".
      const PPS = FITTED.position_points_per_start;
      const hist = PPS.GKP + lines.reduce((a, l) => a + l.need * PPS[l.pos], 0);
      return {
        key: st.key,
        score: picked ? readout.points.mean : null,
        rawValue,
        hist,
        thin,
        bank: readout.structure.bank,
        premiums: readout.structure.premiums,
      };
    })
      .map((r, _, all) => {
        // Normalised 0-100 across the eight shapes so one glance ranks them.
        const best = Math.max(...all.map((x) => x.rawValue)) || 1;
        const hiHist = Math.max(...all.map((x) => x.hist));
        const loHist = Math.min(...all.map((x) => x.hist));
        const spread = hiHist - loHist || 1;
        const rel = (r.hist - loHist) / spread;
        return { ...r, value: Math.round((r.rawValue / best) * 100), histTone: rel > 0.66 ? T.green : rel > 0.33 ? "#FFFFFF" : T.pink };
      })
      .sort((a, b) => (b.score ?? b.value) - (a.score ?? a.value));
  }, [ctx, pool, squad]);

  const maxScore = React.useMemo(() => {
    if (!ctx || !pool.length) return 8;
    return Math.max(4, ...pool.slice(0, 60).map((p) => ctx.bandOf(p).p90 || 0));
  }, [ctx, pool]);


  const add = (p) => {
    /* While replacing someone, the list completes the replacement: he leaves, the chosen player takes
       his slot and his starting status. One button, one question, two possible answers. */
    if (replacing) {
      const out = replacing;
      if (p.fpl_id === out.fpl_id) { setReplacing(null); return; }
      if (p.position !== out.position) return say("Replacements are same-position only.", true);
      if (clubCount(squad, p.team_id) >= RULES.maxPerClub && p.team_id !== out.team_id) return say(`Three from ${p.team} is the limit.`, true);
      const budget = bank(squad) + Number(out.price);
      if (Number(p.price) > budget + 1e-9) return say(`${p.web_name} costs more than the ${budget.toFixed(1)} you would have.`, true);
      snapshot();
      setSquad((sq) => addPlayer(removePlayer(sq, out), { ...p, starting: Boolean(out.starting) }));
      setReplacing(null);
      say(`${p.web_name} replaces ${out.web_name}.`);
      return;
    }
    if (squad.players.length >= RULES.size) return say("The squad is full at 15 players.", true);
    if (squadCountPos(squad, p.position) >= RULES.composition[p.position]) return say(`You already have ${RULES.composition[p.position]} in that position.`, true);
    if (clubCount(squad, p.team_id) >= RULES.maxPerClub) return say(`Three from ${p.team} is the limit.`, true);
    if (Number(p.price) > bank(squad) + 1e-9) return say(`${p.web_name} costs more than the ${bank(squad).toFixed(1)} you have left.`, true);
    setSquad((s) => addPlayer(s, p));
    say(`${p.web_name} added.`);
  };

  const remove = (p) => { setSquad((s) => removePlayer(s, p.fpl_id)); setMenuFor(null); say(`${p.web_name} removed.`); };
  const swap = (from, to) => {
    if (from.position !== to.position) return say("Swaps are same-position only.", true);
    const benchId = from.starting ? to.fpl_id : from.fpl_id;
    const starterId = from.starting ? from.fpl_id : to.fpl_id;
    setSquad((s) => swapStarter(s, benchId, starterId));
  };
  const setStructure = (key) => setSquad((s) => applyStructure(s, key, ctx ? ctx.scoreOf : () => 0));

  /* xPTS across the chosen gameweeks. A player with a blank in that window contributes nothing for it, and a
     player with two fixtures in one gameweek contributes both, which is what makes the range worth having. */
  const xpOverHorizon = React.useCallback((p) => {
    if (!model || !core) return ctx ? ctx.scoreOf(p) : 0;
    let total = 0, seen = 0;
    for (let gw = gwFrom; gw <= gwTo; gw++) {
      const v = model.scoreForGw(p, gw);
      if (v !== null && v !== undefined) { total += Number(v); seen++; }
    }
    return seen ? total : 0;
  }, [model, core, ctx, gwFrom, gwTo]);

  /* Arriving from the dashboard's "edit this as a draft": seat the most-owned fifteen so Louis can work
     from the template rather than an empty pitch. Runs once, only when the flag is present. */
  const [templateLoaded, setTemplateLoaded] = React.useState(false);
  // The plan being edited. Arriving with ?plan=id loads it; saving writes back to the same row.
  const [planId, setPlanId] = React.useState(null);
  const [planName, setPlanName] = React.useState("");
  const [planLoaded, setPlanLoaded] = React.useState(false);
  const [savedPlans, setSavedPlans] = React.useState([]);

  const loadSavedPlans = React.useCallback(() => {
    fetch("/api/plans").then((r) => r.json())
      .then((j) => setSavedPlans(j.ok ? (j.plans || []) : []))
      .catch(() => setSavedPlans([]));
  }, []);
  React.useEffect(() => { loadSavedPlans(); }, [loadSavedPlans]);

  /* Open a saved draft into the Builder. Players are hydrated from the live list, because a stored row
     carries an id and little else, and anyone no longer in the league is reported rather than dropped
     in silence. */
  const openPlan = React.useCallback((row) => {
    if (!row) return;
    const byId = new Map(pool.map((pl) => [pl.fpl_id, pl]));
    const players = (row.base || [])
      .map((b) => { const pl = byId.get(b.fpl_id); return pl ? { ...pl, starting: Boolean(b.starting) } : null; })
      .filter(Boolean);
    setPlanId(row.id); setPlanName(row.name || ""); setPlanWeeks(canonicalWeeks(row.weeks));
    setSquad({ structure: row.structure || "3-5-2", captain: row.captain ?? null, vice: row.vice ?? null, players });
    setIgnores(row.ignores || []); setMaybeIds(row.maybe_ids || []);
    setLocks([]); setUndoState(null);
    const short = RULES.size - players.length;
    const dropped = (row.base || []).length - players.length;
    say(short > 0
      ? `${row.name} opened. ${short} slot${short === 1 ? "" : "s"} empty${dropped > 0 ? `, ${dropped} no longer in the league` : ""}.`
      : `${row.name} opened.`, short > 0);
  }, [pool]);

  React.useEffect(() => {
    if (planLoaded || !core || !ctx || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("plan");
    if (!id) { setPlanLoaded(true); return; }
    fetch("/api/plans").then((r) => r.json()).then((j) => {
      const all = j.ok ? [...(j.plans || []), ...(j.live ? [j.live] : [])] : [];
      const row = all.find((x) => String(x.id) === String(id));
      if (!row) say("That draft could not be found.", true); else openPlan(row);
      setPlanLoaded(true);
    }).catch(() => { say("That draft could not be loaded.", true); setPlanLoaded(true); });
  }, [core, ctx, pool, planLoaded, openPlan]);

  /* DUPLICATE.
   *
   * Saves everything on screen as a brand new draft rather than overwriting the one that is open, so a
   * plan can be branched: keep the original, try a different transfer on the copy. Sending no id is what
   * makes the API create a new row instead of updating. */
  const duplicatePlan = () => savePlan({ asNew: true });

  const savePlan = async ({ asNew = false } = {}) => {
    if (!squad.players.length) { say("Nothing to save yet.", true); return; }
    const baseName = planName || draftName || `${squad.structure} plan`;
    const body = {
      action: "save", id: asNew ? undefined : (planId || undefined),
      name: asNew ? `${baseName} copy` : baseName,
      structure: squad.structure, captain: squad.captain, vice: squad.vice,
      base: squad.players.map((pl) => ({
        fpl_id: pl.fpl_id, position: pl.position, team_id: pl.team_id,
        price: Number(pl.price), purchasePrice: Number(pl.price), starting: Boolean(pl.starting),
      })),
      weeks: canonicalWeeks(planWeeks, squad.players), ignores, maybeIds,
    };
    const r = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "The request failed." }));
    if (!r.ok) { say(r.error, true); return; }
    if (r.id) setPlanId(r.id);
    if (asNew) { setPlanName(body.name); setDraftName(body.name); }
    loadSavedPlans();
    say(asNew ? `${body.name} created.` : (planId ? `${body.name} updated.` : `${body.name} saved.`));
  };
  React.useEffect(() => {
    if (templateLoaded || !core || !ctx) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("from") !== "template") return;
    // templateFifteen is a flat fifteen. Seat it through the solver so the formation is legal and the
    // strongest eleven starts, rather than trusting the order it happens to arrive in.
    const ids = templateFifteen.map((pl) => pl.fpl_id);
    if (ids.length) {
      const r = bestXI({ pool, xpOf: xpOverHorizon, keep: ids, ignores, startProbOf: model.startProbOf });
      if (r) {
        setSquad((sq) => ({ ...sq, structure: r.formation, players: [...r.xi, ...r.bench] }));
        say("Template loaded. Nothing is saved until you save a draft.");
      }
    }
    setTemplateLoaded(true);
  }, [core, ctx, templateLoaded, templateFifteen, pool, xpOverHorizon, ignores, model]);

  const snapshot = () => setUndoState({ squad, locks, ignores, maybeIds, planWeeks });
  const undo = () => {
    if (!undoState) { say("Nothing to undo.", true); return; }
    setSquad(undoState.squad); setLocks(undoState.locks);
    setIgnores(undoState.ignores); setMaybeIds(undoState.maybeIds);
    setPlanWeeks(undoState.planWeeks || {});
    setUndoState(null);
    say("Undone.");
  };

  /* BEST XI: fill what is empty, keep everything already picked. Nothing you chose is ever dropped.
     Whether a kept player STARTS is still the solver's call, so a cheap filler can move to the bench,
     but he stays in your fifteen. */
  /* CHIP-AWARE SCORE. A chip belongs to one gameweek and every visible total comes from the same helper. */
  const activeChip = (planWeeks[chipGw] || planWeeks[String(chipGw)] || {}).chip || null;
  const toggleChip = (chip) => {
    snapshot();
    setPlanWeeks((current) => {
      const next = { ...current };
      if (chip) {
        for (const [rawGw, row] of Object.entries(next)) {
          if (Number(rawGw) !== Number(chipGw) && row?.chip === chip) next[rawGw] = { ...row, chip: null };
        }
      }
      const gw = Number(chipGw);
      if (!Number.isInteger(gw) || gw < 1 || gw > 38) return current;
      next[String(gw)] = { ...(next[String(gw)] || {}), chip };
      return canonicalWeeks(next);
    });
  };
  const selectedRange = React.useMemo(() => {
    if (!model || squad.players.length !== RULES.size) return null;
    return optimiseOwnedSquadRange({
      players: squad.players,
      structure: squad.structure,
      gwFrom,
      gwTo,
      scoreForGw: (player, gameweek) => model.scoreForGw(player, gameweek) ?? 0,
      chipForGw: (gameweek) => (planWeeks[gameweek] || planWeeks[String(gameweek)] || {}).chip || null,
      requiredStarterIdsForGw: () => locks,
      onlyFormationForGw: () => formationLocked ? squad.structure : null,
      xiBudget: RULES.budget - appliedMinimumBenchSpend,
      benchBudget: appliedMinimumBenchSpend,
    });
  }, [model, squad, gwFrom, gwTo, planWeeks, locks, formationLocked, appliedMinimumBenchSpend]);
  const staticBreakdown = React.useMemo(() => projectSquadRange({
    players: squad.players,
    captain: squad.captain,
    gwFrom,
    gwTo,
    scoreForGw: (player, gameweek) => model?.scoreForGw(player, gameweek) ?? 0,
    chipForGw: (gameweek) => (planWeeks[gameweek] || planWeeks[String(gameweek)] || {}).chip || null,
  }), [squad, gwFrom, gwTo, model, planWeeks]);
  const selectedBreakdown = selectedRange?.ok ? {
    startingXpts: selectedRange.total.starting_xpts,
    captainBonus: selectedRange.total.captain_bonus,
    captainMultiplier: selectedRange.weekly.find((row) => row.gw === gwFrom)?.captain_multiplier || 2,
    benchBoostBonus: selectedRange.total.bench_boost_bonus,
    requestedTransferHit: selectedRange.total.requested_transfer_hit,
    transferHit: selectedRange.total.transfer_hit,
    wildcardSaving: selectedRange.total.wildcard_saving,
    grossXpts: selectedRange.total.gross_xpts,
    netXpts: selectedRange.total.net_xpts,
  } : staticBreakdown;
  const selectedTotal = selectedBreakdown.netXpts;
  const pitchCaptainMultiplier = selectedRange?.weekly.find((row) => row.gw === gwFrom)?.captain_multiplier
    || staticBreakdown.weeks.find((row) => row.gw === gwFrom)?.captainMultiplier || 2;

  const horizonTotals = React.useMemo(() => {
    if (!model || !core || !squad.players.length) return null;
    const total = (count) => projectSquadRange({
      players: squad.players,
      captain: squad.captain,
      gwFrom: firstGw,
      gwTo: Math.min(lastGw, firstGw + count - 1),
      scoreForGw: (player, gameweek) => model.scoreForGw(player, gameweek) ?? 0,
      chipForGw: (gameweek) => (planWeeks[gameweek] || planWeeks[String(gameweek)] || {}).chip || null,
    }).netXpts;
    return { one: total(1), three: total(3), six: total(6) };
  }, [model, core, squad, firstGw, lastGw, planWeeks]);

  /* CHECKS inputs: each is an action or a problem, never a restatement of the pitch. */
  const checks = React.useMemo(() => {
    if (!ctx || !squad.players.length) return null;
    const starters = squad.players.filter((p) => p.starting);
    const xi = starters.length ? starters : squad.players.slice(0, 11);
    const ranked = [...xi].sort((a, b) => xpOverHorizon(b) - xpOverHorizon(a));
    const captain = ranked[0]
      ? { name: ranked[0].web_name, gain: ranked[1] ? xpOverHorizon(ranked[0]) - xpOverHorizon(ranked[1]) : 0 }
      : null;
    const flagged = squad.players.filter((p) => p.status && p.status !== "a");
    /* The upgrade must be one the auto-build would itself take, or CHECKS contradicts the button. Same
       constraints: affordable, same position, not already owned, not excluded, club limit respected, and
       the incoming player must actually be expected to start. */
    const left = bank(squad);
    const owned = new Set(squad.players.map((x) => x.fpl_id));
    const excluded = new Set(ignores);
    const clubCounts = new Map();
    for (const x of squad.players) clubCounts.set(x.team_id, (clubCounts.get(x.team_id) || 0) + 1);
    const startsEnough = (q) => {
      const sp = model.startProbOf ? model.startProbOf(q) : null;
      return sp === null || sp >= 0.55;
    };
    let upgrade = null;
    for (const p of xi) {
      if (locks.includes(p.fpl_id)) continue;
      for (const q of pool) {
        if (q.position !== p.position || owned.has(q.fpl_id) || excluded.has(q.fpl_id)) continue;
        if (Number(q.price) - Number(p.price) > left + 1e-9) continue;
        if (q.team_id !== p.team_id && (clubCounts.get(q.team_id) || 0) >= RULES.maxPerClub) continue;
        if (!startsEnough(q)) continue;
        const gain = xpOverHorizon(q) - xpOverHorizon(p);
        if (gain > 0.05 && (!upgrade || gain > upgrade.gain)) upgrade = { out: p.web_name, in: q.web_name, gain };
      }
    }
    const best = structureScores && structureScores.length ? structureScores[0] : null;
    const cur = (structureScores || []).find((x) => x.key === squad.structure);
    const shape = best && cur && best.key !== squad.structure && best.score !== null && cur.score !== null
      ? { key: best.key, current: squad.structure, gain: best.score - cur.score } : null;
    return { captain, risk: { count: flagged.length, names: flagged.map((x) => x.web_name).join(", ") },
      budget: { left, upgrade }, shape };
  }, [ctx, squad, pool, xpOverHorizon, structureScores, ignores, locks, model]);

  /* CANONICAL GAMEWEEK KEYS.
   *
   * A plan's weeks are keyed "1" to "38" and the API rejects anything else outright, so a single stray
   * key makes the whole draft unsaveable: you build a squad, press Save, and get "invalid gameweek key
   * 0" with no way to clear it from the interface. This normalises on the way in and on the way out, so
   * a draft that already carries a bad key is repaired the next time it is opened and saved rather than
   * staying stuck. */
  const canonicalWeeks = (weeks, base = null) => {
    const squadIds = base ? new Set(base.map((player) => Number(player.fpl_id))) : null;
    const out = {};
    for (const [key, row] of Object.entries(weeks || {})) {
      const gw = Number(key);
      if (!Number.isInteger(gw) || gw < 1 || gw > 38) continue;

      /* A week that names a line-up has to name THIS squad. Transfer a player out and every week that
         still lists him describes a fifteen you no longer own, which the API rejects outright: you make
         one transfer and the whole draft stops saving with a wall of red about players and formations.
         Those weeks are dropped, because a line-up built around a player you have sold says nothing.
         Weeks holding only a chip or a note are untouched. */
      const merged = { ...(out[String(gw)] || {}), ...(row || {}) };
      if (squadIds && Array.isArray(merged.startingIds) && merged.startingIds.length) {
        const named = [...merged.startingIds, ...(merged.benchOrder || [])].map(Number);
        const describesThisSquad = named.length > 0 && named.every((id) => squadIds.has(id));
        if (!describesThisSquad) continue;
      }
      out[String(gw)] = merged;
    }
    return out;
  };

  const chipForGameweek = (gameweek) =>
    (planWeeks[gameweek] || planWeeks[String(gameweek)] || {}).chip || null;
  const mergeWeeklyDecisions = (current, weekly) => {
    const next = { ...(current || {}) };
    for (const week of weekly || []) {
      const gw = Number(week.gw);
      if (!Number.isInteger(gw) || gw < 1 || gw > 38) continue;
      next[String(gw)] = {
        ...(next[String(gw)] || {}),
        structure: week.formation,
        startingIds: (week.starters || []).map((player) => Number(player.fpl_id)),
        benchOrder: [...(week.bench_order || [])],
        captain: week.captain,
        vice: week.vice_captain,
      };
    }
    return canonicalWeeks(next);
  };
  const applyBuiltRange = (result) => {
    const players = [...result.xi, ...result.bench];
    setSquad((current) => ({
      ...current,
      structure: result.formation,
      players,
      captain: result.captain,
      vice: result.vice,
    }));
    setPlanWeeks((current) => mergeWeeklyDecisions(current, result.weekly));
  };
  /* The range in words, used on the button and in every message it produces, so the label always says
     which gameweeks the answer covers. */
  const rangeLabel = gwTo === gwFrom ? `GW${gwFrom}` : `GW${gwFrom}-GW${gwTo}`;

  const runRangeBuild = async (keep = []) => {
    const chipSchedule = {};
    for (let gameweek = gwFrom; gameweek <= gwTo; gameweek += 1) {
      const chip = chipForGameweek(gameweek);
      if (chip) chipSchedule[gameweek] = chip;
    }
    return fetch("/api/exact-squad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gw_from: gwFrom,
        gw_to: gwTo,
        budget: RULES.budget,
        minimum_bench_spend: appliedMinimumBenchSpend,
        chip_schedule: chipSchedule,
        locks,
        keep,
        ignores,
        only_formation: formationLocked ? squad.structure : null,
      }),
    }).then((response) => response.json())
      .catch(() => ({ ok: false, error: "The exact optimiser request failed." }));
  };

  /* OPTIMISE XI keeps the owned 15, but stores a different legal XI, formation and armbands for every GW. */
  /* ONE ACTION, NOT THREE.
   *
   * There used to be three: Build Squad on an empty squad, Fill Gaps on a partial one and Improve on a
   * full one, plus a separate Optimise XI. They all reached the same solver and the difference between
   * them was never visible in the label, so it was not obvious which one recalculated what. Optimise XI
   * only reshuffled the fifteen you already had, which the full solve does anyway as part of its answer.
   *
   * This is the whole thing now: take the gameweek range, the chips and the bench floor, and solve for
   * the best fifteen over that span. Locked players are carried through, so locking is how you say
   * "keep this one" rather than it being implied by whatever happened to be on the pitch. */
  const doRebuild = async () => {
    try {
      if (!ctx || !pool.length) return;
      const result = await runRangeBuild([]);
      if (!result.ok) return say(result.error, true);
      if (result.solver?.status !== "OPTIMAL" || result.solver?.optimality_proven !== true || result.solver?.mip_gap !== 0) return say("Global optimality was not proven.", true);
      snapshot();
      applyBuiltRange(result);
      const kept = locks.length ? ` ${locks.length} locked kept.` : "";
      say(`Best squad for ${rangeLabel}: ${result.xp.toFixed(1)} xP, ${result.cost.toFixed(1)} spent, ${result.formation}.${kept}`);
    } catch (error) { say(`Build failed: ${error.message}`, true); }
  };


    const maybes = React.useMemo(() => pool.filter((p) => maybeIds.includes(p.fpl_id)), [pool, maybeIds]);
  const ignoredPlayers = React.useMemo(() => pool.filter((p) => ignores.includes(p.fpl_id)), [pool, ignores]);
  const toggleMaybe = (p) => setMaybeIds((l) => (l.includes(p.fpl_id) ? l.filter((x) => x !== p.fpl_id) : [...l, p.fpl_id]));
  const toggleIgnore = (p) => setIgnores((l) => (l.includes(p.fpl_id) ? l.filter((x) => x !== p.fpl_id) : [...l, p.fpl_id]));
  const toggleLock = (p) => setLocks((l) => (l.includes(p.fpl_id) ? l.filter((x) => x !== p.fpl_id) : [...l, p.fpl_id]));

  const doAutoComplete = () => {
    if (!ctx) return;
    const before = squad.players.length;
    const next = autoComplete(squad, pool, ctx.scoreOf);
    setSquad(next);
    const added = next.players.length - before;
    say(added > 0 ? `${added} slot${added === 1 ? "" : "s"} filled.` : "Nothing left to fill.", added === 0);
  };

  // B-16: three GW1 variants, saved as drafts so they compare side by side on the same readouts.

  // Copy Analyst Payload: everything a model needs about this squad, as text, at no running cost.
  const copyPayload = async () => {
    if (!ctx || !model) return;
    const text = [
      payloadBrief(),
      buildPayload({
        squad, pool, scoreOf: ctx.scoreOf, metricName: metricName(model.gateOpen),
        evaluation, scores, oppOf, scale, gateOpen: model.gateOpen, fitted: FITTED,
      }),
      maybesBlock({ maybes, scoreOf: ctx.scoreOf }),
      alternativesBlock({ pool, scoreOf: ctx.scoreOf, squad }),
    ].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      say("Payload copied. Paste it into your Claude project.");
    } catch {
      say("Could not reach the clipboard. Check the browser permission.", true);
    }
  };

  const saveDraft = async () => {
    // DECISIONS 6.15: no completeness requirement, no blocking validation. An empty draft saves.
    setSaving(true);
    const payload = {
      name: draftName || `${squad.structure} draft`,
      mode: "free",
      squad: {
        structure: squad.structure, captain: squad.captain, vice: squad.vice,
        // Saved with the draft so reopening it restores exactly what was excluded and shortlisted.
        ignores, maybeIds, locks, formationLocked,
        picks: squad.players.map((p) => ({ fpl_id: p.fpl_id, starting: p.starting, position: p.position })),
      },
      evalCache: evaluation ? { points: evaluation.points, risks: evaluation.risk.count, bank: evaluation.structure.bank } : null,
    };
    try {
      const r = await fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setDraftName("");
      loadDrafts();
      const n = squad.players.length;
      say(n === RULES.size ? "Draft saved, squad complete." : `Draft saved with ${n} of ${RULES.size} picked.`);
    } catch (e) {
      say(e.message || "The draft could not be saved.", true);
    } finally {
      setSaving(false);
    }
  };



  const hydrate = React.useCallback((draft) => {
    const byId = new Map(pool.map((p) => [p.fpl_id, p]));
    const s = draft.squad || {};
    const players = (s.picks || [])
      .map((pick) => { const p = byId.get(pick.fpl_id); return p ? { ...p, starting: Boolean(pick.starting) } : null; })
      .filter(Boolean);
    return { structure: s.structure || "3-5-2", captain: s.captain ?? null, vice: s.vice ?? null, players,
      ignores: s.ignores || [], maybeIds: s.maybeIds || [], locks: s.locks || [], formationLocked: Boolean(s.formationLocked) };
  }, [pool]);

  const loadDraft = (draft) => {
    const s = hydrate(draft);
    const saved = ((draft.squad || {}).picks || []).length;
    if (saved > s.players.length) {
      // Silently returning a short squad is worse than saying what happened.
      say(`${saved - s.players.length} of ${saved} picks are no longer in the league and were dropped.`, true);
    }
    if (s.players.length !== ((draft.squad && draft.squad.picks) || []).length) say("Some players in that draft are no longer in the database.", true);
    setSquad({ structure: s.structure, captain: s.captain, vice: s.vice, players: s.players });
    setIgnores(s.ignores); setMaybeIds(s.maybeIds); setLocks(s.locks); setFormationLocked(s.formationLocked);
    setUndoState(null);
    say(`${draft.name} loaded onto the pitch.`);
  };


  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || !ctx) {
    return (
      <div data-zeus-ui-version="core-restoration-v3" className="zeus-builder-workspace" style={{ gap: S.gap }}>
        <Skeleton h={560} /><Skeleton h={560} />
      </div>
    );
  }

  const slotPos = activeSlot;


  return (
    <div data-zeus-ui-version="core-restoration-v3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ONE SHELF, TWO DENSE ROWS.
          The plan dropdown, the chip gameweek select, the three chip buttons and the bench-spend panel
          each used to own a full-width row, which is what put the pitch at 466px on desktop and 962px
          on a phone. They now share two rows, and the explanatory sentences live in title tooltips
          rather than in wrapped 280px and 320px spans. Every control is unchanged and still mounted. */}
      <ControlShelf ariaLabel="Builder controls">
      <section className="zeus-builder-toolbar" aria-label="Builder actions">
        <select value={planId ? String(planId) : ""}
          aria-label="Select saved draft"
          className="zeus-toolbar-select zeus-plan-select"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) { setPlanId(null); setPlanName(""); setPlanWeeks({}); setSquad(emptySquad("3-5-2")); setLocks([]); setIgnores([]); setMaybeIds([]); say("New draft."); return; }
            openPlan(savedPlans.find((x) => String(x.id) === v));
          }}
          style={{ padding: "0 12px", background: T.card,
            border: `1px solid ${planId ? T.green : T.line}`, color: "#FFFFFF", ...lang(13.5, 700), outline: "none" }}>
          <option value="" style={{ background: T.card }}>NEW DRAFT</option>
          {savedPlans.map((pl) => (
            <option key={pl.id} value={String(pl.id)} style={{ background: T.card }}>
              {pl.name} · {(pl.base || []).length}/{RULES.size}
            </option>
          ))}
        </select>

        <button onClick={doRebuild} className="fb-press zeus-toolbar-button"
          data-zeus-feature="builder-solve-v4"
          title="Solves for the best fifteen across the selected gameweeks, using the chips and the bench floor set below. Locked players are kept."
          style={{ background: T.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, ...lang(13, 700, "#04130A") }}>
          <Wand2 size={15} color="#04130A" />
          BUILD BEST SQUAD · {rangeLabel}
          {locks.length ? ` · ${locks.length} LOCKED` : ""}
        </button>

        <button onClick={undo} disabled={!undoState} className="fb-press zeus-toolbar-button"
          style={{ background: T.card, border: `1px solid ${T.line}`, ...lang(13, 700), opacity: undoState ? 1 : 0.45 }}>
          UNDO
        </button>

        <button onClick={() => { snapshot(); setSquad(emptySquad(squad.structure || "3-5-2")); setPlanWeeks({}); setLocks([]); say("Squad cleared."); }}
          disabled={!squad.players.length} className="fb-press zeus-toolbar-button"
          style={{ background: T.card, border: `1px solid ${T.line}`, opacity: squad.players.length ? 1 : 0.45, ...lang(13, 700) }}>
          CLEAR
        </button>

        <input value={planName || draftName}
          onChange={(e) => { setPlanName(e.target.value); setDraftName(e.target.value); }}
          placeholder={planId ? "PLAN NAME" : "NAME THIS PLAN"}
          className="zeus-toolbar-input zeus-plan-name"
          style={{ background: T.card, border: `1px solid ${T.line}`, padding: "0 12px", outline: "none", ...lang(13.5) }} />

        <button onClick={copyPayload} className="fb-press zeus-toolbar-button zeus-copy-button"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: T.row, border: `1px solid ${T.line}`, ...lang(13, 700) }}>
          COPY PAYLOAD
        </button>

        <button onClick={duplicatePlan} disabled={saving || !squad.players.length} className="fb-press zeus-toolbar-button"
          title="Saves everything on screen as a new draft, leaving the one you opened untouched."
          style={{ background: T.card, border: `1px solid ${T.line}`, opacity: squad.players.length ? 1 : 0.45, ...lang(13, 700) }}>
          DUPLICATE
        </button>

        <button onClick={() => savePlan()} disabled={saving} className="fb-press zeus-toolbar-button"
          style={{ background: T.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, ...lang(13, 700, "#04130A") }}>
          <Save size={15} /> {saving ? "SAVING" : "SAVE PLAN"}
        </button>

        <span className="zeus-toolbar-plate">
          <Plate w={88} h={S.ctrl} size={13} color={bank(squad) < 0 ? T.pink : T.green}>{bank(squad).toFixed(1)} left</Plate>
        </span>
      </section>

      <section className="zeus-control-strip" aria-label="Builder settings">
        <GameweekRange from={gwFrom} to={gwTo} min={firstGw} max={lastGw} compact
          onChange={setRange}
          description="Player xPTS, Build Squad, Improve and Optimise XI all use this exact total." />

        <label className="zeus-strip-field" aria-label="Select chip gameweek"
          title="The gameweek the selected chip is played in.">
          <span style={code(12)}>CHIP GW</span>
          <select value={chipGw} onChange={(event) => setChipGw(Number(event.target.value))}
            aria-label="Chip gameweek"
            className="zeus-strip-select"
            style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
            {Array.from({ length: gwTo - gwFrom + 1 }, (_, index) => gwFrom + index).map((gameweek) => (
              <option key={gameweek} value={gameweek} style={{ background: T.card }}>GW{gameweek}</option>
            ))}
          </select>
        </label>

        <ChipControls compact chip={activeChip} onChange={toggleChip} gw={chipGw} disabled={!squad.players.length} />

        {/* AUTO-BUILD &amp; XI OPTIMISER. The panel was ~180px of prose wrapping one toggle and one
            number field. The same sentences are now the tooltip on this group: it is used by Build
            Best Squad, it controls the optimised xPTS preview, and Manual picks are not changed until
            that action runs. */}
        <div className="zeus-bench-inline" aria-label="Auto-build minimum bench spend"
          title={minimumBenchSpendEnabled
            ? `AUTO-BUILD & XI OPTIMISER is ON · Optional minimum total cost for the four bench players. Auto-build and XI optimisation require at least £${benchBudget.toFixed(1)}m on the bench; spending more is allowed. Used by Build Best Squad, and it controls the optimised xPTS preview. Manual picks are not changed until you apply Build Best Squad.`
            : "AUTO-BUILD & XI OPTIMISER is OFF · Optional minimum total cost for the four bench players. Auto-build and XI optimisation use no custom minimum bench spend. Used by Build Best Squad, and it controls the optimised xPTS preview. Manual picks are not changed until you apply Build Best Squad."}
          style={{ border: `1px solid ${minimumBenchSpendEnabled ? T.green : T.line}` }}>
          <label className="zeus-bench-toggle"
            style={{ background: minimumBenchSpendEnabled ? T.green : T.plate,
              border: `1px solid ${minimumBenchSpendEnabled ? T.green : T.line}`,
              ...lang(12.5, 800, minimumBenchSpendEnabled ? "#04130A" : "#FFFFFF") }}>
            <input
              type="checkbox"
              checked={minimumBenchSpendEnabled}
              onChange={(event) => setMinimumBenchSpendEnabled(event.target.checked)}
              aria-label="Apply minimum bench spend to auto-build and XI optimiser"
              style={{ width: 16, height: 16, margin: 0, accentColor: T.green, cursor: "pointer" }}
            />
            BENCH {minimumBenchSpendEnabled ? "ON" : "OFF"}
          </label>
          <label htmlFor="bench-budget" style={code(12)} title="Minimum total cost of the four bench players, in millions.">MIN £</label>
          <input
            id="bench-budget"
            type="number"
            min="0"
            max={RULES.budget}
            step="0.5"
            value={benchBudget}
            disabled={!minimumBenchSpendEnabled}
            aria-disabled={!minimumBenchSpendEnabled}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setBenchBudget(Math.max(0, Math.min(RULES.budget, value)));
            }}
            className="zeus-bench-number"
            style={{ background: T.row, border: `1px solid ${minimumBenchSpendEnabled ? T.green : T.line}`,
              color: "#FFFFFF", opacity: minimumBenchSpendEnabled ? 1 : 0.45, ...lang(13, 700) }}
          />
        </div>
      </section>
      </ControlShelf>
      {squad.players.length > 0 && (
        <ProjectedScoreBreakdown breakdown={selectedBreakdown} metric={metricName(model.gateOpen)} />
      )}

        <div className="zeus-builder-workspace" style={{ gap: S.gap, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
            {(

              <>
                {horizonTotals && (
                  <section style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <XpBox label={metricName(model.gateOpen)} gross={selectedTotal} tone={T.xp} />
                    {[["NEXT 3", horizonTotals.three], ["NEXT 6", horizonTotals.six]].map(([label, v]) => (
                      <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center",
                        gap: 4, background: T.plate, borderRadius: 12, padding: "9px 16px", minWidth: 92 }}>
                        <span style={code(13)}>{label}</span>
                        <span style={val(17)}>{v.toFixed(1)}</span>
                      </div>
                    ))}
                    <span style={{ ...lang(13, 600), alignSelf: "center" }}>
                      Includes the active chip for its selected gameweek
                    </span>
                  </section>
                )}
                {replacing && (
                  <Notice tone="active" label="Swap in progress"
                    action={<NoticeButton onClick={() => setReplacing(null)} label="Cancel the swap">CANCEL</NoticeButton>}>
                    Swapping {replacing.web_name}. Pick an outlined player, an empty slot, or anyone from the list below.
                  </Notice>
                )}
                <ShortlistPanel maybes={maybes} ignored={ignoredPlayers} xpOf={xpOf}
                  onRemoveMaybe={toggleMaybe} onRemoveIgnore={toggleIgnore} />
                <BuilderPitch captainMultiplier={pitchCaptainMultiplier} locks={locks} fill
                  structures={STRUCTURES} onStructure={setStructure}
                  shapeLocked={formationLocked} onShapeLock={() => setFormationLocked((v) => !v)} xpTotal={selectedTotal} squad={squad} scoreOf={xpOverHorizon} metricName={metricName(model.gateOpen)} oppOf={oppOf} scale={scale}
                  activeSlot={slotPos}
                  onSlotClick={setActiveSlot}
                  onOpenPlayer={(p) => {
                    if (!replacing) return setMenuFor(p);
                    if (p.fpl_id === replacing.fpl_id) return setReplacing(null);
                    if (p.position !== replacing.position || Boolean(p.starting) === Boolean(replacing.starting)) return;
                    snapshot(); swap(replacing, p); setReplacing(null);
                    say(`${p.web_name} replaces ${replacing.web_name}.`);
                  }}
                  selectedId={replacing ? replacing.fpl_id : (menuFor ? menuFor.fpl_id : null)}
                  swapTargets={replacing
                    ? squad.players.filter((x) => x.position === replacing.position && Boolean(x.starting) !== Boolean(replacing.starting)).map((x) => x.fpl_id)
                    : []} />

                {/* Always present. Clicking an empty slot narrows it to that position; otherwise it shows
                    everyone, which is what "the full player selection underneath" means. */}
                  <Candidates pos={replacing ? replacing.position : (slotPos || "ANY")} pool={pool} squad={squad} scoreOf={xpOverHorizon} bandOf={ctx.bandOf}
                    gateOpen={model.gateOpen} onAdd={add} max={maxScore} oppOf={oppOf} scale={scale} xpOf={xpOf} run5Of={run5Of}
                    gwFrom={gwFrom} gwTo={gwTo} firstGw={firstGw} maxGw={lastGw}
                    xpRange={xpOverHorizon} showGameweekRange={false}
                    clubs={core ? Object.values(core.teamById).sort((a,b)=>(a.name||"").localeCompare(b.name||"")) : []} />
              </>
            )}
          </div>

          {evaluation && (
            <Checks captain={checks && checks.captain} risk={checks && checks.risk}
                budget={checks && checks.budget} shape={checks && checks.shape}
                metric={metricName(model.gateOpen)} />
          )}
        </div>
      {menuFor && (
        <div onClick={() => setMenuFor(null)} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6,0,10,0.62)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.row, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 22, width: 344, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Kit team={menuFor.team} size={26} />
                <div>
                  <div style={lang(18, 700)}>{menuFor.web_name}</div>
                  <div style={{ marginTop: 3, ...code(13) }}>{menuFor.team} · {POS_LABEL[menuFor.position]}</div>
                </div>
              </div>
              <button onClick={() => setMenuFor(null)} className="fb-press" style={{ width: S.ctrl, height: S.ctrl, borderRadius: 17, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} color="#FFFFFF" />
              </button>
            </div>
            <FixtureRun fixtures={nextFixtures(core.fixtures, core.teamById, menuFor.team_id, 5)} scale={scale} n={5}
              xpOf={(gw) => model.scoreForGw(menuFor, gw)} />
            <button onClick={() => { setSquad((s) => ({ ...s, captain: menuFor.fpl_id, vice: s.vice === menuFor.fpl_id ? null : s.vice })); setMenuFor(null); say(`${menuFor.web_name} is captain.`); }}
              className="fb-press" style={{ height: S.btn, borderRadius: S.radiusSm, background: T.tag, ...lang(14.5, 700, T.onTag) }}>
              MAKE CAPTAIN
            </button>
            <button onClick={() => { setSquad((s) => ({ ...s, vice: menuFor.fpl_id, captain: s.captain === menuFor.fpl_id ? null : s.captain })); setMenuFor(null); say(`${menuFor.web_name} is vice.`); }}
              className="fb-press" style={{ height: S.btn, borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`, ...lang(14.5, 700) }}>
              MAKE VICE
            </button>
                <button onClick={() => { setReplacing(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}`,
            ...lang(14.5, 700) }}>
              SWAP
            </button>
            <a href={`/player/${menuFor.fpl_id}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: S.ctrl,
                padding: "0 16px", borderRadius: S.radiusSm, background: T.plate, textDecoration: "none",
                ...lang(13.5, 700) }}>
              PLAYER PAGE
            </a>
            <button onClick={() => { snapshot(); toggleLock(menuFor); setMenuFor(null);
                say(locks.includes(menuFor.fpl_id) ? `${menuFor.web_name} unlocked.` : `${menuFor.web_name} locked into the XI.`); }}
              className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm,
                background: locks.includes(menuFor.fpl_id) ? T.lock : T.card,
                border: `1px solid ${locks.includes(menuFor.fpl_id) ? T.lock : T.line}`,
                ...lang(14.5, 700, locks.includes(menuFor.fpl_id) ? "#0D0014" : undefined) }}>
              {locks.includes(menuFor.fpl_id) ? "UNLOCK" : "LOCK INTO XI"}
            </button>
            <button onClick={() => { toggleMaybe(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm, background: T.card, border: `1px solid ${maybeIds.includes(menuFor.fpl_id) ? T.cyan : T.line}`, ...lang(14.5, 700) }}>
              {maybeIds.includes(menuFor.fpl_id) ? "REMOVE FROM SHORTLIST" : "ADD TO SHORTLIST"}
            </button>
            <button onClick={() => { toggleIgnore(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm, background: ignores.includes(menuFor.fpl_id) ? T.pink : T.card,
                border: `1px solid ${ignores.includes(menuFor.fpl_id) ? T.pink : T.line}`, ...lang(14.5, 700) }}>
              {ignores.includes(menuFor.fpl_id) ? "STOP IGNORING" : "IGNORE IN AUTO-BUILD"}
            </button>
            <button onClick={() => remove(menuFor)} className="fb-press"
              style={{ height: S.btn, borderRadius: S.radiusSm, background: "#3A0217", ...lang(14.5, 700, T.pink) }}>
              REMOVE FROM SQUAD
            </button>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
