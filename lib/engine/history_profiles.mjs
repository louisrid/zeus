import { normalisePlayerText } from "./player_data_matcher.mjs";

const n = (value) => {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
};

const bool = (value) => value === true || value === "true" || value === 1 || value === "1";

/**
 * Collapse raw prior-season player-gameweek rows into one expected-metrics and
 * minutes profile per footballer. The history table is independent of today's
 * players table, so this is the safe bridge when old and current ids differ.
 */
export function aggregateHistoryProfiles(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    if (!row || !row.player_name) continue;
    const position = String(row.position || "").toUpperCase();
    if (!["GKP", "DEF", "MID", "FWD"].includes(position)) continue;
    const element = Number(row.element);
    const identity = Number.isFinite(element)
      ? `element:${element}`
      : `name:${normalisePlayerText(row.player_name)}|${position}`;
    let g = grouped.get(identity);
    if (!g) {
      g = {
        player_name: row.player_name,
        position,
        teams: new Set(),
        points: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        starts: 0,
        starts60: 0,
        cameos: 0,
        start_minutes: 0,
        cameo_minutes: 0,
        xg: 0,
        xa: 0,
        cbit: 0,
        recoveries: 0,
        saves: 0,
        yellow: 0,
        red: 0,
        own_goals: 0,
        pens_missed: 0,
        pens_saved: 0,
      };
      grouped.set(identity, g);
    }
    if (row.team) g.teams.add(String(row.team));
    const minutes = Math.max(0, n(row.minutes));
    const started = bool(row.started);
    g.points += n(row.total_points);
    g.minutes += minutes;
    g.goals += n(row.goals);
    g.assists += n(row.assists);
    g.xg += n(row.xg);
    g.xa += n(row.xa);
    g.cbit += n(row.cbit);
    g.recoveries += n(row.recoveries);
    g.saves += n(row.saves);
    g.yellow += n(row.yellow);
    g.red += n(row.red);
    g.own_goals += n(row.own_goals);
    g.pens_missed += n(row.pens_missed);
    g.pens_saved += n(row.pens_saved);
    if (started) {
      g.starts += 1;
      g.start_minutes += minutes;
      if (minutes >= 60) g.starts60 += 1;
    } else if (minutes > 0) {
      g.cameos += 1;
      g.cameo_minutes += minutes;
    }
  }

  return [...grouped.values()].map((g) => {
    const nineties = g.minutes / 90;
    return {
      player_name: g.player_name,
      name: g.player_name,
      full_name: g.player_name,
      team_title: [...g.teams].join(","),
      team: [...g.teams].join(","),
      position: g.position,
      points: g.points,
      minutes: g.minutes,
      nineties,
      goals: g.goals,
      assists: g.assists,
      starts: g.starts,
      starts60: g.starts60,
      cameos: g.cameos,
      start_minutes: g.start_minutes,
      cameo_minutes: g.cameo_minutes,
      xg: g.xg,
      xa: g.xa,
      npxg: Math.max(0, g.xg),
      cbit: g.cbit,
      recoveries: g.recoveries,
      saves: g.saves,
      yellow: g.yellow,
      red: g.red,
      own_goals: g.own_goals,
      pens_missed: g.pens_missed,
      pens_saved: g.pens_saved,
      points_per_90: nineties > 0 ? g.points / nineties : null,
      npxg90: nineties > 0 ? g.xg / nineties : null,
      xa90: nineties > 0 ? g.xa / nineties : null,
      cbit90: nineties > 0 ? g.cbit / nineties : null,
      recoveries90: nineties > 0 ? g.recoveries / nineties : null,
    };
  });
}

const missing = (value) => value === undefined || value === null || value === "" || !Number.isFinite(Number(value));

/** Keep the id-backed prior row where it exists, but fill its missing expected
 * metrics and history from the name-matched full history table. */
export function mergeHistoricalProfile(primary = null, matched = null) {
  if (!primary && !matched) return null;
  if (!primary) return { ...matched };
  if (!matched) return { ...primary };
  const out = { ...matched, ...primary };
  for (const [key, value] of Object.entries(matched)) {
    if (missing(primary[key])) out[key] = value;
  }
  return out;
}
