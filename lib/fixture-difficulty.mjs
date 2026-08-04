const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, low = 0, high = 100) => Math.min(high, Math.max(low, value));
const average = (values) => {
  const usable = values.map(finite).filter((value) => value !== null);
  return usable.length ? Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10 : null;
};
const round1 = (value) => value === null ? null : Math.round(Number(value) * 10) / 10;

export const FIXTURE_DIFFICULTY_CATEGORIES = Object.freeze({
  EASY: Object.freeze({ min: 0, max: 39 }),
  MEDIUM: Object.freeze({ min: 40, max: 59 }),
  HARD: Object.freeze({ min: 60, max: 100 }),
});

export const FIXTURE_DIFFICULTY_FORMULA = Object.freeze({
  midpoint: 50,
  relative_strength_weight: 42,
  overall_home_adjustment: -8,
  overall_away_adjustment: 8,
  attack_home_adjustment: -5,
  attack_away_adjustment: 5,
  defence_home_adjustment: -5,
  defence_away_adjustment: 5,
});

export function fixtureDifficultyCategory(value) {
  const difficulty = finite(value);
  if (difficulty === null) return null;
  if (difficulty < 40) return "EASY";
  if (difficulty < 60) return "MEDIUM";
  return "HARD";
}

function firstFinite(team, fields) {
  for (const field of fields) {
    const value = finite(team?.[field]);
    if (value !== null) return value;
  }
  return null;
}

function venueStrength(team, kind, isHome) {
  const suffix = isHome ? "home" : "away";
  return firstFinite(team, [
    `strength_${kind}_${suffix}`,
    `strength_${kind}`,
    `${kind}_strength`,
    "strength",
  ]);
}

function range(values) {
  const usable = values.map(finite).filter((value) => value !== null);
  if (usable.length < 2) return null;
  const low = Math.min(...usable);
  const high = Math.max(...usable);
  return high > low ? { low, high } : null;
}

function normalise(value, bounds) {
  const number = finite(value);
  if (number === null || !bounds || bounds.high <= bounds.low) return null;
  return clamp((number - bounds.low) / (bounds.high - bounds.low), 0, 1);
}

function relativeDifficulty(assessed, opponent, venueAdjustment, fallback) {
  if (assessed === null || opponent === null) return finite(fallback);
  return round1(clamp(
    FIXTURE_DIFFICULTY_FORMULA.midpoint
      + FIXTURE_DIFFICULTY_FORMULA.relative_strength_weight * (opponent - assessed)
      + venueAdjustment,
  ));
}

export function fixtureStrengthInputs({ team, opponent, home, ranges = {} }) {
  const opponentIsHome = !home;
  const assessedOverallRaw = firstFinite(team, ["strength"]);
  const assessedAttackRaw = venueStrength(team, "attack", home);
  const assessedDefenceRaw = venueStrength(team, "defence", home);
  const opponentOverallRaw = firstFinite(opponent, ["strength"]);
  const opponentAttackRaw = venueStrength(opponent, "attack", opponentIsHome);
  const opponentDefenceRaw = venueStrength(opponent, "defence", opponentIsHome);
  return {
    assessed_team_strength: assessedOverallRaw,
    assessed_team_attack_strength: assessedAttackRaw,
    assessed_team_defence_strength: assessedDefenceRaw,
    opponent_strength: opponentOverallRaw,
    opponent_attack_strength: opponentAttackRaw,
    opponent_defence_strength: opponentDefenceRaw,
    assessed_team_strength_normalised: normalise(assessedOverallRaw, ranges.overall),
    assessed_team_attack_strength_normalised: normalise(assessedAttackRaw, ranges.attack),
    assessed_team_defence_strength_normalised: normalise(assessedDefenceRaw, ranges.defence),
    opponent_strength_normalised: normalise(opponentOverallRaw, ranges.overall),
    opponent_attack_strength_normalised: normalise(opponentAttackRaw, ranges.attack),
    opponent_defence_strength_normalised: normalise(opponentDefenceRaw, ranges.defence),
    assessed_team_home: Boolean(home),
    opponent_home: Boolean(opponentIsHome),
    overall_venue_adjustment: home
      ? FIXTURE_DIFFICULTY_FORMULA.overall_home_adjustment
      : FIXTURE_DIFFICULTY_FORMULA.overall_away_adjustment,
    attack_venue_adjustment: home
      ? FIXTURE_DIFFICULTY_FORMULA.attack_home_adjustment
      : FIXTURE_DIFFICULTY_FORMULA.attack_away_adjustment,
    defence_venue_adjustment: home
      ? FIXTURE_DIFFICULTY_FORMULA.defence_home_adjustment
      : FIXTURE_DIFFICULTY_FORMULA.defence_away_adjustment,
  };
}

