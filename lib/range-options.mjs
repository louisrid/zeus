export function numericRangeOptions(min, max, step) {
  const low = Number(min);
  const high = Number(max);
  const increment = Number(step);
  if (!Number.isFinite(low) || !Number.isFinite(high) || !(increment > 0) || high < low) return [];

  const decimals = increment < 1 ? 1 : 0;
  const count = Math.floor(((high - low) / increment) + 1e-9);
  const values = Array.from({ length: count + 1 }, (_, index) =>
    Number((low + index * increment).toFixed(decimals)));

  const roundedHigh = Number(high.toFixed(decimals));
  if (!values.length || Math.abs(values[values.length - 1] - roundedHigh) > 1e-9) values.push(roundedHigh);
  return values;
}

export function rangeWithMin(range, nextMin) {
  const currentMax = Number(range?.[1]);
  const minimum = Number(nextMin);
  return [minimum, Math.max(minimum, Number.isFinite(currentMax) ? currentMax : minimum)];
}

export function rangeWithMax(range, nextMax) {
  const currentMin = Number(range?.[0]);
  const maximum = Number(nextMax);
  return [Math.min(Number.isFinite(currentMin) ? currentMin : maximum, maximum), maximum];
}
