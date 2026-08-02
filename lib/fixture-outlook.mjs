const MODES = new Set(["ATTACK", "DEFENCE"]);

const finite = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const numberOrNull = (value) => (finite(value) ? Number(value) : null);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function canonicalTeamId(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(numeric) : raw;
}

function teamMapOf(teamById) {
  const teams = Object.values(teamById || {}).filter(Boolean);
  return new Map(teams.map((team) => [canonicalTeamId(team.id), team]));
}

function fixtureOrder(a, b) {
  const gwA = numberOrNull(a?.gw) ?? Number.MAX_SAFE_INTEGER;
  const gwB = numberOrNull(b?.gw) ?? Number.MAX_SAFE_INTEGER;
  if (gwA !== gwB) return gwA - gwB;
  const kickA = Date.parse(a?.kickoff_utc || "");
  const kickB = Date.parse(b?.kickoff_utc || "");
  if (Number.isFinite(kickA) && Number.isFinite(kickB) && kickA !== kickB) return kickA - kickB;
  return String(a?.fpl_id ?? "").localeCompare(String(b?.fpl_id ?? ""));
}

/* One ID-normalising fixture reader for every surface. Supabase can return numeric ids while local
 * fixtures or imported JSON use strings; treating those as different clubs made valid fixtures vanish. */
export function nextFixturesForTeam(fixtures, teamById, teamId, limit = 8) {
  const target = canonicalTeamId(teamId);
  if (target === null) return [];
  const teams = teamMapOf(teamById);
  const maximum = Math.max(0, Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 8);
  const out = [];

  for (const fixture of [...(fixtures || [])].sort(fixtureOrder)) {
    const homeId = canonicalTeamId(fixture?.home_team);
    const awayId = canonicalTeamId(fixture?.away_team);
    const isHome = homeId === target;
    const isAway = awayId === target;
    if (!isHome && !isAway) continue;

    const opponentKey = isHome ? awayId : homeId;
    const opponent = teams.get(opponentKey);
    if (!opponent) continue;

    out.push({
      opp: opponent.short_name || opponent.name || String(opponent.id),
      oppId: opponent.id,
      home: isHome,
      gw: numberOrNull(fixture.gw),
      kickoff: fixture.kickoff_utc || null,
      fixtureId: fixture.fpl_id ?? fixture.id ?? null,
    });
    if (out.length >= maximum) break;
  }
  return out;
}

function venueValue(team, homeField, awayField, genericFields, opponentIsHome) {
  const venue = opponentIsHome ? numberOrNull(team?.[homeField]) : numberOrNull(team?.[awayField]);
  if (venue !== null) return venue;
  for (const field of genericFields) {
    const value = numberOrNull(team?.[field]);
    if (value !== null) return value;
  }
  return null;
}

const BASIS_CANDIDATES = Object.freeze({
  ATTACK: Object.freeze([
    Object.freeze({
      key: "defence-venue",
      label: "opponent defensive strength",
      read: (team, opponentIsHome) => venueValue(team,
        "strength_defence_home", "strength_defence_away", ["strength_defence", "defence_strength"], opponentIsHome),
    }),
    Object.freeze({
      key: "overall-strength",
      label: "overall club strength fallback",
      read: (team) => numberOrNull(team?.strength),
    }),
  ]),
  DEFENCE: Object.freeze([
    Object.freeze({
      key: "attack-venue",
      label: "opponent attacking strength",
      read: (team, opponentIsHome) => venueValue(team,
        "strength_attack_home", "strength_attack_away", ["strength_attack", "attack_strength"], opponentIsHome),
    }),
    Object.freeze({
      key: "attacking-xg",
      label: "opponent attacking xG fallback",
      read: (team) => numberOrNull(team?.xg_for),
    }),
    Object.freeze({
      key: "overall-strength",
      label: "overall club strength fallback",
      read: (team) => numberOrNull(team?.strength),
    }),
  ]),
});

