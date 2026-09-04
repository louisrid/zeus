"use client";
import React from "react";
import { ArrowLeftRight } from "lucide-react";
import { loadCore } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { T, Kit, SkeletonRows, ErrorCard, Label, lang, val, code } from "../../lib/ui";
import ControlShelf from "../../components/ControlShelf";
import Notice from "../../components/Notice";
import PlayerMultiSelect from "../../components/PlayerMultiSelect";
import MetricFilters from "../../components/MetricFilters";
import { passesConditions } from "../../components/MetricFilters";
import { SORT_KEYS } from "../../lib/sorting.mjs";
import DEFCON from "../../config/defcon-2026-27.mjs";
import { squadAt, transferLedger, PLAN_RULES } from "../../lib/plan.mjs";
import { transferBudget, changeLevels } from "../../lib/transfer-budget.mjs";
import { EXTERNAL_XPTS_GW_TO } from "../../lib/external_xpts.mjs";

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


/* One player inside a move, drawn as the same card as the fifteen above it: team coloured shirt, name,
   club, price and the same range xPTS. The solver's diff carries only an id, a name and a price, so the
   player is looked up in the live list first. Without that lookup every shirt renders in the fallback
   colour and the club line is blank, which is exactly what it did before this. */
function MoveCard({ player, tone, points }) {
  return (
    <div className="zeus-transfer-move-card" style={{ background: T.card, border: `1px solid ${tone}` }}>
      <Kit team={player.team} size={30} />
      <span className="zeus-transfer-card-name" style={lang(13, 700)}>{player.web_name || player.name}</span>
      <span style={lang(12, 600)}>{player.team}</span>
      <span style={val(12.5)}>{Number(player.price).toFixed(1)}</span>
      <span style={val(12.5, T.xp)}>{points === null || points === undefined ? "-" : points.toFixed(1)}</span>
    </div>
  );
}

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
  /* TWO WAYS TO ASK, because they answer different questions.
     "ladder" walks one, two and three changes and answers whether a hit is worth taking.
     A number answers "what are my choices for one transfer", which the ladder cannot do at all: it
     only ever held a single one-change answer. */
  const [compare, setCompare] = React.useState("ladder");
  const [optionCount, setOptionCount] = React.useState(4);
  const [sell, setSell] = React.useState([]);
  /* Players the search may never buy. Same mechanism as selling, because both mean the same thing to
     the solver: this player may not appear in the answer. The difference is only who they are. A sale
     is someone you own, so he has to leave and he counts towards the change total. An exclusion is
     usually someone you do not own, so he simply never arrives and costs nothing. Name someone you do
     own and he is treated as a sale, because refusing to hold him and refusing to sell him cannot both
     be true. */
  /* Named by id rather than typed as free text. The old box took a comma-separated list and answered
     "No player matches X. Check the spelling, or add the club in brackets", which is a spelling test
     nobody should have to sit: the app knows every name already. */
  const [banIds, setBanIds] = React.useState([]);
  /* Players the answer MUST contain. The screen could say "never him" and had no way at all to say
     "him": a target could only be reached by hoping the solver agreed. The solver has taken a keep list
     all along; nothing on this page ever sent one. */
  const [mustBuyIds, setMustBuyIds] = React.useState([]);
  /* THE SAME CONDITIONS THE PLAYERS TABLE USES, POINTED AT THE SEARCH.
   *
   * Naming players one at a time only expresses a shortlist. A rule like "no defender under ten DEFCON
   * per ninety" is a different question, and the only way to ask it was to open the Players page, read
   * the answer, come back and type each name into NEVER BUY. Conditions are evaluated here and every
   * player who fails them is barred from the search, so the rule constrains the result rather than
   * describing it. */
  const [conditions, setConditions] = React.useState([]);
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
      /* THE SQUAD YOU ACTUALLY OWN BELONGS AT THE TOP OF THIS LIST.
       *
       * This read body.plans only, and the API returns the live team separately under body.live, so
       * the one squad a transfer is genuinely being planned for was the one squad missing from the
       * dropdown. It is listed first, and only once it holds players, so it is never an empty entry. */
      const live = body.live && Array.isArray(body.live.base) && body.live.base.length
        ? [{ ...body.live, name: body.live.name || "My team" }]
        : [];
      const saved = [...live, ...(body.plans || [])];
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
    return weeks.length
      ? { first: Math.min(...weeks), last: Math.min(EXTERNAL_XPTS_GW_TO, Math.max(...weeks)) }
      : { first: 1, last: 1 };
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

  React.useEffect(() => { setSell([]); setBanIds([]); setMustBuyIds([]); setResult(null); }, [selectedId]);

  /* The ban list is ids now, so there is nothing to resolve and nothing to misspell. It is still shaped
     the same way for the rest of the page, and `unknown` stays as an empty list rather than being
     removed, because the only thing that could populate it was a typed name. */
  const banned = React.useMemo(() => {
    if (!core || !banIds.length) return { ids: [], names: [], unknown: [] };
    const byId = new Map(core.players.map((player) => [Number(player.fpl_id), player]));
    const ids = [];
    const names = [];
    for (const id of banIds) {
      const hit = byId.get(Number(id));
      if (!hit) continue;
      ids.push(Number(hit.fpl_id));
      names.push(`${hit.web_name} (${hit.team})`);
    }
    return { ids: [...new Set(ids)], names, unknown: [] };
  }, [banIds, core]);

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

  /* The metrics a condition can be written against, matching the Players table so a rule means the same
     thing on both screens. DEFCON reads null rather than zero for a player with no meaningful rate, so a
     keeper is excluded by a DEFCON rule rather than counting as the worst possible defender. */
  const defconById = React.useMemo(() => new Map(DEFCON.rows.map((row) => [Number(row.fpl_id), row])), []);
  const readers = React.useMemo(() => ({
    PRICE: (player) => Number(player.price),
    XPTS: rangePoints,
    VALUE: (player) => {
      const points = rangePoints(player);
      const price = Number(player.price);
      return points === null || !price ? null : points / price;
    },
    FORM: (player) => (player.form === null || player.form === undefined ? null : Number(player.form)),
    GAMETIME: (player) => {
      const start = model ? model.startProbOf(player) : null;
      return start === null ? null : start * 100;
    },
    OWNERSHIP: (player) => (player.own === null || player.own === undefined ? null : Number(player.own)),
    DEFCON: (player) => defconById.get(Number(player.fpl_id))?.per90 ?? null,
  }), [rangePoints, model, defconById]);

  /* Everyone the conditions rule out. These join the ban list, so a rule narrows what the solver may buy
     rather than merely describing what it returned. Players already owned are never barred by a rule: a
     condition is about what to sign, and barring somebody you hold would force a sale nobody asked for. */
  const ruledOut = React.useMemo(() => {
    if (!core || !conditions.length) return [];
    const owned = new Set((squad ? squad.players : []).map((player) => Number(player.fpl_id)));
    return core.players
      .filter((player) => !owned.has(Number(player.fpl_id)))
      .filter((player) => !passesConditions(player, conditions, readers))
      .map((player) => Number(player.fpl_id));
  }, [core, conditions, readers, squad]);

  /* The solver returns a transfer diff, not player rows. Everything the card needs beyond the name and
     the price lives in the live list, so each side of a move is resolved back to it. */
  const liveById = React.useMemo(
    () => new Map((core ? core.players : []).map((player) => [Number(player.fpl_id), player])),
    [core],
  );
  const hydrate = React.useCallback(
    (row) => ({ ...(liveById.get(Number(row.fpl_id)) || {}), ...row, team: (liveById.get(Number(row.fpl_id)) || {}).team || row.team }),
    [liveById],
  );

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
      /* Named targets are forced into the answer. Anyone already owned is simply kept. */
      keep: mustBuyIds,
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

  /* PROGRESSIVE RESULTS.
   *
   * The four searches run at once, but each one is drawn the moment it lands rather than the page
   * sitting blank until the slowest finishes. The change limit is what makes this slow: a fifteen built
   * from nothing solves in about a quarter of a second, and the same problem with "at least twelve of
   * these exact players must survive" takes several, because that one rule cuts off the easy answer and
   * forces the solver to prove its way there. Nothing can be shaved off that without giving up the proof,
   * so the wait is spent showing answers instead of hiding them. */
  const findTransfers = async () => {
    if (!squad || squad.players.length !== PLAN_RULES.squadSize) {
      setMessage("A complete fifteen is needed before a transfer can be worked out.");
      return;
    }
    /* A name that matched nobody stops the search rather than being quietly dropped. Carrying on would
       hand back an answer that looks like it honoured the ban when it did not, which is worse than
       refusing. The Letta tool refuses on the same condition, so the two cannot disagree. */
    if (banned.unknown.length) {
      setMessage(`No player matches ${banned.unknown.join(", ")}. Check the spelling, or add the club in brackets.`);
      return;
    }
    setWorking(true);
    setMessage(null);
    const owned = new Set((squad ? squad.players : []).map((player) => Number(player.fpl_id)));
    /* Everything barred goes to the solver. Only the barred players actually in the squad raise the
       change floor, because only they have to be sold to satisfy the ban. */
    /* Sold, barred by name, and ruled out by a condition all mean the same thing to the solver: not
       available to buy. They are kept apart above so the reasons stay legible, and joined only here. */
    const ignoreList = [...new Set([...sell, ...banned.ids, ...ruledOut])];
    const forcedOut = ignoreList.filter((id) => owned.has(id));
    const fixed = compare === "ladder" ? 0 : Number(compare);
    const floor = Math.max(1, forcedOut.length);
    if (fixed && fixed < floor) {
      setWorking(false);
      setMessage(`${fixed} change${fixed === 1 ? "" : "s"} is impossible: ${floor} player${floor === 1 ? " has" : "s have"} to leave because you marked or barred them.`);
      return;
    }
    const levels = fixed
      ? Array.from({ length: optionCount }, () => fixed)
      : changeLevels(forcedOut.length, PLAN_RULES.squadSize);
    const holdShape = mode === "shape" ? scoreInPlace([], []) : null;
    setResult({
      range: { from: gwFrom, to: gwTo },
      mode,
      fixed,
      free: freeTransfers,
      forcedOut: sell.length,
      banned: banned.names,
      pending: levels.length,
      options: [],
      refused: [],
    });

    /* The baseline is asked for WITHOUT the sale list. Holding the fifteen while excluding one of them
       has no legal answer, and that single mistake is what made every option read as infeasible. */
    const holdPromise = askSolver(0, []);
    const hold = await holdPromise;
    if (!hold || !hold.ok) {
      setWorking(false);
      setResult(null);
      setMessage(hold && hold.error ? hold.error : "The transfer search did not finish.");
      return;
    }
    const baseline = Number(hold.xp ?? 0);

    const record = (level, answer, rank) => {
      setResult((current) => {
        if (!current) return current;
        const pending = Math.max(0, current.pending - 1);
        if (!answer || !answer.ok || !answer.transfers || !answer.transfers.count) {
          return { ...current, pending, refused: [...current.refused, level] };
        }
        const hit = Math.max(0, level - freeTransfers) * PLAN_RULES.hitCost;
        const inPlace = mode === "shape" ? scoreInPlace(answer.transfers.out, answer.transfers.in) : null;
        const gross = mode === "shape" && inPlace !== null && holdShape !== null
          ? inPlace - holdShape
          : Number(answer.xp ?? 0) - baseline;
        const option = {
          key: `${level}-${rank}`,
          changes: level,
          hit,
          gross,
          net: gross - hit,
          out: answer.transfers.out,
          in: answer.transfers.in,
          bank: Number(answer.money_in_bank ?? 0),
        };
        const options = [...current.options, option].sort((first, second) => second.net - first.net);
        return { ...current, pending, options };
      });
    };

    if (fixed) {
      /* Each alternative is found by taking the best answer, barring the players it brought in, and
         asking again, so the options are genuinely different moves rather than the same one reworded.
         That makes them sequential: every search depends on the one before it. Each still draws the
         moment it lands. */
      const alreadySuggested = [];
      for (let rank = 0; rank < levels.length; rank += 1) {
        const answer = await askSolver(fixed, [...ignoreList, ...alreadySuggested]);
        record(fixed, answer, rank);
        if (!answer || !answer.ok || !answer.transfers || !answer.transfers.count) break;
        alreadySuggested.push(...answer.transfers.in.map((player) => Number(player.fpl_id)));
      }
      setResult((current) => (current ? { ...current, pending: 0 } : current));
    } else {
      await Promise.all(levels.map(async (level, rank) => {
        const answer = await askSolver(level, ignoreList);
        record(level, answer, rank);
      }));
    }
    setWorking(false);
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
            {/* Raising OVER past TO used to leave TO behind. The TO list only offers weeks at or after OVER, so
                its stale value matched no option and the browser displayed the first one instead: the screen
                read GW4 to GW4 while the state was still GW4 to GW1, and the search was refused as an
                inverted range with nothing on screen to show why. TO is carried up with OVER, and a stale
                refusal is cleared so a corrected range stops showing an old error. */}
            <select value={gwFrom} onChange={(event) => {
              const next = Number(event.target.value);
              setGwFrom(next);
              if (gwTo < next) setGwTo(next);
              setResult(null);
              setMessage(null);
            }}
              aria-label="From gameweek" className="zeus-strip-select"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
              {weeks.map((week) => <option key={week} value={week} style={{ background: T.card }}>GW{week}</option>)}
            </select>
          </label>
          <label className="zeus-strip-field">
            <span style={code(12)}>TO</span>
            <select value={gwTo} onChange={(event) => {
              setGwTo(Math.max(Number(event.target.value), gwFrom));
              setResult(null);
              setMessage(null);
            }}
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

          <label className="zeus-strip-field"
            title="Compare one, two and three changes to judge whether a hit is worth taking. Or fix the number of changes to see several different ways of making exactly that many transfers.">
            <span style={code(12)}>SHOW</span>
            <select value={compare} onChange={(event) => { setCompare(event.target.value); setResult(null); }}
              aria-label="What to compare" className="zeus-strip-select"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
              <option value="ladder" style={{ background: T.card }}>1, 2 AND 3 CHANGES</option>
              <option value="1" style={{ background: T.card }}>WAYS TO MAKE 1 CHANGE</option>
              <option value="2" style={{ background: T.card }}>WAYS TO MAKE 2 CHANGES</option>
              <option value="3" style={{ background: T.card }}>WAYS TO MAKE 3 CHANGES</option>
            </select>
          </label>

          {compare !== "ladder" && (
            <label className="zeus-strip-field"
              title="Each extra option is another search, so six take roughly twice as long as three.">
              <span style={code(12)}>HOW MANY</span>
              <select value={optionCount} onChange={(event) => { setOptionCount(Number(event.target.value)); setResult(null); }}
                aria-label="How many options" className="zeus-strip-select"
                style={{ background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700) }}>
                {[2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count} style={{ background: T.card }}>{count}</option>
                ))}
              </select>
            </label>
          )}

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
          {banned.names.length > 0 && (
            <span className="zeus-strip-field">
              <span style={code(12)}>NEVER BUY</span>
              <span style={lang(13, 700)}>{banned.names.join(", ")}</span>
            </span>
          )}
          {banned.unknown.length > 0 && (
            <span className="zeus-strip-field">
              <span style={code(12, T.pink)}>NOT A PLAYER</span>
              <span style={lang(13, 700, T.pink)}>{banned.unknown.join(", ")}</span>
            </span>
          )}
        </div>
      </ControlShelf>

      {message && <Notice tone="risk" label="Transfers" onDismiss={() => setMessage(null)}>{message}</Notice>}

      {!squad && plans.length === 0 && (
        <Notice label="Transfers">Save a squad first. The planner works on a squad you already own.</Notice>
      )}

      {squad && (
        <section aria-label="Search rules"
          style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14,
            background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radiusSm }}>
          {/* THE FIFTEEN ARE NOT A CONTROL SURFACE.
              This page used to print every player you own as a card you had to tap to say he could go,
              which is fifteen decisions to express one and a wall of shirts between you and the search.
              You already know your squad; the page does not need to recite it. What it needs is a way to
              say who may leave, who must arrive, who may never arrive, and what a signing has to be
              worth. That is four controls, and they read the same metrics the Players table does, so a
              rule means the same thing on both pages. */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            <PlayerMultiSelect label="SELL" pool={squad.players} value={sell}
              onChange={(next) => { setSell(next.map(Number)); setResult(null); setMessage(null); }}
              placeholder="Name a player to sell" tone={T.pink}
              emptyHint="Nobody forced out." />
            <PlayerMultiSelect label="MUST BUY" pool={core ? core.players : []} value={mustBuyIds}
              onChange={(next) => { setMustBuyIds(next.map(Number)); setResult(null); setMessage(null); }}
              placeholder="Name a player to sign" tone={T.green}
              emptyHint="Search picks freely." />
            <PlayerMultiSelect label="NEVER BUY" pool={core ? core.players : []} value={banIds}
              onChange={(next) => { setBanIds(next.map(Number)); setResult(null); setMessage(null); }}
              placeholder="Name a player to bar" tone={T.pink}
              emptyHint="Everyone available." />
          </div>

          <MetricFilters conditions={conditions} setConditions={setConditions} metrics={SORT_KEYS}
            label="A SIGNING MUST MEET" />
          {ruledOut.length > 0 && (
            <span style={{ ...lang(12.5, 600), opacity: 0.85 }}>
              {ruledOut.length} player{ruledOut.length === 1 ? "" : "s"} ruled out by these conditions.
              Players you already own are never barred by a rule.
            </span>
          )}
        </section>
      )}

      {result && (
        <section className="zeus-transfer-results" aria-label="Best transfers">
          <div className="zeus-transfer-instruction">
            <Label>
              {result.fixed
                ? `${result.fixed === 1 ? "Ways to make one change" : `Ways to make ${result.fixed} changes`}, GW${result.range.from} to GW${result.range.to}`
                : `Best moves, GW${result.range.from} to GW${result.range.to}`}
            </Label>
            <span style={lang(13, 600)}>
              {result.banned && result.banned.length > 0 ? `Never buying ${result.banned.join(", ")}. ` : ""}
              {result.fixed
                ? "Each option bars the players the one above it brought in, so these are genuinely different moves. "
                : ""}
              Ranked by what is left after the hit. {result.mode === "shape"
                ? "Each incoming player is scored in the exact place of the player he replaces."
                : "The eleven is rebuilt every week, so these figures assume the side is managed weekly."}
            </span>
          </div>

          {result.options.map((option) => (
            <div key={option.key || option.changes} className="zeus-transfer-move">
              <div className="zeus-transfer-move-head">
                <span style={code(12.5, option.net > 0 ? T.green : T.pink)}>
                  {option.changes} CHANGE{option.changes === 1 ? "" : "S"}{option.hit ? ` · HIT -${option.hit}` : " · FREE"}
                </span>
                <span className="zeus-transfer-net">
                  <span style={val(18, option.net > 0 ? T.green : T.pink)}>
                    {option.net > 0 ? "+" : ""}{option.net.toFixed(2)}
                  </span>
                  <span style={code(12)}>
                    NET, GW{result.range.from}{result.range.to === result.range.from ? "" : ` TO GW${result.range.to}`}
                  </span>
                </span>
              </div>

              {/* Out on the left, in on the right, as the same cards used for the fifteen above, so the
                  swap reads as a swap rather than as a sentence to be parsed. */}
              <div className="zeus-transfer-swap">
                <div className="zeus-transfer-side">
                  <span style={code(12, T.pink)}>OUT</span>
                  <div className="zeus-transfer-side-cards">
                    {option.out.map((player) => (
                      <MoveCard key={`out-${player.fpl_id}`} player={hydrate(player)} tone={T.pink}
                        points={rangePoints(hydrate(player))} />
                    ))}
                  </div>
                </div>
                <span className="zeus-transfer-arrow" aria-hidden="true">
                  <ArrowLeftRight size={16} color={T.green} />
                </span>
                <div className="zeus-transfer-side">
                  <span style={code(12, T.green)}>IN</span>
                  <div className="zeus-transfer-side-cards">
                    {option.in.map((player) => (
                      <MoveCard key={`in-${player.fpl_id}`} player={hydrate(player)} tone={T.green}
                        points={rangePoints(hydrate(player))} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Net only. The figure before the hit is not a number anyone acts on, and printing both
                  invited reading the bigger one. */}
              <span style={lang(12, 600)}>
                {option.hit ? `Costs a ${option.hit} point hit. ` : "Free transfer. "}
                £{option.bank.toFixed(1)}m left in the bank.
              </span>
            </div>
          ))}

          {result.pending > 0 && (
            <span style={code(12, T.tag)}>
              SEARCHING {result.pending} MORE
            </span>
          )}

          {result.pending === 0 && result.options.length === 0 && (
            <Notice label="Best transfers">
              Nothing beats holding over GW{result.range.from} to GW{result.range.to}. Keep the fifteen you have.
            </Notice>
          )}

          {result.pending === 0 && result.options.length > 0 && result.options[0].net <= 0 && (
            <span style={lang(12.5, 600, T.pink)}>
              Nothing here pays for itself once the hit is counted. Holding is the better move.
            </span>
          )}

          {result.pending === 0 && result.refused.length > 0 && (
            <span style={lang(12.5, 600)}>
              No legal squad exists at {result.refused.sort((a, b) => a - b).join(" or ")} change{result.refused.length === 1 && result.refused[0] === 1 ? "" : "s"} with the money available.
            </span>
          )}
        </section>
      )}

    </div>
  );
}
