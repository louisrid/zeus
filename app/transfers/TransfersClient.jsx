"use client";
import React from "react";
import { ArrowLeftRight } from "lucide-react";
import { loadCore } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { T, Kit, SkeletonRows, ErrorCard, Label, lang, val, code } from "../../lib/ui";
import ControlShelf from "../../components/ControlShelf";
import Notice from "../../components/Notice";
import { squadAt, transferLedger, PLAN_RULES } from "../../lib/plan.mjs";
import { transferBudget, changeLevels } from "../../lib/transfer-budget.mjs";

/* THE TRANSFERS PAGE.
 *
 * One question, asked properly: given the fifteen I own, who should leave and who should replace them,
 * judged over a range of gameweeks and after any hit.
 *
 * SELLING IS THE ONLY SELECTION. Tap a player to mark him for sale, tap again to unmark him. Everyone
 * left alone simply stays. There is deliberately no protect control: two selection states on the same
 * fifteen meant every player carried a question, and the answer for almost all of them was always the
 * same one.
 *
 * A marked player is passed to the solver as an exclusion, so he cannot be bought back. Nobody else is
 * pinned, because the whole point of the second and third change is that the solver may sell someone
 * else to fund the player you actually want.
 *
 * WHAT USED TO GO WRONG, so it cannot come back:
 *   1. The baseline was asked for with the sale list attached. Keeping all fifteen while excluding one
 *      of them is impossible, so the baseline failed and took every option down with it. The baseline
 *      here is always asked for on its own.
 *   2. The change count was asked for below the number marked for sale. Also impossible. The count now
 *      starts at the number marked.
 *   3. The budget was a flat 100.0. See lib/transfer-budget.mjs.
 */

const SQUAD_ROWS = ["GKP", "DEF", "MID", "FWD"];
const POSITION_TITLE = { GKP: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };

