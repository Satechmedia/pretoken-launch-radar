// Small robust statistics: nothing here knows about protocols.

export const ascending = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);

/** Linear-interpolated quantile of an ascending array; NaN when empty. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

export const median = (xs: number[]): number => quantile(ascending(xs), 0.5);

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Theil-Sen line y = intercept + slope * x: the median of pairwise slopes, so a 400x outlier cannot steer it. */
export function theilSen(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (xs[i] !== xs[j]) slopes.push((ys[j]! - ys[i]!) / (xs[j]! - xs[i]!));
    }
  }
  const slope = slopes.length === 0 ? 0 : median(slopes);
  const intercept = median(ys.map((y, i) => y - slope * xs[i]!));
  return { slope, intercept };
}
