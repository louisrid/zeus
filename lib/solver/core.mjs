// Pure solver logic. No JSON imports, no browser APIs, no AI clients — so it runs identically
// inside the Next bundle and inside the Node test suite. The ruleset limits arrive as R, built
// once by lib/solver/squad.js from config/rules-2026-27.json.

export function limitsFrom(rulesJson) {
  const v = (node) => (node && typeof node === "object" && "value" in node ? node.value : node);
  return {
    size: v(rulesJson.squad.size),
    composition: v(rulesJson.squad.composition),
    budget: v(rulesJson.squad.budget_millions),
    maxPerClub: v(rulesJson.squad.max_per_club),
    startingXI: v(rulesJson.squad.starting_xi),
    formation: v(rulesJson.squad.formation_minimums),
    hitCost: v(rulesJson.transfers.hit_cost),
    tripleCaptain: v(rulesJson.chips.triple_captain_multiplier),
  };
}

const round1 = (x) => +Number(x).toFixed(1);
const round2 = (x) => +Number(x).toFixed(2);
const POS = ["GKP", "DEF", "MID", "FWD"];

export function makeOps(R) {
  /* Every legal shape, derived from the formation minimums rather than listed as magic numbers. */
  const STRUCTURES = (() => {
    const f = R.formation;
    const out = [];
    const outfield = R.startingXI - f.GKP_exact;
    for (let d = f.DEF_min; d <= R.composition.DEF; d++) {
      for (let m = f.MID_min; m <= R.composition.MID; m++) {
        const fw = outfield - d - m;
        if (fw < f.FWD_min || fw > R.composition.FWD) continue;
        out.push({ key: `${d}-${m}-${fw}`, DEF: d, MID: m, FWD: fw, GKP: f.GKP_exact });
      }
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  })();

  const structureByKey = (key) => STRUCTURES.find((s) => s.key === key) || STRUCTURES[0];
  const emptySquad = (structureKey) => ({
    structure: structureKey && structureByKey(structureKey).key === structureKey ? structureKey : STRUCTURES[0].key,
    players: [],
    captain: null,
    vice: null,
  });

  const spend = (squad) => round1(squad.players.reduce((s, p) => s + Number(p.price || 0), 0));
  const bank = (squad) => round1(R.budget - spend(squad));
  const countPos = (squad, pos) => squad.players.filter((p) => p.position === pos && p.starting).length;
  const squadCountPos = (squad, pos) => squad.players.filter((p) => p.position === pos).length;
  const clubCount = (squad, teamId) => squad.players.filter((p) => p.team_id === teamId).length;
  const xi = (squad) => squad.players.filter((p) => p.starting);
  const benchOf = (squad) => squad.players.filter((p) => !p.starting);

  /* Can this player be added? Plain-language reason when not. */
  function canAdd(squad, player) {
    if (squad.players.some((p) => p.fpl_id === player.fpl_id)) {
      return { ok: false, reason: `${player.web_name} is already in this squad.` };
    }
    if (squad.players.length >= R.size) {
      return { ok: false, reason: `The squad is full at ${R.size} players.` };
    }
    if (squadCountPos(squad, player.position) >= R.composition[player.position]) {
      return { ok: false, reason: `You already have ${R.composition[player.position]} in that position.` };
    }
    if (clubCount(squad, player.team_id) >= R.maxPerClub) {
      return { ok: false, reason: `Three from ${player.team} is the limit.` };
    }
    if (Number(player.price) > bank(squad) + 1e-9) {
      return { ok: false, reason: `${player.web_name} costs more than the ${bank(squad).toFixed(1)} you have left.` };
    }
    return { ok: true };
  }

  function addPlayer(squad, player) {
    const st = structureByKey(squad.structure);
    const starting = countPos(squad, player.position) < st[player.position];
    return { ...squad, players: [...squad.players, { ...player, starting }] };
  }

  function removePlayer(squad, fplId) {
    return {
      ...squad,
      players: squad.players.filter((p) => p.fpl_id !== fplId),
      captain: squad.captain === fplId ? null : squad.captain,
      vice: squad.vice === fplId ? null : squad.vice,
    };
  }

  /* Bench to XI swap, same position only (the drag-and-drop contract in 03 §3.2). */
  function swapStarter(squad, benchId, starterId) {
    const b = squad.players.find((p) => p.fpl_id === benchId);
    const s = squad.players.find((p) => p.fpl_id === starterId);
    if (!b || !s || b.position !== s.position || b.starting === s.starting) return squad;
    return {
      ...squad,
      players: squad.players.map((p) =>
        p.fpl_id === benchId ? { ...p, starting: true } : p.fpl_id === starterId ? { ...p, starting: false } : p
      ),
    };
  }

  /* Re-seat the eleven when the shape changes: keep the strongest legal set. */
  function applyStructure(squad, structureKey, scoreOf) {
    const st = structureByKey(structureKey);
    const byPos = { GKP: [], DEF: [], MID: [], FWD: [] };
    for (const p of squad.players) byPos[p.position].push(p);
    for (const pos of POS) byPos[pos].sort((a, b) => scoreOf(b) - scoreOf(a));
    const startingIds = new Set();
    for (const pos of POS) byPos[pos].slice(0, st[pos]).forEach((p) => startingIds.add(p.fpl_id));
    return {
      ...squad,
      structure: st.key,
      players: squad.players.map((p) => ({ ...p, starting: startingIds.has(p.fpl_id) })),
    };
  }

  const cheapestByPos = (pool) => {
    const out = {};
    for (const p of pool) {
      const cur = out[p.position];
      if (cur === undefined || Number(p.price) < cur) out[p.position] = Number(p.price);
    }
    return out;
  };

  /* Remaining budget for one more player of `pos`, reserving the minimum price of every other
     slot still to fill. Shared by AUTO-COMPLETE and the candidate list so both agree. */
  function envelopeFor(squad, pos, pool) {
    const cheapest = cheapestByPos(pool);
    let reserve = 0;
    for (const other of POS) {
      const missing = R.composition[other] - squadCountPos(squad, other);
      const count = other === pos ? missing - 1 : missing;
      if (count > 0) reserve += count * (cheapest[other] ?? 0);
    }
    return round1(bank(squad) - Math.max(0, reserve));
  }

  /* AUTO-COMPLETE (03 §3.2): best score affordable per slot while reserving the rest.
     Pure arithmetic, deterministic, no AI. */
  function autoComplete(squad, pool, scoreOf) {
    let next = { ...squad, players: [...squad.players] };
    const gaps = () => {
      const out = [];
      for (const pos of POS) {
        const missing = R.composition[pos] - squadCountPos(next, pos);
        for (let i = 0; i < missing; i++) out.push(pos);
      }
      return out;
    };
    let guard = 0;
    while (gaps().length && guard++ < R.size * 3) {
      const pos = gaps()[0];
      const budget = envelopeFor(next, pos, pool);
      const candidates = pool
        .filter(
          (p) =>
            p.position === pos &&
            Number(p.price) <= budget + 1e-9 &&
            !next.players.some((x) => x.fpl_id === p.fpl_id) &&
            clubCount(next, p.team_id) < R.maxPerClub
        )
        .sort((a, b) => scoreOf(b) - scoreOf(a));
      if (!candidates.length) break;
      next = addPlayer(next, candidates[0]);
    }
    return applyStructure(next, next.structure, scoreOf);
  }

  function bestCaptain(squad, scoreOf, tailOf) {
    const starters = xi(squad);
    if (!starters.length) return null;
    return [...starters].sort((a, b) => {
      const d = scoreOf(b) - scoreOf(a);
      if (Math.abs(d) > 1e-9) return d;
      return tailOf ? (tailOf(b) || 0) - (tailOf(a) || 0) : 0;
    })[0];
  }

  /* Bench order: floor first, goalkeeper always in the first bench slot. */
  function benchOrder(squad, floorOf) {
    const b = benchOf(squad);
    const gk = b.filter((p) => p.position === "GKP");
    const rest = b.filter((p) => p.position !== "GKP").sort((a, c) => floorOf(c) - floorOf(a));
    return [...gk, ...rest];
  }

  const isComplete = (squad) =>
    squad.players.length === R.size && POS.every((pos) => squadCountPos(squad, pos) === R.composition[pos]);

  /* Legality of a finished squad, reported as a list rather than a boolean so the UI can name
     exactly what is wrong. */
  function violations(squad) {
    const out = [];
    if (spend(squad) > R.budget + 1e-9) out.push(`Over budget by ${(spend(squad) - R.budget).toFixed(1)}.`);
    for (const pos of POS) {
      if (squadCountPos(squad, pos) > R.composition[pos]) out.push(`Too many in ${pos}.`);
    }
    const clubs = new Map();
    for (const p of squad.players) clubs.set(p.team_id, (clubs.get(p.team_id) || 0) + 1);
    for (const [, n] of clubs) if (n > R.maxPerClub) out.push(`More than ${R.maxPerClub} from one club.`);
    const st = structureByKey(squad.structure);
    if (xi(squad).length > R.startingXI) out.push("More than eleven starters.");
    for (const pos of POS) {
      if (countPos(squad, pos) > st[pos]) out.push(`Too many ${pos} in the eleven for ${st.key}.`);
    }
    return out;
  }

  return {
    STRUCTURES, structureByKey, emptySquad, spend, bank, countPos, squadCountPos, clubCount,
    xi, benchOf, canAdd, addPlayer, removePlayer, swapStarter, applyStructure, envelopeFor,
    autoComplete, bestCaptain, benchOrder, isComplete, violations,
  };
}

/* Evaluation services (01 §3.5): the Builder's exact four readouts plus transfer comparison.
   Arithmetic over stored engine output only. */
export function makeEval(R, ops) {
  /* ① PROJECTED POINTS over a 1-12 gameweek horizon. */
  function projectedPoints(squad, horizon, { scoreOf, bandOf, perGw }) {
    const starters = ops.xi(squad);
    let mean = 0;
    let p10 = 0;
    let p90 = 0;
    let extrapolated = false;
    for (const p of starters) {
      const rows = perGw && perGw.get ? perGw.get(p.fpl_id) : null;
      for (let h = 0; h < horizon; h++) {
        const row = rows ? rows[h] : null;
        if (row) {
          mean += Number(row.ep_mean) || 0;
          p10 += Number(row.p10) || 0;
          p90 += Number(row.p90) || 0;
        } else {
          const b = bandOf(p);
          mean += scoreOf(p);
          p10 += b.p10;
          p90 += b.p90;
          if (h > 0 || !rows) extrapolated = extrapolated || horizon > 1;
        }
      }
    }
    // The armband doubles its holder for the first gameweek of the horizon, using the stored
    // projection for that gameweek where one exists rather than the fallback score.
    const cap = squad.captain
      ? starters.find((p) => p.fpl_id === squad.captain)
      : ops.bestCaptain(squad, scoreOf, null);
    if (cap) {
      const rows = perGw && perGw.get ? perGw.get(cap.fpl_id) : null;
      const first = rows && rows[0] ? rows[0] : null;
      if (first) {
        mean += Number(first.ep_mean) || 0;
        p10 += Number(first.p10) || 0;
        p90 += Number(first.p90) || 0;
      } else {
        const b = bandOf(cap);
        mean += scoreOf(cap);
        p10 += b.p10;
        p90 += b.p90;
      }
    }
    return { mean: round1(mean), p10: round1(p10), p90: round1(p90), horizon, extrapolated };
  }

  /* ② CAPTAINCY STRENGTH. */
  function captaincy(squad, { scoreOf, tailOf, bandOf }) {
    const starters = ops.xi(squad);
    if (!starters.length) return null;
    const ranked = [...starters]
      .map((p) => ({ p, ev: round2(scoreOf(p) * 2), tail: tailOf ? tailOf(p) : null, band: bandOf(p) }))
      .sort((a, b) => b.ev - a.ev);
    const chosen = squad.captain ? ranked.find((r) => r.p.fpl_id === squad.captain) : null;
    return { best: chosen || ranked[0], chosen: chosen || null, set: Boolean(chosen), ranked: ranked.slice(0, 6) };
  }

  /* ③ RISK FLAGS. */
  function riskFlags(squad, { minutes }) {
    const out = [];
    for (const p of squad.players) {
      if (p.status && p.status !== "a") {
        const kind =
          p.status === "i" ? "injured" : p.status === "s" ? "suspended" : p.status === "d" ? "doubt" : "unavailable";
        out.push({
          player: p,
          kind,
          detail: p.chance_of_playing === null || p.chance_of_playing === undefined ? null : `${p.chance_of_playing}% chance`,
        });
        continue;
      }
      const m = minutes && minutes.get ? minutes.get(p.fpl_id) : null;
      if (m && m.p_start !== null && m.p_start !== undefined && Number(m.p_start) < 0.7) {
        out.push({ player: p, kind: "rotation", detail: `${Math.round(Number(m.p_start) * 100)}% to start` });
      }
    }
    const rank = { injured: 0, suspended: 1, unavailable: 2, doubt: 3, rotation: 4 };
    out.sort((a, b) => rank[a.kind] - rank[b.kind]);
    return { count: out.length, items: out };
  }

  /* ④ STRUCTURE: budget spread and bench quality. */
  function structureReadout(squad, { floorOf }) {
    const byPos = {};
    for (const pos of POS) {
      const group = squad.players.filter((p) => p.position === pos);
      byPos[pos] = {
        count: group.length,
        of: R.composition[pos],
        spend: round1(group.reduce((s, p) => s + Number(p.price || 0), 0)),
      };
    }
    const b = ops.benchOf(squad);
    return {
      byPos,
      spend: ops.spend(squad),
      bank: ops.bank(squad),
      benchSpend: round1(b.reduce((s, p) => s + Number(p.price || 0), 0)),
      benchQuality: b.length ? round2(b.reduce((s, p) => s + floorOf(p), 0) / b.length) : 0,
      premiums: squad.players.filter((p) => Number(p.price) >= 9).length,
      complete: ops.isComplete(squad),
    };
  }

  const evaluateSquad = (squad, horizon, ctx) => ({
    points: projectedPoints(squad, horizon, ctx),
    captaincy: captaincy(squad, ctx),
    risk: riskFlags(squad, ctx),
    structure: structureReadout(squad, ctx),
    bench: ops.benchOrder(squad, ctx.floorOf),
    squad: squad.players,
  });

  /* Transfer comparison: same-position replacements ranked by net squad delta. */
  function replacements(squad, outPlayer, pool, ctx, limit = 8) {
    const budget = round1(ops.bank(squad) + Number(outPlayer.price || 0));
    const owned = new Set(squad.players.map((p) => p.fpl_id));
    const base = ctx.scoreOf(outPlayer);
    const clubs = {};
    for (const p of squad.players) {
      if (p.fpl_id === outPlayer.fpl_id) continue;
      clubs[p.team_id] = (clubs[p.team_id] || 0) + 1;
    }
    return pool
      .filter(
        (p) =>
          p.position === outPlayer.position &&
          !owned.has(p.fpl_id) &&
          Number(p.price) <= budget + 1e-9 &&
          (clubs[p.team_id] || 0) < R.maxPerClub
      )
      .map((p) => ({
        player: p,
        delta: round2(ctx.scoreOf(p) - base),
        band: ctx.bandOf(p),
        priceDelta: round1(Number(p.price) - Number(outPlayer.price)),
        bankAfter: round1(budget - Number(p.price)),
      }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, limit);
  }

  /* A hit is only worth taking when the horizon gain clears the cost by the calibrated margin.
     The threshold is a calibration output and is passed in, never assumed. */
  const hitWorthIt = (deltaOverHorizon, threshold) =>
    threshold === null || threshold === undefined ? null : deltaOverHorizon + R.hitCost >= threshold;

  return { projectedPoints, captaincy, riskFlags, structureReadout, evaluateSquad, replacements, hitWorthIt };
}
