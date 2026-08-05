const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rounded = (value) => Math.round(finite(value) * 10) / 10;
export const idOf = (value) => Number(value?.fpl_id ?? value?.element ?? value?.id ?? value);
const sortedIds = (values) => [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);

function idsFor(build) {
  return sortedIds((build?.players || []).map(idOf));
}

function canonicalPlayer(player) {
  return {
    fpl_id: idOf(player),
    web_name: player?.web_name ?? player?.name ?? String(idOf(player)),
    team: player?.team ?? null,
    team_id: Number.isFinite(Number(player?.team_id)) ? Number(player.team_id) : null,
    position: player?.position ?? null,
    price: finite(player?.price),
  };
}

function playerIndex(builds) {
  const index = new Map();
  for (const build of builds || []) {
    for (const player of build?.players || []) {
      const id = idOf(player);
      if (Number.isFinite(id) && !index.has(id)) index.set(id, canonicalPlayer(player));
    }
  }
  return index;
}

function playersFor(ids, index) {
  return ids.map((id) => index.get(Number(id)) || { fpl_id: Number(id), web_name: String(id) });
}

export function compareBenchBoostBuilds(builds = []) {
  const index = playerIndex(builds);
  const rows = builds.map((build) => {
    const weeklyNetXptsSum = rounded((build?.weekly || []).reduce((sum, week) => sum + finite(week?.net_xpts), 0));
    const totalNetXpts = rounded(build?.total?.net_xpts);
    return {
      chip_gw: Number(build.chip_gw),
      ids: idsFor(build),
      total_net_xpts: totalNetXpts,
      weekly_net_xpts_sum: weeklyNetXptsSum,
      arithmetic_verified: Math.abs(totalNetXpts - weeklyNetXptsSum) <= 0.05,
      bench_boost_bonus: rounded(build?.total?.bench_boost_bonus),
    };
  });
  const sets = rows.map((row) => new Set(row.ids));
  const allShared = rows.length
    ? rows[0].ids.filter((id) => sets.every((set) => set.has(id)))
    : [];
  const unique = rows.map((row, rowIndex) => {
    const others = new Set(rows.flatMap((other, otherIndex) => otherIndex === rowIndex ? [] : other.ids));
    const playerIds = row.ids.filter((id) => !others.has(id));
    return { chip_gw: row.chip_gw, player_ids: playerIds, players: playersFor(playerIds, index) };
  });
  const pairwise = [];
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const shared = rows[left].ids.filter((id) => sets[right].has(id));
      const onlyLeft = rows[left].ids.filter((id) => !sets[right].has(id));
      const onlyRight = rows[right].ids.filter((id) => !sets[left].has(id));
      pairwise.push({
        left_chip_gw: rows[left].chip_gw,
        right_chip_gw: rows[right].chip_gw,
        shared_count: shared.length,
        shared_player_ids: shared,
        shared_players: playersFor(shared, index),
        only_left_player_ids: onlyLeft,
        only_left_players: playersFor(onlyLeft, index),
        only_right_player_ids: onlyRight,
        only_right_players: playersFor(onlyRight, index),
        identical: shared.length === rows[left].ids.length && shared.length === rows[right].ids.length,
      });
    }
  }
  const ranking = [...rows].sort((a, b) =>
    b.total_net_xpts - a.total_net_xpts
    || b.bench_boost_bonus - a.bench_boost_bonus
    || a.chip_gw - b.chip_gw);
  const winner = ranking[0] || null;
  const runnerUp = ranking[1] || null;
  return {
    all_shared_count: allShared.length,
    all_shared_player_ids: allShared,
    all_shared_players: playersFor(allShared, index),
    unique_by_chip_gw: unique,
    pairwise,
    ranking,
    winner_chip_gw: winner?.chip_gw ?? null,
    winner_net_xpts: winner?.total_net_xpts ?? null,
    margin_to_second: winner && runnerUp
      ? rounded(winner.total_net_xpts - runnerUp.total_net_xpts)
      : null,
    margins_from_winner: winner
      ? ranking.slice(1).map((row) => ({
        chip_gw: row.chip_gw,
        margin: rounded(winner.total_net_xpts - row.total_net_xpts),
      }))
      : [],
  };
}