export function fixtureRatingBasis(teamById, mode) {
  const kind = MODES.has(mode) ? mode : "ATTACK";
  const clubs = Object.values(teamById || {}).filter((team) => team && team.archive !== true);
  const samples = clubs.length * 2;
  const candidates = BASIS_CANDIDATES[kind].map((candidate, priority) => {
    const values = clubs.flatMap((team) => [candidate.read(team, true), candidate.read(team, false)])
      .filter((value) => value !== null && Number.isFinite(value));
    const unique = new Set(values.map((value) => Number(value).toFixed(8)));
    return {
      ...candidate,
      priority,
      coverage: values.length,
      samples,
      lo: values.length ? Math.min(...values) : null,
      hi: values.length ? Math.max(...values) : null,
      usable: values.length >= 2 && unique.size >= 2,
    };
  });

  const usable = candidates.filter((candidate) => candidate.usable)
    .sort((a, b) => b.coverage - a.coverage || a.priority - b.priority);
  return usable[0] || null;
}

export function fixtureEase({ mode, fixture, opponent, basis, scale }) {
  const kind = MODES.has(mode) ? mode : "ATTACK";
  if (!fixture || !opponent) return null;

  if (basis && basis.hi > basis.lo) {
    // The opponent plays at the opposite venue to the club being ranked.
    const raw = basis.read(opponent, !fixture.home);
    if (raw !== null && Number.isFinite(Number(raw))) {
      const hardness = clamp((Number(raw) - basis.lo) / (basis.hi - basis.lo), 0, 1);
      // A small explicit club-side venue adjustment remains after using venue-aware opponent ratings.
      const venue = fixture.home ? 5 : -5;
      return {
        ease: Math.round(clamp((1 - hardness) * 100 + venue, 0, 100)),
        basis: basis.label,
        mode: kind,
      };
    }
  }

  const shared = scale && typeof scale.difficultyOf === "function"
    ? scale.difficultyOf(opponent.id, fixture.home)
    : null;
  if (!shared || !finite(shared.difficulty)) return null;
  return {
    ease: Math.round(clamp(100 - Number(shared.difficulty), 0, 100)),
    basis: `shared ${shared.basis || "opponent"} fallback`,
    mode: kind,
  };
}

export function buildFixtureOutlook({ fixtures, teamById, mode = "ATTACK", gameweeks = 5, scale = null }) {
  const kind = MODES.has(mode) ? mode : "ATTACK";
  const clubs = Object.values(teamById || {}).filter((team) => team && team.archive !== true);
  const teams = teamMapOf(teamById);
  const basis = fixtureRatingBasis(teamById, kind);
  const rows = [];

  for (const club of clubs) {
    const run = nextFixturesForTeam(fixtures, teamById, club.id, gameweeks);
    const scored = run.map((fixture) => {
      const opponent = teams.get(canonicalTeamId(fixture.oppId));
      const score = fixtureEase({ mode: kind, fixture, opponent, basis, scale });
      return score ? { ...fixture, ease: score.ease, basis: score.basis } : null;
    }).filter(Boolean);
    if (!scored.length) continue;

    const ease = Math.round(scored.reduce((sum, fixture) => sum + fixture.ease, 0) / scored.length);
    rows.push({ club, fixtures: scored, ease, fixtureCount: scored.length });
  }

  rows.sort((a, b) => b.ease - a.ease || String(a.club.short_name || a.club.name || "")
    .localeCompare(String(b.club.short_name || b.club.name || "")));

  const gameweekValues = rows.flatMap((row) => row.fixtures.map((fixture) => fixture.gw))
    .filter((gw) => Number.isFinite(Number(gw))).map(Number);
  const firstGw = gameweekValues.length ? Math.min(...gameweekValues) : null;
  const lastGw = gameweekValues.length ? Math.max(...gameweekValues) : null;

  return {
    mode: kind,
    rows,
    basis: basis ? basis.label : (scale ? "shared opponent scale fallback" : null),
    firstGw,
    lastGw,
  };
}
