// Reliable attacking-rate resolution for the Zeus projection engine.
// Actual goals and assists are NEVER substituted for xG or xA.

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const firstFinite = (...values) => {
  for (const value of values) {
    const n = num(value);
    if (n !== null) return n;
  }
  return null;
};

const per90 = (total, minutes) => {
  const t = num(total);
  const m = num(minutes);
  if (t === null || m === null || m <= 0) return null;
  return t / (m / 90);
};

const positionalPrior = (leagueRates, field, position) => {
  const value = num(leagueRates?.[field]?.[position]);
  return value === null ? 0 : Math.max(0, value);
};

function directPer90(row, field) {
  if (!row) return null;
  if (field === "npxg90") {
    return firstFinite(
      row.npxg90, row.npxG90, row.npxg_per_90, row.npxG_per_90,
      row.non_penalty_xg_per_90, row.expected_non_penalty_goals_per_90
    );
  }
  return firstFinite(
    row.xa90, row.xA90, row.xa_per_90, row.xA_per_90,
    row.expected_assists_per_90
  );
}

function totalExpected(row, field) {
  if (!row) return null;
  if (field === "npxg90") {
    return firstFinite(row.npxg, row.npxG, row.non_penalty_xg, row.expected_non_penalty_goals);
  }
  return firstFinite(row.xa, row.xA, row.expected_assists);
}

function resolveOne({ understat, archive, player, field, position, leagueRates }) {
  const prior = positionalPrior(leagueRates, field, position);
  const sources = [
    ["understat", understat],
    ["archive-expected", archive],
    ["player-expected", player],
  ];

  for (const [source, row] of sources) {
    const direct = directPer90(row, field);
    const minutes = firstFinite(row?.minutes, row?.time, row?.mins, row?.minutes_played);
    if (direct !== null && direct >= 0) {
      const nineties = minutes !== null && minutes > 0 ? minutes / 90 : firstFinite(row?.nineties, row?.ninety_count, row?.starts) ?? 0;
      return { rate: direct, nineties: Math.max(0, nineties), source };
    }

    const total = totalExpected(row, field);
    if (total !== null && minutes !== null && minutes >= 90) {
      return {
        rate: Math.max(0, per90(total, minutes) ?? prior),
        nineties: minutes / 90,
        source,
      };
    }
  }

  return { rate: prior, nineties: 0, source: "prior-positional" };
}

/** Resolve npxG and xA independently so one missing metric does not erase the other. */
export function resolvePlayerRates({ archive, understat, player, position, leagueRates }) {
  const goal = resolveOne({ understat, archive, player, field: "npxg90", position, leagueRates });
  const assist = resolveOne({ understat, archive, player, field: "xa90", position, leagueRates });
  const source = goal.source === assist.source ? goal.source : `mixed-${goal.source}-${assist.source}`;
  return {
    npxg90: goal.rate,
    xa90: assist.rate,
    npxgNineties: goal.nineties,
    xaNineties: assist.nineties,
    nineties: Math.max(goal.nineties, assist.nineties),
    source,
    xgTotal: Math.max(0, firstFinite(
      understat?.xg, understat?.xG, archive?.xg, archive?.xG,
      player?.xg, player?.xG
    ) ?? 0),
    shots: Math.max(0, firstFinite(understat?.shots, archive?.shots, player?.shots) ?? 0),
  };
}

/** Empirical-Bayes shrinkage, applied once before team shares are formed. */
export function reliableRate({ rate, nineties, prior, k }) {
  const own = Math.max(0, Number(rate) || 0);
  const base = Math.max(0, Number(prior) || 0);
  const n = Math.max(0, Number(nineties) || 0);
  const strength = Math.max(0, Number(k) || 0);
  if (strength === 0) return own;
  if (n === 0) return base;
  return (n * own + strength * base) / (n + strength);
}