export function nextAvailablePlanName(desired, usedNames = []) {
  const base = String(desired || "Bench Boost plan").trim() || "Bench Boost plan";
  const used = new Set([...usedNames].map((name) => String(name || "").trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error(`Could not allocate a unique plan name for ${base}.`);
}

function normaliseBenchOrder(week) {
  const raw = Array.isArray(week?.bench_order) && week.bench_order.length
    ? week.bench_order
    : (week?.bench || []).map(idOf);
  return raw.map((value) => Number(value?.fpl_id ?? value)).filter(Number.isFinite);
}

export function planRowFromBenchBoostBuild(build, name) {
  const players = Array.isArray(build?.players) ? build.players : [];
  const weekly = Array.isArray(build?.weekly) ? build.weekly : [];
  if (players.length !== 15 || weekly.length === 0) throw new Error("A complete build is required before saving.");
  const firstWeek = weekly[0];
  const firstStarters = new Set((firstWeek.starters || []).map(idOf));
  const byId = new Map(players.map((player) => [idOf(player), player]));
  const orderedIds = [
    ...(firstWeek.starters || []).map(idOf),
    ...(firstWeek.bench || []).map(idOf),
  ];
  const base = orderedIds.map((id) => {
    const player = byId.get(id);
    if (!player) throw new Error(`Missing player ${id} while creating saved plan.`);
    const price = finite(player.price);
    return {
      fpl_id: id,
      position: player.position,
      team_id: Number(player.team_id),
      price,
      purchasePrice: price,
      starting: firstStarters.has(id),
    };
  });
  const weeks = Object.fromEntries(weekly.map((week) => [String(week.gw), {
    transfers: [],
    startingIds: (week.starters || []).map(idOf),
    benchOrder: normaliseBenchOrder(week),
    structure: week.formation,
    captain: Number(week.captain),
    vice: Number(week.vice_captain),
    chip: week.chip || null,
  }]));
  return {
    name,
    structure: firstWeek.formation,
    captain: Number(firstWeek.captain),
    vice: Number(firstWeek.vice_captain),
    base,
    weeks,
    ignores: [],
    maybe_ids: [],
  };
}

function canonicalPlan(plan) {
  const base = (plan?.base || []).map((player) => ({
    fpl_id: Number(player.fpl_id),
    position: player.position,
    team_id: Number(player.team_id),
    price: finite(player.price),
    purchasePrice: finite(player.purchasePrice ?? player.price),
    starting: Boolean(player.starting),
  }));
  const weeks = Object.fromEntries(Object.entries(plan?.weeks || {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([gw, week]) => [String(gw), {
      transfers: Array.isArray(week.transfers) ? week.transfers : [],
      startingIds: sortedIds(week.startingIds || []),
      benchOrder: (week.benchOrder || []).map(Number),
      structure: week.structure,
      captain: Number(week.captain),
      vice: Number(week.vice),
      chip: week.chip || null,
    }]));
  return {
    name: String(plan?.name || ""),
    structure: plan?.structure,
    captain: Number(plan?.captain),
    vice: Number(plan?.vice),
    base,
    weeks,
  };
}

export function verifySavedPlan(saved, expected) {
  const actualCanonical = canonicalPlan(saved);
  const expectedCanonical = canonicalPlan(expected);
  const actual = JSON.stringify(actualCanonical);
  const wanted = JSON.stringify(expectedCanonical);
  return {
    ok: actual === wanted,
    actual: actualCanonical,
    expected: expectedCanonical,
  };
}

const safe = (value) => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const n1 = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
const names = (players) => (players || []).map((player) => safe(player.web_name ?? player.fpl_id)).join(", ");

export function renderBenchBoostReport({ gwFrom, gwTo, builds = [], comparison = {}, deleted = [], saved = [] } = {}) {
  const lines = [];
  lines.push("## RANGE OBJECTIVE");
  lines.push("");
  lines.push(`Each build maximises total net xPTS across GW${gwFrom}-GW${gwTo}, with Bench Boost fixed to that build's stated gameweek.`);
  lines.push("");
  lines.push("| BB GW | Solver | Gap | Weekly net xPTS | Range total | Arithmetic verified |");
  lines.push("|---:|---|---:|---|---:|:---:|");
  for (const build of builds) {
    lines.push(`| ${build.chip_gw} | ${safe(build.solver?.status)} | ${n1(build.solver?.mip_gap)} | ${(build.weekly || []).map((week) => `GW${week.gw} ${n1(week.net_xpts)}`).join(" + ")} | ${n1(build.total?.net_xpts)} | ${build.objective?.arithmetic_verified ? "yes" : "no"} |`);
  }

  lines.push("");
  lines.push("## DELETED PLANS");
  lines.push("");
  lines.push("| Plan | ID | Result |");
  lines.push("|---|---|---|");
  if (!deleted.length) lines.push("| — | — | none requested |");
  for (const row of deleted) lines.push(`| ${safe(row.name)} | ${safe(row.id)} | ${safe(row.result)} |`);

  for (const build of builds) {
    lines.push("");
    lines.push(`## BENCH BOOST GW${build.chip_gw}`);
    lines.push("");
    lines.push(`**Solver:** ${safe(build.solver?.engine)} ${safe(build.solver?.version)}, status ${safe(build.solver?.status)}, MIP gap ${n1(build.solver?.mip_gap)}, optimality proven ${build.solver?.optimality_proven === true ? "yes" : "no"}.`);
    lines.push("");
    lines.push(`**Objective:** maximise GW${build.objective?.gw_from}-GW${build.objective?.gw_to} total net xPTS with Bench Boost fixed to GW${build.chip_gw}.`);
    lines.push("");
    lines.push("| Player ID | Player | Team | Position | Price | GW1 role |");
    lines.push("|---:|---|---|---|---:|---|");
    const firstStarters = new Set((build.weekly?.[0]?.starters || []).map(idOf));
    for (const player of build.players || []) {
      lines.push(`| ${player.fpl_id} | ${safe(player.web_name)} | ${safe(player.team)} | ${safe(player.position)} | ${n1(player.price)} | ${firstStarters.has(idOf(player)) ? "starter" : "bench"} |`);
    }
    lines.push("");
    lines.push("| GW | Chip | Formation | Captain | Vice | XI cost | Bench cost | Bench | BB bonus | Net xPTS |");
    lines.push("|---:|---|---|---|---|---:|---:|---|---:|---:|");
    const playerById = new Map((build.players || []).map((player) => [idOf(player), player]));
    for (const week of build.weekly || []) {
      lines.push(`| ${week.gw} | ${safe(week.chip || "—")} | ${safe(week.formation)} | ${safe(playerById.get(Number(week.captain))?.web_name ?? week.captain)} | ${safe(playerById.get(Number(week.vice_captain))?.web_name ?? week.vice_captain)} | ${n1(week.xi_cost)} | ${n1(week.bench_cost)} | ${names(week.bench)} | ${n1(week.bench_boost_bonus)} | ${n1(week.net_xpts)} |`);
    }
    lines.push("");
    lines.push(`**Range net xPTS: ${n1(build.total?.net_xpts)}. Weekly sum: ${n1(build.objective?.weekly_net_xpts_sum)}. Verified: ${build.objective?.arithmetic_verified ? "yes" : "no"}.**`);
  }

  lines.push("");
  lines.push("## BACKEND COMPARISON");
  lines.push("");
  lines.push("| Rank | BB GW | Range net xPTS | BB bonus | Weekly arithmetic |");
  lines.push("|---:|---:|---:|---:|:---:|");
  for (const [index, row] of (comparison.ranking || []).entries()) {
    lines.push(`| ${index + 1} | ${row.chip_gw} | ${n1(row.total_net_xpts)} | ${n1(row.bench_boost_bonus)} | ${row.arithmetic_verified ? "verified" : "failed"} |`);
  }
  lines.push("");
  lines.push(`**Winner: Bench Boost GW${comparison.winner_chip_gw ?? "—"}, ${n1(comparison.winner_net_xpts)} net xPTS. Margin to second: ${n1(comparison.margin_to_second)}.**`);
  lines.push("");
  lines.push(`**Shared by all builds (${comparison.all_shared_count || 0}):** ${names(comparison.all_shared_players) || "none"}`);
  for (const row of comparison.unique_by_chip_gw || []) {
    lines.push(`**Only in the GW${row.chip_gw} build (${row.player_ids?.length || 0}):** ${names(row.players) || "none"}`);
  }
  lines.push("");
  lines.push("| Pair | Shared | Only left | Only right | Identical |");
  lines.push("|---|---:|---:|---:|:---:|");
  for (const row of comparison.pairwise || []) {
    lines.push(`| GW${row.left_chip_gw} vs GW${row.right_chip_gw} | ${row.shared_count} | ${row.only_left_player_ids.length} | ${row.only_right_player_ids.length} | ${row.identical ? "yes" : "no"} |`);
  }

  lines.push("");
  lines.push("## SAVED PLANS");
  lines.push("");
  lines.push("| Final saved name | Plan ID | Verified |");
  lines.push("|---|---|:---:|");
  if (!saved.length) lines.push("| — | — | not requested |");
  for (const row of saved) lines.push(`| ${safe(row.name)} | ${safe(row.plan_id ?? row.id)} | ${row.verified ? "true" : "false"} |`);
  return lines.join("\n");
}
