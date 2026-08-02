import test from "node:test";
import assert from "node:assert/strict";
import { fallbackGoalEnvironment, fallbackGoalEnvironmentForTeams } from "../lib/engine/layer0_market.mjs";

const meanGoals = 2.8;
const homeAdvantage = 1.13;
const close = (a, b, epsilon = 1e-4) => assert.ok(Math.abs(a - b) <= epsilon, `${a} vs ${b}`);

function componentTeam({ overall = 3, homeAttack = 1000, awayAttack = 1000, homeDefence = 1000, awayDefence = 1000 } = {}) {
  return {
    strength: overall,
    strength_attack_home: homeAttack,
    strength_attack_away: awayAttack,
    strength_defence_home: homeDefence,
    strength_defence_away: awayDefence,
  };
}

const leagueTeams = [
  componentTeam({ homeAttack: 1200, awayAttack: 1120, homeDefence: 1180, awayDefence: 1100 }),
  componentTeam(),
  componentTeam({ homeAttack: 800, awayAttack: 880, homeDefence: 820, awayDefence: 900 }),
];

const price = (homeTeam, awayTeam) => fallbackGoalEnvironmentForTeams({
  homeTeam, awayTeam, leagueTeams, leagueMeanGoals: meanGoals, homeAdvantage,
});

test("overall strength gaps redistribute a measured total but never add a mismatch bonus", () => {
  const even = fallbackGoalEnvironment(4, 4, meanGoals, homeAdvantage);
  const strong = fallbackGoalEnvironment(5, 2, meanGoals, homeAdvantage);
  const flipped = fallbackGoalEnvironment(2, 5, meanGoals, homeAdvantage);
  for (const result of [even, strong, flipped]) close(result.lambda_home + result.lambda_away, meanGoals);
  assert.ok(strong.lambda_home > even.lambda_home);
  assert.ok(strong.lambda_away < even.lambda_away);
  assert.ok(flipped.lambda_away > flipped.lambda_home);
});

test("component attack versus defence is preferred even when broad overall strengths exist", () => {
  const home = componentTeam({ overall: 5, homeAttack: 850, homeDefence: 1000 });
  const away = componentTeam({ overall: 1, awayAttack: 1000, awayDefence: 1450 });
  const result = price(home, away);
  const broadOnly = fallbackGoalEnvironment(home.strength, away.strength, meanGoals, homeAdvantage);
  assert.equal(result.deoverround_method, "team-component-strength-fallback");
  assert.ok(result.lambda_home < broadOnly.lambda_home, `${result.lambda_home} should be below ${broadOnly.lambda_home}`);
});

test("an elite opposing defence suppresses the attack facing it without boosting the other side", () => {
  const home = componentTeam({ homeAttack: 1120, homeDefence: 1000 });
  const ordinary = price(home, componentTeam({ awayAttack: 1000, awayDefence: 1000 }));
  const elite = price(home, componentTeam({ awayAttack: 1000, awayDefence: 1450 }));
  assert.ok(elite.lambda_home < ordinary.lambda_home, `${elite.lambda_home} should be below ${ordinary.lambda_home}`);
  close(elite.lambda_away, ordinary.lambda_away);
  assert.ok(elite.lambda_home + elite.lambda_away < ordinary.lambda_home + ordinary.lambda_away,
    "difficult defence should reduce the total instead of creating a gap lift");
});

test("a genuinely soft defensive matchup raises only the attack that owns it", () => {
  const home = componentTeam({ homeAttack: 1250, homeDefence: 1000 });
  const normal = price(home, componentTeam({ awayAttack: 1000, awayDefence: 1000 }));
  const soft = price(home, componentTeam({ awayAttack: 1000, awayDefence: 760 }));
  assert.ok(soft.lambda_home > normal.lambda_home);
  close(soft.lambda_away, normal.lambda_away);
});

test("component outputs remain positive, bounded, deterministic and preserve home advantage", () => {
  const extremeHome = componentTeam({ homeAttack: 5000, homeDefence: 5000 });
  const extremeAway = componentTeam({ awayAttack: 100, awayDefence: 100 });
  const first = price(extremeHome, extremeAway);
  const second = price(extremeHome, extremeAway);
  assert.deepEqual(first, second);
  assert.ok(first.lambda_home >= 0.2 && first.lambda_away >= 0.2);
  assert.ok(first.lambda_home <= meanGoals * 1.10 && first.lambda_away <= meanGoals * 1.10);
  assert.ok(first.lambda_home + first.lambda_away <= meanGoals * 1.45 + 1e-4);

  const neutral = price(componentTeam(), componentTeam());
  assert.ok(neutral.lambda_home > neutral.lambda_away, "neutral components should retain measured home advantage");
});

test("the correction is systemic and contains no named-player override", async () => {
  const source = await import("node:fs").then(({ readFileSync }) =>
    readFileSync(new URL("../lib/engine/layer0_market.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /Watkins|Belloumi|Arsenal|Villa/i);
});
