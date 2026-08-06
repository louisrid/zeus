const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rounded = (value) => Math.round(finite(value) * 10) / 10;
const idOf = (value) => Number(value?.fpl_id ?? value?.element ?? value?.id ?? value);

function canonicalPlayer(player) {
  return {
    fpl_id: idOf(player),
    web_name: player?.web_name ?? player?.name ?? String(idOf(player)),
    team: player?.team ?? null,
    team_id: Number(player?.team_id),
    position: player?.position ?? null,
    price: finite(player?.price),
  };
}

function clubCounts(players) {
  const counts = new Map();
  for (const player of players || []) {
    const teamId = Number(player?.team_id);
    counts.set(teamId, (counts.get(teamId) || 0) + 1);
  }
  return counts;
}

export function findAlwaysBenchedReplacementOptions({
  build,
  pool = [],
  scoreForGw = () => 0,
  excludedPlayerIds = [],
  minimumBenchSpend = 0,
  maximumMoneyInBank = null,
  goalkeeperMaxPrice = null,
  minimumGoalkeepersAtOrBelowPrice = 1,
  optionCount = 3,
  maximumComparableXptsDrop = 1,
  maxPerClub = 3,
} = {}) {
  const players = Array.isArray(build?.players) ? build.players : [];
  const weekly = Array.isArray(build?.weekly) ? build.weekly : [];
  const squadIds = new Set(players.map(idOf));
  const excludedIds = new Set((excludedPlayerIds || []).map(Number));
  const startedIds = new Set(weekly.flatMap((week) => (week?.starters || []).map(idOf)));
  const alwaysBenched = players.filter((player) => !startedIds.has(idOf(player)));
  const currentClubCounts = clubCounts(players);
  const chipWeeks = weekly.filter((week) => week?.chip === "benchboost").map((week) => Number(week.gw));
  const parsedOptionCount = Math.max(1, Math.min(10, Math.floor(finite(optionCount) || 3)));
  const maxDrop = Math.max(0, finite(maximumComparableXptsDrop));
  const parsedGoalkeeperMaxPrice = goalkeeperMaxPrice === null || goalkeeperMaxPrice === undefined || goalkeeperMaxPrice === ""
    ? null
    : finite(goalkeeperMaxPrice);

  return alwaysBenched.map((incumbent) => {
    const incumbentId = idOf(incumbent);
    const incumbentContribution = rounded(chipWeeks.reduce(
      (sum, gw) => sum + finite(scoreForGw(incumbent, gw)), 0));
    const incumbentBenchCosts = weekly.map((week) => ({
      gw: Number(week.gw),
      cost: finite(week.bench_cost),
      contains_incumbent: (week.bench || []).some((player) => idOf(player) === incumbentId),
    }));

    const candidates = [];
    for (const candidate of pool || []) {
      const candidateId = idOf(candidate);
      if (!Number.isInteger(candidateId) || candidateId <= 0) continue;
      if (squadIds.has(candidateId) || excludedIds.has(candidateId)) continue;
      if (candidate?.position !== incumbent?.position) continue;
      const candidatePrice = finite(candidate?.price);
      const incumbentPrice = finite(incumbent?.price);
      if (!(candidatePrice + 1e-9 < incumbentPrice)) continue;

      const candidateTeam = Number(candidate?.team_id);
      const incumbentTeam = Number(incumbent?.team_id);
      const resultingClubCount = (currentClubCounts.get(candidateTeam) || 0)
        + (candidateTeam === incumbentTeam ? 0 : 1);
      if (resultingClubCount > maxPerClub) continue;

      const preservesBenchMinimum = incumbentBenchCosts.every((row) =>
        !row.contains_incumbent
        || row.cost - incumbentPrice + candidatePrice + 1e-9 >= minimumBenchSpend);
      if (!preservesBenchMinimum) continue;

      if (parsedGoalkeeperMaxPrice !== null) {
        const otherCheapGoalkeepers = players.filter((player) =>
          idOf(player) !== incumbentId
          && player.position === "GKP"
          && finite(player.price) <= parsedGoalkeeperMaxPrice + 1e-9).length;
        const candidateCheap = candidate.position === "GKP"
          && candidatePrice <= parsedGoalkeeperMaxPrice + 1e-9 ? 1 : 0;
        if (otherCheapGoalkeepers + candidateCheap < minimumGoalkeepersAtOrBelowPrice) continue;
      }

      const budgetSaved = rounded(incumbentPrice - candidatePrice);
      const projectedMoneyInBank = rounded(finite(build?.money_in_bank) + budgetSaved);
      if (maximumMoneyInBank !== null && projectedMoneyInBank > finite(maximumMoneyInBank) + 1e-9) continue;

      const candidateContribution = rounded(chipWeeks.reduce(
        (sum, gw) => sum + finite(scoreForGw(candidate, gw)), 0));
      const xptsChange = rounded(candidateContribution - incumbentContribution);
      const xptsDrop = rounded(Math.max(0, -xptsChange));
      if (xptsDrop > maxDrop + 1e-9) continue;

      candidates.push({
        player: canonicalPlayer(candidate),
        budget_saved: budgetSaved,
        projected_money_in_bank: projectedMoneyInBank,
        incumbent_bench_boost_xpts: incumbentContribution,
        replacement_bench_boost_xpts: candidateContribution,
        xpts_change: xptsChange,
        projected_new_range_net_xpts: rounded(finite(build?.total?.net_xpts) + xptsChange),
        comparison_basis: "Bench Boost contribution only because the incumbent never starts in the requested range",
      });
    }

    candidates.sort((a, b) =>
      b.replacement_bench_boost_xpts - a.replacement_bench_boost_xpts
      || b.budget_saved - a.budget_saved
      || a.player.fpl_id - b.player.fpl_id);

    return {
      incumbent: canonicalPlayer(incumbent),
      never_started_gameweeks: weekly.map((week) => Number(week.gw)),
      comparison_chip_gameweeks: chipWeeks,
      maximum_comparable_xpts_drop: maxDrop,
      options: candidates.slice(0, parsedOptionCount),
    };
  });
}
