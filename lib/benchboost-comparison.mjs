const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);
const sortedIds = (values) => [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);

function idsFor(build) {
  return sortedIds((build?.players || []).map(idOf));
}

export function compareBenchBoostBuilds(builds = []) {
  const rows = builds.map((build) => ({
    chip_gw: Number(build.chip_gw),
    ids: idsFor(build),
    total_net_xpts: finite(build?.total?.net_xpts),
    bench_boost_bonus: finite(build?.total?.bench_boost_bonus),
  }));
  const sets = rows.map((row) => new Set(row.ids));
  const allShared = rows.length
    ? rows[0].ids.filter((id) => sets.every((set) => set.has(id)))
    : [];
  const unique = rows.map((row, index) => {
    const others = new Set(rows.flatMap((other, otherIndex) => otherIndex === index ? [] : other.ids));
    return { chip_gw: row.chip_gw, player_ids: row.ids.filter((id) => !others.has(id)) };
  });
  const pairwise = [];
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const shared = rows[left].ids.filter((id) => sets[right].has(id));
      pairwise.push({
        left_chip_gw: rows[left].chip_gw,
        right_chip_gw: rows[right].chip_gw,
        shared_count: shared.length,
        shared_player_ids: shared,
        only_left_player_ids: rows[left].ids.filter((id) => !sets[right].has(id)),
        only_right_player_ids: rows[right].ids.filter((id) => !sets[left].has(id)),
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
    unique_by_chip_gw: unique,
    pairwise,
    ranking,
    winner_chip_gw: winner?.chip_gw ?? null,
    winner_net_xpts: winner?.total_net_xpts ?? null,
    margin_to_second: winner && runnerUp
      ? Math.round((winner.total_net_xpts - runnerUp.total_net_xpts) * 10) / 10
      : null,
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