export default function TransfersClient() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  const [plans, setPlans] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [message, setMessage] = React.useState(null);

  const [gwFrom, setGwFrom] = React.useState(1);
  const [gwTo, setGwTo] = React.useState(1);
  /* "rebuild" lets the solver pick a fresh eleven every week, which is the higher number but assumes the
     side is managed weekly. "shape" drops the incoming player into the outgoing player's exact place and
     leaves the rest of the plan alone. */
  const [mode, setMode] = React.useState("rebuild");
  const [sell, setSell] = React.useState([]);
  const [working, setWorking] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const load = React.useCallback(() => {
    setFailed(false);
    loadCore().then((loaded) => { setCore(loaded); return loadModel(loaded).then(setModel); })
      .catch(() => setFailed(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    fetch("/api/plans").then((response) => response.json()).then((body) => {
      if (!body.ok) { setMessage(body.error); setPlans([]); return; }
      const saved = body.plans || [];
      setPlans(saved);
      setSelectedId((current) => {
        if (saved.some((row) => String(row.id) === String(current))) return current;
        const active = saved.find((row) => row.is_active);
        return String((active || saved[0] || {}).id || "");
      });
    }).catch(() => { setMessage("Saved squads could not be loaded."); setPlans([]); });
  }, []);

  const bounds = React.useMemo(() => {
    const weeks = core ? (core.fixtures || []).map((fixture) => Number(fixture.gw)).filter(Number.isFinite) : [];
    return weeks.length ? { first: Math.min(...weeks), last: Math.min(8, Math.max(...weeks)) } : { first: 1, last: 1 };
  }, [core]);
  React.useEffect(() => {
    setGwFrom(bounds.first);
    setGwTo(Math.min(bounds.last, bounds.first + 4));
  }, [bounds.first, bounds.last]);

  const plan = (plans || []).find((row) => String(row.id) === String(selectedId)) || null;

  /* The fifteen, hydrated from the live player list. Purchase price is carried across from the plan,
     because the bank is the difference between what was paid and the starting 100.0. */
  const squad = React.useMemo(() => {
    if (!plan || !core) return null;
    const raw = squadAt({ ...plan, base: plan.base || [], weeks: plan.weeks || {} }, gwFrom);
    const byId = new Map(core.players.map((player) => [player.fpl_id, player]));
    const players = raw.players.map((row) => {
      const live = byId.get(row.fpl_id);
      if (!live) return null;
      return { ...live, starting: Boolean(row.starting), purchasePrice: Number(row.purchasePrice ?? row.price ?? live.price) };
    }).filter(Boolean);
    return { ...raw, players };
  }, [plan, core, gwFrom]);

  React.useEffect(() => { setSell([]); setResult(null); }, [selectedId]);

  const purse = transferBudget(squad ? squad.players : []);
  const freeTransfers = React.useMemo(() => {
    if (!plan) return PLAN_RULES.freePerGw;
    const rows = transferLedger({ ...plan, weeks: plan.weeks || {} }, gwFrom);
    const last = rows[rows.length - 1];
    return last ? Number(last.free ?? PLAN_RULES.freePerGw) : PLAN_RULES.freePerGw;
  }, [plan, gwFrom]);

  const chipSchedule = React.useMemo(() => {
    const weeks = (plan && plan.weeks) || {};
    const schedule = {};
    for (const key of Object.keys(weeks)) {
      const week = Number(key);
      if (week >= gwFrom && week <= gwTo && weeks[key] && weeks[key].chip) schedule[String(week)] = weeks[key].chip;
    }
    return schedule;
  }, [plan, gwFrom, gwTo]);

  const rangePoints = React.useCallback((player) => {
    if (!model) return null;
    let points = 0;
    for (let week = gwFrom; week <= gwTo; week += 1) points += Number(model.scoreForGw(player, week) ?? 0);
    return points;
  }, [model, gwFrom, gwTo]);

  const toggleSell = (id) => {
    setResult(null);
    setSell((current) => (current.includes(id) ? current.filter((each) => each !== id) : [...current, id]));
  };

  const askSolver = (maximumChanges, forcedOut) => fetch("/api/exact-squad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gw_from: gwFrom,
      gw_to: gwTo,
      /* Not a flat 100. What the fifteen are worth today, plus the bank. */
      budget: purse.budget,
      chip_schedule: chipSchedule,
      current_squad: (squad ? squad.players : []).map((player) => Number(player.fpl_id)),
      maximum_changes: maximumChanges,
      ignores: forcedOut,
      /* THE FOURTH WAY THIS SCREEN USED TO SAY "INFEASIBLE".
         The solver normally refuses to seat anyone the predicted line-ups leave out. That is right when
         building a squad from nothing and wrong here, because it makes a squad you already own illegal
         the moment one of your players is dropped, and the only thing you see is a solver error. The
         floor is lifted for this screen. It costs nothing: a player the line-ups leave out already
         scores zero, so the search sells him on his own merits rather than being forbidden to hold him. */
      minimum_start_probability: 0,
    }),
  }).then((response) => response.json()).catch(() => ({ ok: false, error: "The request did not complete." }));

  /* KEEP MY SHAPE.
   *
   * The solver answers "what is the best fifteen I can reach", and to do that it rewrites the eleven
   * every week. That is right if the side is managed weekly. If it is not, the figure overstates what
   * will actually be scored, because it assumes rotation that will not happen.
   *
   * So the same transfer is scored a second way: the incoming player takes the outgoing player's exact
   * place in every week already planned, starting when he started and benched when he was benched. The
   * incoming player is scored as himself from the live player list, not as a merge of the two. */
  const scoreInPlace = React.useCallback((out, incoming) => {
    if (!plan || !model || !squad || !core) return null;
    const queue = {};
    for (const arriving of incoming) {
      queue[arriving.position] = queue[arriving.position] || [];
      queue[arriving.position].push(arriving);
    }
    const replacement = new Map();
    for (const leaving of out) {
      const next = (queue[leaving.position] || []).shift();
      if (next) replacement.set(Number(leaving.fpl_id), next);
    }
    const byId = new Map(core.players.map((player) => [Number(player.fpl_id), player]));
    const fallbackStarters = squad.players.filter((player) => player.starting).map((player) => Number(player.fpl_id));
    let points = 0;
    for (let week = gwFrom; week <= gwTo; week += 1) {
      const stored = (plan.weeks || {})[String(week)] || (plan.weeks || {})[week] || {};
      const starters = (stored.startingIds && stored.startingIds.length ? stored.startingIds : fallbackStarters).map(Number);
      const captain = Number(stored.captain ?? squad.captain);
      const chip = stored.chip || null;
      for (const player of squad.players) {
        const id = Number(player.fpl_id);
        if (!starters.includes(id) && chip !== "benchboost") continue;
        const arriving = replacement.get(id);
        const scored = arriving ? (byId.get(Number(arriving.fpl_id)) || player) : player;
        points += Number(model.scoreForGw(scored, week) ?? 0) * (captain === id ? 2 : 1);
      }
    }
    return points;
  }, [plan, model, squad, core, gwFrom, gwTo]);

  const findTransfers = async () => {
    if (!squad || squad.players.length !== PLAN_RULES.squadSize) {
      setMessage("A complete fifteen is needed before a transfer can be worked out.");
      return;
    }
    setWorking(true);
    setMessage(null);
    setResult(null);
    const forcedOut = [...sell];
    const levels = changeLevels(forcedOut.length, PLAN_RULES.squadSize);
    /* The baseline is asked for WITHOUT the sale list. Holding the fifteen while excluding one of them
       has no legal answer, and that single mistake is what made every option read as infeasible. */
    const answers = await Promise.all([
      askSolver(0, []),
      ...levels.map((level) => askSolver(level, forcedOut)),
    ]);
    setWorking(false);
    const hold = answers[0];
    if (!hold || !hold.ok) {
      setMessage(hold && hold.error ? hold.error : "The transfer search did not finish.");
      return;
    }
    const baseline = Number(hold.xp ?? 0);
    const holdShape = mode === "shape" ? scoreInPlace([], []) : null;
    const options = levels.map((level, index) => {
      const answer = answers[index + 1];
      if (!answer || !answer.ok || !answer.transfers || !answer.transfers.count) return null;
      const hit = Math.max(0, level - freeTransfers) * PLAN_RULES.hitCost;
      const inPlace = mode === "shape" ? scoreInPlace(answer.transfers.out, answer.transfers.in) : null;
      const gross = mode === "shape" && inPlace !== null && holdShape !== null
        ? inPlace - holdShape
        : Number(answer.xp ?? 0) - baseline;
      return {
        changes: level,
        hit,
        gross,
        net: gross - hit,
        out: answer.transfers.out,
        in: answer.transfers.in,
        bank: Number(answer.money_in_bank ?? 0),
      };
    }).filter(Boolean).sort((first, second) => second.net - first.net).slice(0, 3);
    const refused = levels
      .map((level, index) => [level, answers[index + 1]])
      .filter(([, answer]) => !answer || !answer.ok);
    setResult({
      range: { from: gwFrom, to: gwTo },
      mode,
      free: freeTransfers,
      forcedOut: forcedOut.length,
      options,
      refused: refused.map(([level]) => level),
    });
  };

  if (failed) return <ErrorCard onRetry={load} />;
  if (!core || !model || plans === null) return <SkeletonRows n={5} />;

  const weeks = Array.from({ length: bounds.last - bounds.first + 1 }, (_, index) => bounds.first + index);
  const sellCount = sell.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ControlShelf ariaLabel="Transfer controls">
        <div className="zeus-control-strip">
          <label className="zeus-strip-field">
            <span style={code(12)}>SQUAD</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}
              aria-label="Select squad" className="zeus-strip-select"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
              {plans.length === 0 && <option value="" style={{ background: T.card }}>NO SAVED SQUADS</option>}
              {plans.map((row) => (
                <option key={row.id} value={row.id} style={{ background: T.card }}>{row.name}</option>
              ))}
            </select>
          </label>

          <label className="zeus-strip-field"
            title="The gameweeks the transfer is judged over. A move that is poor next week can still be the right move across five.">
            <span style={code(12)}>OVER</span>
            <select value={gwFrom} onChange={(event) => { setGwFrom(Number(event.target.value)); setResult(null); }}
              aria-label="From gameweek" className="zeus-strip-select"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
              {weeks.map((week) => <option key={week} value={week} style={{ background: T.card }}>GW{week}</option>)}
            </select>
          </label>
          <label className="zeus-strip-field">
            <span style={code(12)}>TO</span>
            <select value={gwTo} onChange={(event) => { setGwTo(Number(event.target.value)); setResult(null); }}
              aria-label="To gameweek" className="zeus-strip-select"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
              {weeks.filter((week) => week >= gwFrom).map((week) => (
                <option key={week} value={week} style={{ background: T.card }}>GW{week}</option>
              ))}
            </select>
          </label>

          <label className="zeus-strip-field"
            title="Rebuild lets the solver pick a fresh eleven every week, which is the higher number but assumes the side is managed weekly. Keep my shape drops the new player into the old player's exact place, starting when he started and benched when he was benched.">
            <span style={code(12)}>EACH WEEK</span>
            <select value={mode} onChange={(event) => { setMode(event.target.value); setResult(null); }}
              aria-label="Weekly rotation" className="zeus-strip-select"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
              <option value="rebuild" style={{ background: T.card }}>REBUILD THE XI</option>
              <option value="shape" style={{ background: T.card }}>KEEP MY SHAPE</option>
            </select>
          </label>

          <button type="button" onClick={findTransfers} disabled={working || !squad}
            aria-label="Work out the best transfer" className="fb-press zeus-transfer-go"
            style={{ background: squad ? T.green : T.card, border: `1px solid ${squad ? T.green : T.line}`,
              opacity: squad ? 1 : 0.45, ...lang(13, 700, squad ? "#04130A" : "#FFFFFF") }}>
            <ArrowLeftRight size={14} /> {working ? "WORKING" : "FIND TRANSFERS"}
          </button>
        </div>

        <div className="zeus-control-strip zeus-transfer-money" aria-label="Money available">
          <span className="zeus-strip-field">
            <span style={code(12)}>SQUAD VALUE</span>
            <span style={val(14)}>{purse.squadValue.toFixed(1)}</span>
          </span>
          <span className="zeus-strip-field">
            <span style={code(12)}>BANK</span>
            <span style={val(14)}>{purse.bank.toFixed(1)}</span>
          </span>
          <span className="zeus-strip-field">
            <span style={code(12, T.tag)}>BUDGET</span>
            <span style={val(14, T.tag)}>{purse.budget.toFixed(1)}</span>
          </span>
          <span className="zeus-strip-field">
            <span style={code(12)}>FREE TRANSFERS</span>
            <span style={val(14)}>{freeTransfers}</span>
          </span>
          <span className="zeus-strip-field">
            <span style={code(12)}>MARKED TO SELL</span>
            <span style={val(14, sellCount ? T.pink : "#FFFFFF")}>{sellCount}</span>
          </span>
        </div>
      </ControlShelf>

      {message && <Notice tone="risk" label="Transfers" onDismiss={() => setMessage(null)}>{message}</Notice>}

      {!squad && plans.length === 0 && (
        <Notice label="Transfers">Save a squad first. The planner works on a squad you already own.</Notice>
      )}

      {squad && (
        <section className="zeus-transfer-squad" aria-label="My fifteen">
          <div className="zeus-transfer-instruction">
            <Label>Tap a player to sell him</Label>
            <span style={lang(13, 600)}>
              Tap again to keep him. Everyone left alone stays. The search fills the places you empty, and may
              sell one more player to afford someone the money would not otherwise reach.
            </span>
          </div>

          {SQUAD_ROWS.map((position) => {
            const line = squad.players.filter((player) => player.position === position);
            if (!line.length) return null;
            return (
              <div key={position} className="zeus-transfer-line">
                <span style={code(12)}>{POSITION_TITLE[position]}</span>
                <div className="zeus-transfer-cards">
                  {line.map((player) => {
                    const id = Number(player.fpl_id);
                    const selling = sell.includes(id);
                    const points = rangePoints(player);
                    return (
                      <button key={id} type="button" onClick={() => toggleSell(id)}
                        aria-pressed={selling}
                        aria-label={`${player.web_name}, ${selling ? "marked to sell" : "staying"}`}
                        className="fb-press zeus-transfer-card"
                        style={{ background: selling ? "#3A0217" : T.card,
                          border: `1px solid ${selling ? T.pink : T.line}` }}>
                        <Kit team={player.team} size={34} />
                        <span className="zeus-transfer-card-name" style={lang(13.5, 700)}>{player.web_name}</span>
                        <span style={lang(12, 600)}>{player.team}</span>
                        <span style={val(12.5)}>{Number(player.price).toFixed(1)}</span>
                        <span style={val(13, T.xp)}>{points === null ? "-" : points.toFixed(1)}</span>
                        <span style={code(12, selling ? T.pink : T.tag)}>{selling ? "SELLING" : "STAYING"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {result && (
        <section className="zeus-transfer-results" aria-label="Best transfers">
          <div className="zeus-transfer-instruction">
            <Label>Best moves, GW{result.range.from} to GW{result.range.to}</Label>
            <span style={lang(13, 600)}>
              Ranked by what is left after the hit. {result.mode === "shape"
                ? "Each incoming player is scored in the exact place of the player he replaces."
                : "The eleven is rebuilt every week, so these figures assume the side is managed weekly."}
            </span>
          </div>

          {result.options.length === 0 && (
            <Notice label="Best transfers">
              Nothing beats holding over GW{result.range.from} to GW{result.range.to}. Keep the fifteen you have.
            </Notice>
          )}

          {result.options.map((option) => (
            <div key={option.changes} className="zeus-transfer-option">
              <span style={code(12, option.net > 0 ? T.green : T.pink)}>
                {option.changes} CHANGE{option.changes === 1 ? "" : "S"}{option.hit ? ` · HIT -${option.hit}` : " · FREE"}
              </span>
              <span style={lang(13.5, 700)}>
                {option.out.map((player) => player.name || player.fpl_id).join(", ")}
                {" to "}
                {option.in.map((player) => player.name || player.fpl_id).join(", ")}
              </span>
              <span style={val(14, option.net > 0 ? T.green : T.pink)}>
                {option.net > 0 ? "+" : ""}{option.net.toFixed(2)}
              </span>
              <span style={lang(12, 600)}>
                {option.gross.toFixed(2)} xPTS gained{option.hit ? `, ${option.hit} paid for the hit` : ""}, {option.bank.toFixed(1)} left in the bank
              </span>
            </div>
          ))}

          {result.options.length > 0 && result.options[0].net <= 0 && (
            <span style={lang(12.5, 600, T.pink)}>
              Nothing here pays for itself once the hit is counted. Holding is the better move.
            </span>
          )}

          {result.refused.length > 0 && (
            <span style={lang(12.5, 600)}>
              No legal squad exists at {result.refused.join(" or ")} change{result.refused.length === 1 && result.refused[0] === 1 ? "" : "s"} with the money available.
            </span>
          )}
        </section>
      )}
    </div>
  );
}
