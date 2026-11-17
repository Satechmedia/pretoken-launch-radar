// Comparable multiples, measured from the snapshot itself.
//
// A comparable ("comp") is a token that trades, read from the same snapshot: its market cap over the TVL of
// every protocol that records it (tokenComps). Its mcap/TVL is what the market pays per dollar of TVL.
// Exploring the snapshot (tools/explore.ts) showed two things the model has to respect:
//   1. the multiple falls steeply with size (about 0.5x at $10M of TVL, about 0.05x at $1B), so one flat
//      category median would overvalue every large protocol;
//   2. most categories have only a handful of comps, so a raw category median is noise.
// So the multiple is a robust size curve fitted on all comps, times a category tilt that is the median
// of that category's residuals, shrunk toward zero when the category is thin.

import { CUSTODY_CATEGORIES, recordsToken } from './snapshot.ts';
import type { Protocol } from './snapshot.ts';
import { ascending, clamp, median, quantile, theilSen } from './stats.ts';

/** A category with n comps keeps n / (n + SHRINK_K) of its own tilt. */
export const SHRINK_K = 5;
/** A category tilt can move the multiple by at most this factor either way. */
export const MAX_TILT = 4;

export interface CategoryMultiple {
  category: string;
  comps: number;
  /** Raw median mcap/TVL of the category's comps (what a naive model would use). */
  median_ratio: number;
  /** Share of the category's own evidence kept after shrinkage, 0..1. */
  weight: number;
  /** Multiplier applied on top of the size curve. */
  tilt: number;
}

export interface Multiples {
  comps: number;
  overall_median: number;
  slope: number;
  intercept: number;
  /** Quartiles of the comps' log error around the fitted multiple: the confidence band's width. */
  band_low: number;
  band_high: number;
  categories: Map<string, CategoryMultiple>;
}

export const categoryOf = (p: Protocol): string => p.category ?? 'Uncategorised';

/** One trading token as a comparable: its market cap against the TVL of every protocol that records it. */
export interface Comp {
  /** The largest protocol recording the token; its category, chains, age and growth stand for the token. */
  lead: Protocol;
  /** How many protocols in the snapshot record this token. */
  members: number;
  tvl: number;
  mcap: number;
}

/**
 * One comp per token, not per protocol. A token's market cap is repeated on every product that records it
 * (a V2 and a V3, a lending arm and a DEX arm), so dividing it by one product's TVL overstates the multiple.
 * Protocols are grouped by ticker, their TVL summed, and the group takes its largest member's category.
 * Groups led by a custody category are left out: no ranked protocol is of that kind.
 */
export function tokenComps(protocols: Protocol[]): Comp[] {
  const groups = new Map<string, Protocol[]>();
  for (const p of protocols) {
    if (!recordsToken(p)) continue;
    // Siblings share the ticker, while only one of them carries the token id, so the ticker is the key.
    const key = p.symbol !== null ? `symbol:${p.symbol.toUpperCase()}` : `id:${p.gecko_id}`;
    const g = groups.get(key);
    if (g === undefined) groups.set(key, [p]);
    else g.push(p);
  }
  const comps: Comp[] = [];
  for (const g of groups.values()) {
    const mcap = Math.max(0, ...g.map((p) => p.mcap_usd ?? 0));
    if (mcap <= 0) continue;
    const lead = g.reduce((a, b) => (b.tvl_usd > a.tvl_usd ? b : a));
    if (CUSTODY_CATEGORIES.has(categoryOf(lead))) continue;
    comps.push({ lead, members: g.length, tvl: g.reduce((a, p) => a + p.tvl_usd, 0), mcap });
  }
  return comps.sort((a, b) => (a.lead.slug < b.lead.slug ? -1 : 1));
}

/** Fit the size curve and the shrunken category tilts on the snapshot's comps. */
export function measureMultiples(protocols: Protocol[]): Multiples {
  const comps = tokenComps(protocols);
  const x = comps.map((c) => Math.log(c.tvl));
  const y = comps.map((c) => Math.log(c.mcap / c.tvl));
  const { slope, intercept } = theilSen(x, y);
  const residual = y.map((v, i) => v - intercept - slope * x[i]!);

  const byCategory = new Map<string, { residuals: number[]; ratios: number[] }>();
  comps.forEach((c, i) => {
    const key = categoryOf(c.lead);
    const e = byCategory.get(key) ?? { residuals: [], ratios: [] };
    e.residuals.push(residual[i]!);
    e.ratios.push(c.mcap / c.tvl);
    byCategory.set(key, e);
  });
  const categories = new Map<string, CategoryMultiple>();
  for (const [category, e] of byCategory) {
    const n = e.residuals.length;
    const weight = n / (n + SHRINK_K);
    const logTilt = clamp(weight * median(e.residuals), -Math.log(MAX_TILT), Math.log(MAX_TILT));
    categories.set(category, { category, comps: n, median_ratio: median(e.ratios), weight, tilt: Math.exp(logTilt) });
  }

  // What is left after size and category is the model's honest error on tokens that do trade.
  const left = ascending(comps.map((c, i) => residual[i]! - Math.log(categories.get(categoryOf(c.lead))!.tilt)));
  return {
    comps: comps.length,
    overall_median: median(comps.map((c) => c.mcap / c.tvl)),
    slope,
    intercept,
    band_low: Math.exp(quantile(left, 0.25)),
    band_high: Math.exp(quantile(left, 0.75)),
    categories,
  };
}

/** The size curve's multiple at a TVL, before any category tilt. */
export function sizeMultiple(m: Multiples, tvl: number): number {
  return Math.exp(m.intercept + m.slope * Math.log(tvl));
}

/** The tilt of a category, 1 with zero comps when the snapshot holds no trading token in it. */
export function categoryTilt(m: Multiples, category: string): CategoryMultiple {
  return m.categories.get(category) ?? { category, comps: 0, median_ratio: NaN, weight: 0, tilt: 1 };
}
