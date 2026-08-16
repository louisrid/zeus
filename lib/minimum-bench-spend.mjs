/* THE ONE MINIMUM BENCH SPEND.
 *
 * The Builder, the exact-squad route and the strict Bench Boost contract all used 16.5 while the generic
 * optimise route passed 17 of its own. Two numbers for one product rule meant the same request could
 * return two different squads depending on which door it came through. The value lives here now and every
 * caller imports it, so the rule can only be changed in one place.
 *
 * It is a floor, not a target and not a cap: a bench may cost this or more. */
export const DEFAULT_MINIMUM_BENCH_SPEND = 16.5;

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function parseMinimumBenchSpend(body, {
  budget = 100,
  required = false,
  defaultValue = DEFAULT_MINIMUM_BENCH_SPEND,
} = {}) {
  const input = body && typeof body === "object" ? body : {};
  const hasPreferred = own(input, "minimum_bench_spend");
  const hasLegacy = own(input, "bench_budget");

  if (required && !hasPreferred && !hasLegacy) {
    return {
      ok: false,
      error: "minimum_bench_spend is required. It is a floor: the four-player bench may cost this amount or more.",
    };
  }

  const preferred = hasPreferred ? Number(input.minimum_bench_spend) : null;
  const legacy = hasLegacy ? Number(input.bench_budget) : null;
  if (hasPreferred && hasLegacy
    && Number.isFinite(preferred) && Number.isFinite(legacy)
    && Math.abs(preferred - legacy) > 1e-9) {
    return {
      ok: false,
      error: "minimum_bench_spend and legacy bench_budget conflict. Supply one minimum value.",
    };
  }

  const value = hasPreferred ? preferred : hasLegacy ? legacy : Number(defaultValue);
  const totalBudget = Number(budget);
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(totalBudget) || value > totalBudget) {
    return {
      ok: false,
      error: "minimum_bench_spend must be between 0 and the total budget.",
    };
  }

  return {
    ok: true,
    value,
    source: hasPreferred ? "minimum_bench_spend" : hasLegacy ? "bench_budget" : "default",
    rule: "at_least",
  };
}