export function buildFixtureDifficultyModel(teamRows = []) {
  const teams = (Array.isArray(teamRows) ? teamRows : []).filter((team) => team && team.archive !== true);
  const overall = range(teams.map((team) => firstFinite(team, ["strength"])));
  const attack = range(teams.flatMap((team) => [
    venueStrength(team, "attack", true),
    venueStrength(team, "attack", false),
  ]));
  const defence = range(teams.flatMap((team) => [
    venueStrength(team, "defence", true),
    venueStrength(team, "defence", false),
  ]));
  const ranges = { overall, attack, defence };

  return {
    ranges,
    score({ team, opponent, home, fallback = {} }) {
      const inputs = fixtureStrengthInputs({ team, opponent, home, ranges });
      const overallValue = relativeDifficulty(
        inputs.assessed_team_strength_normalised,
        inputs.opponent_strength_normalised,
        inputs.overall_venue_adjustment,
        fallback.overall,
      );
      const attackValue = relativeDifficulty(
        inputs.assessed_team_attack_strength_normalised,
        inputs.opponent_defence_strength_normalised,
        inputs.attack_venue_adjustment,
        fallback.attack,
      );
      const defenceValue = relativeDifficulty(
        inputs.assessed_team_defence_strength_normalised,
        inputs.opponent_attack_strength_normalised,
        inputs.defence_venue_adjustment,
        fallback.defence,
      );
      return { overallValue, attackValue, defenceValue, inputs };
    },
  };
}

export function decorateFixturePerspective({ perspective, team, opponent, home, gw, model = null }) {
  const fallback = {
    overall: finite(perspective?.difficulty),
    attack: finite(perspective?.attack_difficulty),
    defence: finite(perspective?.defence_difficulty),
  };
  const scored = model?.score
    ? model.score({ team, opponent, home, fallback })
    : {
      overallValue: fallback.overall,
      attackValue: fallback.attack,
      defenceValue: fallback.defence,
      inputs: fixtureStrengthInputs({ team, opponent, home }),
    };
  const value = finite(scored.overallValue);
  const attackValue = finite(scored.attackValue);
  const defenceValue = finite(scored.defenceValue);
  const category = fixtureDifficultyCategory(value);
  const attackCategory = fixtureDifficultyCategory(attackValue);
  const defenceCategory = fixtureDifficultyCategory(defenceValue);
  const categoryBand = category === "EASY" ? 1 : category === "MEDIUM" ? 2 : category === "HARD" ? 3 : null;
  return {
    ...perspective,
    gw: finite(gw),
    assessed_team: perspective?.team ?? team?.short_name ?? team?.name ?? null,
    assessed_team_id: finite(perspective?.team_id ?? team?.id),
    opponent: perspective?.opponent ?? opponent?.short_name ?? opponent?.name ?? null,
    opponent_id: finite(perspective?.opponent_id ?? opponent?.id),
    venue: home ? "H" : "A",
    difficulty: value,
    difficulty_band: categoryBand,
    difficulty_label: category,
    difficulty_basis: "relative assessed-team and opponent strength with explicit venue adjustment",
    category,
    numeric_value: value,
    attack_ease: attackValue === null ? null : round1(100 - attackValue),
    attack_difficulty: attackValue,
    attack_basis: "assessed attack versus opponent defence with explicit venue adjustment",
    attack_category: attackCategory,
    attack_numeric_value: attackValue,
    defence_ease: defenceValue === null ? null : round1(100 - defenceValue),
    defence_difficulty: defenceValue,
    defence_basis: "assessed defence versus opponent attack with explicit venue adjustment",
    defence_category: defenceCategory,
    defence_numeric_value: defenceValue,
    strength_inputs: scored.inputs,
  };
}

export function buildTeamFixtureOutlooks(fixtures = []) {
  const grouped = new Map();
  for (const fixture of fixtures) {
    for (const view of [fixture?.home_team_view, fixture?.away_team_view]) {
      if (!view || view.assessed_team_id === null || view.assessed_team_id === undefined) continue;
      const key = String(view.assessed_team_id);
      if (!grouped.has(key)) grouped.set(key, {
        assessed_team: view.assessed_team,
        assessed_team_id: view.assessed_team_id,
        fixtures: [],
      });
      grouped.get(key).fixtures.push({
        gw: view.gw,
        opponent: view.opponent,
        opponent_id: view.opponent_id,
        venue: view.venue,
        category: view.category,
        numeric_value: view.numeric_value,
        attack_category: view.attack_category,
        attack_numeric_value: view.attack_numeric_value,
        defence_category: view.defence_category,
        defence_numeric_value: view.defence_numeric_value,
        strength_inputs: view.strength_inputs,
      });
    }
  }

  return [...grouped.values()].map((row) => {
    const counts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const attackCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const defenceCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const fixture of row.fixtures) {
      if (fixture.category && Object.hasOwn(counts, fixture.category)) counts[fixture.category] += 1;
      if (fixture.attack_category && Object.hasOwn(attackCounts, fixture.attack_category)) attackCounts[fixture.attack_category] += 1;
      if (fixture.defence_category && Object.hasOwn(defenceCounts, fixture.defence_category)) defenceCounts[fixture.defence_category] += 1;
    }
    return {
      ...row,
      fixture_count: row.fixtures.length,
      category_counts: counts,
      attack_category_counts: attackCounts,
      defence_category_counts: defenceCounts,
      average_numeric_value: average(row.fixtures.map((fixture) => fixture.numeric_value)),
      average_attack_numeric_value: average(row.fixtures.map((fixture) => fixture.attack_numeric_value)),
      average_defence_numeric_value: average(row.fixtures.map((fixture) => fixture.defence_numeric_value)),
    };
  }).sort((a, b) => {
    const av = a.average_numeric_value ?? Number.POSITIVE_INFINITY;
    const bv = b.average_numeric_value ?? Number.POSITIVE_INFINITY;
    return av - bv || String(a.assessed_team || "").localeCompare(String(b.assessed_team || ""));
  });
}
