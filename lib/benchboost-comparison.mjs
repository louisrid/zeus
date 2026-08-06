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
      squad_cost: rounded(build?.squad_cost),
      money_in_bank: rounded(build?.money_in_bank),
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

function benchOrderText(week) {
  const bench = Array.isArray(week?.bench) ? week.bench : [];
  if (!bench.length) return "—";
  const goalkeeper = bench[0];
  const outfield = bench.slice(1);
  return `GK: ${safe(goalkeeper?.web_name ?? goalkeeper?.fpl_id)}; 1: ${safe(outfield[0]?.web_name ?? outfield[0]?.fpl_id)}; 2: ${safe(outfield[1]?.web_name ?? outfield[1]?.fpl_id)}; 3: ${safe(outfield[2]?.web_name ?? outfield[2]?.fpl_id)}`;
}

export function renderBenchBoostReport({ gwFrom, gwTo, builds = [], comparison = {}, deleted = [], saved = [], excludedPlayers = [] } = {}) {
  const lines = [];
  lines.push("## RANGE OBJECTIVE");
  lines.push("");
  lines.push(`Each build maximises total net xPTS across GW${gwFrom}-GW${gwTo} in an independent optimisation, with Bench Boost fixed to that build's stated gameweek.`);
  const applied = builds[0]?.constraints || {};
  if (applied.exact_money_in_bank !== null && applied.exact_money_in_bank !== undefined) {
    lines.push(`Budget: £${n1(applied.total_budget)}m. Money in bank: exactly £${n1(applied.exact_money_in_bank)}m. Squad spend: exactly £${n1(applied.maximum_squad_spend)}m.`);
  } else if (applied.maximum_money_in_bank !== null && applied.maximum_money_in_bank !== undefined) {
    lines.push(`Budget: £${n1(applied.total_budget)}m. Money in bank: £${n1(applied.minimum_money_in_bank)}m to £${n1(applied.maximum_money_in_bank)}m. Squad spend: £${n1(applied.minimum_squad_spend)}m to £${n1(applied.maximum_squad_spend)}m.`);
  } else {
    lines.push(`Budget: £${n1(applied.total_budget)}m. Minimum money in bank: £${n1(applied.minimum_money_in_bank)}m. Maximum squad spend: £${n1(applied.maximum_squad_spend)}m.`);
  }
  if (applied.minimum_bench_spend_enabled === false || Number(applied.minimum_bench_spend) <= 0) {
    lines.push("Minimum bench-spend control: OFF. No custom minimum is applied.");
  } else {
    lines.push(`Minimum bench-spend control: ON at £${n1(applied.minimum_bench_spend)}m. The four-player bench must cost at least this amount in every gameweek; spending more is allowed.`);
  }
  if (applied.goalkeeper_price_constraint_enabled) {
    lines.push(`Goalkeeper price control: at least ${applied.minimum_goalkeepers_at_or_below_price} goalkeeper(s) must cost £${n1(applied.goalkeeper_max_price)}m or less.`);
  } else {
    lines.push("Goalkeeper price control: OFF.");
  }
  lines.push("Bench order: backup goalkeeper first, then the three outfield substitutes from highest projected xPTS to lowest for that gameweek.");
  lines.push(`Hard exclusions: ${excludedPlayers.length ? names(excludedPlayers) : "none"}.`);
  lines.push("");
  lines.push("| BB GW | Solver | Gap | Squad cost | Bank | Weekly net xPTS | Range total | Arithmetic verified |");
  lines.push("|---:|---|---:|---:|---:|---|---:|:---:|");
  for (const build of builds) {
    lines.push(`| ${build.chip_gw} | ${safe(build.solver?.status)} | ${n1(build.solver?.mip_gap)} | ${n1(build.squad_cost)} | ${n1(build.money_in_bank)} | ${(build.weekly || []).map((week) => `GW${week.gw} ${n1(week.net_xpts)}`).join(" + ")} | ${n1(build.total?.net_xpts)} | ${build.objective?.arithmetic_verified ? "yes" : "no"} |`);
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
    lines.push(`**Cost proof:** squad £${n1(build.squad_cost)}m, money in bank £${n1(build.money_in_bank)}m.`);
    if (build.constraints?.goalkeeper_price_constraint_enabled) {
      lines.push(`**Goalkeeper-price proof:** ${build.constraints.goalkeepers_at_or_below_price?.length || 0} goalkeeper(s) at £${n1(build.constraints.goalkeeper_max_price)}m or less: ${names(build.constraints.goalkeepers_at_or_below_price) || "none"}.`);
    }
    lines.push("");
    lines.push("| Player ID | Player | Team | Position | Price | GW1 role |");
    lines.push("|---:|---|---|---|---:|---|");
    const firstStarters = new Set((build.weekly?.[0]?.starters || []).map(idOf));
    for (const player of build.players || []) {
      lines.push(`| ${player.fpl_id} | ${safe(player.web_name)} | ${safe(player.team)} | ${safe(player.position)} | ${n1(player.price)} | ${firstStarters.has(idOf(player)) ? "starter" : "bench"} |`);
    }
    lines.push("");
    lines.push("| GW | Chip | Formation | Captain | Vice | XI cost | Bench cost | Ordered bench | BB bonus | Net xPTS |");
    lines.push("|---:|---|---|---|---|---:|---:|---|---:|---:|");
    const playerById = new Map((build.players || []).map((player) => [idOf(player), player]));
    for (const week of build.weekly || []) {
      lines.push(`| ${week.gw} | ${safe(week.chip || "—")} | ${safe(week.formation)} | ${safe(playerById.get(Number(week.captain))?.web_name ?? week.captain)} | ${safe(playerById.get(Number(week.vice_captain))?.web_name ?? week.vice_captain)} | ${n1(week.xi_cost)} | ${n1(week.bench_cost)} | ${benchOrderText(week)} | ${n1(week.bench_boost_bonus)} | ${n1(week.net_xpts)} |`);
    }
    lines.push("");
    lines.push(`**Range net xPTS: ${n1(build.total?.net_xpts)}. Weekly sum: ${n1(build.objective?.weekly_net_xpts_sum)}. Verified: ${build.objective?.arithmetic_verified ? "yes" : "no"}.**`);

    const replacementRows = build.always_benched_replacement_options || [];
    if (replacementRows.length) {
      lines.push("");
      lines.push(`### CHEAPER OPTIONS FOR PLAYERS NEVER STARTED IN GW${gwFrom}-GW${gwTo}`);
      lines.push("");
      for (const row of replacementRows) {
        lines.push(`**${safe(row.incumbent?.web_name)} (${safe(row.incumbent?.position)}, £${n1(row.incumbent?.price)}m):**`);
        if (!(row.options || []).length) {
          lines.push(`No cheaper legal option was within ${n1(row.maximum_comparable_xpts_drop)} xPTS of the incumbent's Bench Boost contribution while preserving all constraints.`);
          lines.push("");
          continue;
        }
        lines.push("");
        lines.push("| Replacement | Team | Price | Budget saved | New bank | BB xPTS | xPTS change | New range total |");
        lines.push("|---|---|---:|---:|---:|---:|---:|---:|");
        for (const option of row.options || []) {
          lines.push(`| ${safe(option.player?.web_name)} | ${safe(option.player?.team)} | ${n1(option.player?.price)} | ${n1(option.budget_saved)} | ${n1(option.projected_money_in_bank)} | ${n1(option.replacement_bench_boost_xpts)} | ${n1(option.xpts_change)} | ${n1(option.projected_new_range_net_xpts)} |`);
        }
        lines.push("");
      }
    }
  }

  lines.push("");
  lines.push("## BACKEND COMPARISON");
  lines.push("");
  lines.push("| Rank | BB GW | Range net xPTS | BB bonus | Squad cost | Bank | Weekly arithmetic |");
  lines.push("|---:|---:|---:|---:|---:|---:|:---:|");
  for (const [index, row] of (comparison.ranking || []).entries()) {
    lines.push(`| ${index + 1} | ${row.chip_gw} | ${n1(row.total_net_xpts)} | ${n1(row.bench_boost_bonus)} | ${n1(row.squad_cost)} | ${n1(row.money_in_bank)} | ${row.arithmetic_verified ? "verified" : "failed"} |`);
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
