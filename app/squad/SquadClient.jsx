"use client";
import React from "react";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { S, Skeleton, ErrorCard } from "../../lib/ui";
import PlanList from "../../components/PlanList";
import PlanTimeline from "../../components/PlanTimeline";
import TransferPicker from "../../components/TransferPicker";
import { squadAt as planSquadAt, PLAN_RULES } from "../../lib/plan.mjs";

/* THE SQUAD SCREEN.
 *
 * This screen does exactly two things: list every plan, and show one plan's gameweek timeline. Nothing
 * else. It is how plans are reached, which is why the Drafts tab was removed from the Builder.
 *
 * It previously also rendered a full squad dashboard whenever a plan of record existed: a team-ID
 * connect box, a chip planner listing blanks and doubles for clubs Louis does not own, a live feedback
 * rail and a replacement drawer. None of that was asked for on this page, and the plan list sat BEHIND
 * it, so building a draft made the screen revert to the thing the plan list was meant to replace.
 * Deleted rather than moved: chips already live on the timeline, per gameweek, which is the only place
 * chip timing means anything.
 */
export default function SquadClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const [plans, setPlans] = React.useState(null);
  const [livePlan, setLivePlan] = React.useState(null);
  const [planError, setPlanError] = React.useState(null);

  const [openPlan, setOpenPlan] = React.useState(null);
  const [timelineGw, setTimelineGw] = React.useState(1);
  const [transferFor, setTransferFor] = React.useState(null);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then((c) => { setCore(c); return loadModel(c).then(setModel); })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const loadPlans = React.useCallback(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setPlanError(j.error); setPlans([]); return; }
        setPlanError(null); setPlans(j.plans || []); setLivePlan(j.live || null);
      })
      .catch(() => { setPlanError("Plans could not be loaded."); setPlans([]); });
  }, []);
  React.useEffect(() => { loadPlans(); }, [loadPlans]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);

  // The timeline ends where the published fixtures end. Planning past them would invent certainty.
  const maxPlanGw = React.useMemo(() => {
    if (!core) return 1;
    const gws = (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite);
    return gws.length ? Math.max(...gws) : 1;
  }, [core]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const g = Number(new URLSearchParams(window.location.search).get("gw"));
    if (g >= 1) setTimelineGw(g);
  }, []);

  // A linked or refreshed timeline URL opens straight to that plan.
  React.useEffect(() => {
    if (openPlan || plans === null || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("plan");
    if (!id) return;
    const all = [...(plans || []), ...(livePlan ? [livePlan] : [])];
    const row = all.find((x) => String(x.id) === String(id));
    if (row) setOpenPlan(row);
  }, [plans, livePlan, openPlan]);

  const gotoGw = (g) => {
    if (!openPlan) return;
    const next = Math.max(1, Math.min(maxPlanGw, g));
    setTimelineGw(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/squad?plan=${openPlan.id}&gw=${next}`);
    }
  };

  // Plans store team_id; the shirt needs the club's short name.
  const clubOf = React.useCallback((teamId) => {
    const t = core && core.teamById ? core.teamById[teamId] : null;
    return t ? t.short_name : null;
  }, [core]);

  const priceOf = React.useCallback((id) => {
    if (!core) return null;
    const p = core.players.find((x) => x.fpl_id === id);
    return p ? Number(p.price) : null;
  }, [core]);

  const fxFor = React.useCallback((p, gw) => {
    if (!core) return null;
    return nextFixtures(core.fixtures, core.teamById, p.team_id, 12).find((f) => f.gw === gw) || null;
  }, [core]);
  const xpFor = React.useCallback((p, gw) => (model ? model.scoreForGw(p, gw) : null), [model]);

  const writePlan = async (next) => {
    setOpenPlan(next);
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

  const patchWeek = (gw, patch) => {
    if (!openPlan) return;
    const weeks = { ...(openPlan.weeks || {}) };
    weeks[gw] = { ...(weeks[gw] || {}), ...patch };
    writePlan({ ...openPlan, weeks });
  };

  const planAction = async (action, plan) => {
    const r = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: plan.id }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "The request failed." }));
    if (!r.ok) { setPlanError(r.error); return; }
    setPlanError(null); loadPlans();
  };

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || plans === null) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: S.gap }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} h={320} />)}
      </div>
    );
  }

  if (openPlan) {
    const shaped = { ...openPlan, base: openPlan.base || [], weeks: openPlan.weeks || {} };
    return (
      <>
        {transferFor !== null && (() => {
          const state = planSquadAt(shaped, transferFor);
          const byId = new Map(core.players.map((pl) => [pl.fpl_id, pl]));
          const withDetail = state.players.map((pl) => ({ ...(byId.get(pl.fpl_id) || {}), ...pl }));
          const spend = withDetail.reduce((a, pl) => a + Number(pl.price || 0), 0);
          return (
            <TransferPicker squad={withDetail} pool={core.players} gw={transferFor}
              bank={PLAN_RULES.budget - spend} ignores={openPlan.ignores || []}
              xpOf={(pl) => model.scoreForGw(pl, transferFor)}
              onClose={() => setTransferFor(null)}
              onConfirm={(t) => {
                const weeks = { ...(openPlan.weeks || {}) };
                const wk = { ...(weeks[transferFor] || {}) };
                wk.transfers = [...(wk.transfers || []), t];
                weeks[transferFor] = wk;
                writePlan({ ...openPlan, weeks });
                setTransferFor(null);
              }} />
          );
        })()}
        <PlanTimeline plan={shaped} gw={timelineGw} maxGw={maxPlanGw} onGw={gotoGw}
          pool={core.players} livePlayers={core.players} scale={scale} fxFor={fxFor} xpFor={xpFor}
          onBack={() => {
            setOpenPlan(null);
            if (typeof window !== "undefined") window.history.replaceState(null, "", "/squad");
          }}
          onSetCaptain={(gw, id) => {
            const currentVice = (openPlan.weeks || {})[gw]?.vice ?? openPlan.vice;
            patchWeek(gw, { captain: id, vice: currentVice === id ? null : currentVice });
          }}
          onSetVice={(gw, id) => patchWeek(gw, { vice: id })}
          onSetChip={(gw, chip) => patchWeek(gw, { chip })}
          onTransfer={(gw) => setTransferFor(gw)}
          onUndoTransfer={(gw, i) => {
            const list = [...(((openPlan.weeks || {})[gw] || {}).transfers || [])];
            list.splice(i, 1);
            patchWeek(gw, { transfers: list });
          }} />
      </>
    );
  }

  return (
    <PlanList live={livePlan} plans={plans} entryId={livePlan ? livePlan.entry_id : 4812}
      priceOf={priceOf} clubOf={clubOf} error={planError} onConnect={loadPlans}
      onOpen={(pl) => {
        setOpenPlan(pl); setTimelineGw(1);
        if (typeof window !== "undefined") window.history.replaceState(null, "", `/squad?plan=${pl.id}&gw=1`);
      }}
      onActivate={(pl) => planAction("activate", pl)}
      onDelete={(pl) => planAction("delete", pl)} />
  );
}
