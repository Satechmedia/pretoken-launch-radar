// The value model: what a protocol's token would be worth if its record stayed as it is.
//
//   implied value = TVL x size multiple x category tilt x growth x maturity x breadth
//
// The first two factors are measured (lib/multiples.ts). The last three are small, bounded and stated:
// on the snapshot's own trading tokens, seven-day change, age and chain count explain almost none of what
// the size curve leaves over, so they are allowed to nudge a value, never to make one.

import { categoryOf, categoryTilt, sizeMultiple } from './multiples.ts';
import type { Multiples } from './multiples.ts';
import { monthsListed } from './snapshot.ts';
import type { Protocol } from './snapshot.ts';
import { clamp } from './stats.ts';

export const VALUE_MODEL = {
  version: 'size-curve-2',
  /** change_7d is clamped to +/- this many per cent before use: one protocol reports +4448%. */
  growth_clamp_pct: 30,
  /** Half of the clamped weekly move is carried into the value. */
  growth_carry: 0.5,
  /** A record younger than this is still proving its TVL. */
  maturity_full_months: 12,
  /** Value kept by a protocol listed today; it climbs linearly to 1 at maturity_full_months. */
  maturity_floor: 0.75,
  /** Each doubling of the chain count adds this share, up to breadth_cap. */
  breadth_per_doubling: 0.02,
  breadth_cap: 1.1,
  /** The band widens by this factor for each of: no comps in the category, no listing day, no 7d change. */
  band_widen: 1.25,
} as const;

export interface Valuation {
  months: number | null;
  size_multiple: number;
  tilt: number;
  category_comps: number;
  growth: number;
  maturity: number;
  breadth: number;
  /** implied value / TVL after every factor. */
  multiple: number;
  low: number;
  mid: number;
  high: number;
  /** How many of the three inputs behind the band were missing (0 to 3). */
  gaps: number;
}

/** Growth factor: half the weekly TVL move, the move clamped; 1 when unreported. */
export function growthFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  const c = VALUE_MODEL.growth_clamp_pct;
  return 1 + (clamp(change7d, -c, c) / 100) * VALUE_MODEL.growth_carry;
}

/** Maturity factor from months run with no token on record; the midpoint when the listing day is unknown. */
export function maturityFactor(months: number | null): number {
  const floor = VALUE_MODEL.maturity_floor;
  if (months === null) return (1 + floor) / 2;
  return floor + (1 - floor) * Math.min(1, months / VALUE_MODEL.maturity_full_months);
}

/** Breadth factor from the number of chains the TVL sits on. */
export function breadthFactor(chainCount: number): number {
  return Math.min(VALUE_MODEL.breadth_cap, 1 + VALUE_MODEL.breadth_per_doubling * Math.log2(Math.max(1, chainCount)));
}

/** Value one protocol against the measured multiples. */
export function valueProtocol(p: Protocol, asOf: string, m: Multiples): Valuation {
  const months = monthsListed(asOf, p.listed_at);
  const size = sizeMultiple(m, p.tvl_usd);
  const cat = categoryTilt(m, categoryOf(p));
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(months);
  const breadth = breadthFactor(p.chains.length);
  const multiple = size * cat.tilt * growth * maturity * breadth;
  const mid = p.tvl_usd * multiple;
  const gaps = (cat.comps === 0 ? 1 : 0) + (months === null ? 1 : 0) + (p.change_7d === null ? 1 : 0);
  const widen = VALUE_MODEL.band_widen ** gaps;
  return {
    months,
    size_multiple: size,
    tilt: cat.tilt,
    category_comps: cat.comps,
    growth,
    maturity,
    breadth,
    multiple,
    low: (mid * m.band_low) / widen,
    mid,
    high: mid * m.band_high * widen,
    gaps,
  };
}
