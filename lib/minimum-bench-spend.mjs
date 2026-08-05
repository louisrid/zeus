const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function parseMinimumBenchSpend(body, {
  budget = 100,
  required = false,
  defaultValue = 16.5,
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
