// The board: which protocols are ranked, in what order, and the data the dashboard reads.

import { farmPlan, stepText, YARDSTICK_SHARE } from './farm.ts';
import type { FarmPlan } from './farm.ts';
import { categoryOf, measureMultiples, SHRINK_K, tokenComps } from './multiples.ts';
import type { Multiples } from './multiples.ts';
import { CUSTODY_CATEGORIES, recordsToken } from './snapshot.ts';
import type { Protocol, Snapshot } from './snapshot.ts';
import { ascending, quantile } from './stats.ts';
import { VALUE_MODEL, valueProtocol } from './value.ts';
import type { Valuation } from './value.ts';

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const DERIVED_WORD = /\b(wrapped|staked|staking)\b/i;
const firstWord = (name: string): string => name.toLowerCase().split(/[\s-]+/)[0] ?? '';

/** Exchange names, read from the snapshot: the first word of every protocol it files under CEX. */
export function exchangeNames(protocols: Protocol[]): Set<string> {
  return new Set(protocols.filter((p) => p.category === 'CEX').map((p) => firstWord(p.name)));
}

/** Why a protocol that records no token is still not a pre-token subject, or null when it is one. */
export function setAsideReason(p: Protocol, exchanges: Set<string>): string | null {
  if (CUSTODY_CATEGORIES.has(categoryOf(p))) return 'custody category';
  if (VERSION_MARKER.test(p.name)) return 'a version of an existing protocol';
  if (DERIVED_WORD.test(p.name)) return 'wrapped or staked product';
  if (exchanges.has(firstWord(p.name))) return 'exchange product';
  return null;
}

/** Where a ranked protocol stands against the house watchlist. */
export type Tier = 'watchlist' | 'above-floor' | 'early';

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RankedProtocol {
  protocol: Protocol;
  tier: Tier;
  /** True when another protocol sharing this one's first name word records a token. */
  sibling_token: boolean;
  valuation: Valuation;
  implied_value_usd: number;
  rank: number;
  plan: FarmPlan;
}

/** Rank every pre-token protocol: the whole watchlist, plus every other protocol that records no token and is not set aside. */
export function rankProtocols(snapshot: Snapshot, multiples: Multiples): RankedProtocol[] {
  const watch = new Set(snapshot.watchlist);
  const exchanges = exchangeNames(snapshot.protocols);
  const tokenFirstWords = new Set(snapshot.protocols.filter(recordsToken).map((p) => firstWord(p.name)));
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || (!recordsToken(p) && setAsideReason(p, exchanges) === null));
  const valued = chosen.map((p) => {
    const valuation = valueProtocol(p, snapshot.as_of, multiples);
    return { protocol: p, valuation, implied_value_usd: Math.max(1, Math.round(valuation.mid)) };
  });
  valued.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.protocol.tvl_usd - a.protocol.tvl_usd || (a.protocol.slug < b.protocol.slug ? -1 : 1));
  return valued.map((v, i) => ({
    ...v,
    tier: watch.has(v.protocol.slug) ? 'watchlist' : v.protocol.tvl_usd >= snapshot.floor_usd ? 'above-floor' : 'early',
    sibling_token: tokenFirstWords.has(firstWord(v.protocol.name)),
    rank: i + 1,
    plan: farmPlan(v.protocol, v.valuation.months, v.implied_value_usd, snapshot.as_of),
  }));
}

/** The rows board.json carries, in the gate's shape. */
export function boardRows(ranked: RankedProtocol[]): BoardRow[] {
  return ranked.map((r) => ({
    slug: r.protocol.slug,
    name: r.protocol.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.plan.steps.map(stepText),
  }));
}

/** The first gate rule a board breaks, or null: the same checks the scorer lists, run before anything is written. */
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, the gate takes 100 to 4,000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    const r = byRank[i]!;
    if (!known.has(r.slug) || /\s/.test(r.slug)) return `slug ${r.slug} is not one of the snapshot's`;
    if (seen.has(r.slug)) return `slug ${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.name.trim() === '') return `${r.slug} has no name`;
    if (r.rank !== i + 1) return `ranks are not 1..${rows.length} once each (at ${r.slug})`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) return `${r.slug} implied value is not a positive whole number of dollars`;
    if (i > 0 && r.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `implied value rises at rank ${r.rank}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  if (byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return 'every implied value is the same';
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} is missing`;
  return null;
}

/** A trading token beside what the same model would have said: the reference section and the model's check. */
export interface TradingRow {
  slug: string;
  name: string;
  category: string;
  symbol: string | null;
  /** Protocols in the snapshot that record this token; their TVL is summed. */
  members: number;
  tvl: number;
  mcap: number;
  ratio: number;
  model: number;
}

/** Value every comp with the model that is used on the tokenless, to show its error where the answer is known. */
export function tradingReference(snapshot: Snapshot, multiples: Multiples): { rows: TradingRow[]; in_band: number; median_error: number } {
  const rows: TradingRow[] = [];
  let inBand = 0;
  const errors: number[] = [];
  for (const c of tokenComps(snapshot.protocols)) {
    const v = valueProtocol({ ...c.lead, tvl_usd: c.tvl }, snapshot.as_of, multiples);
    if (c.mcap >= v.low && c.mcap <= v.high) inBand++;
    errors.push(Math.abs(Math.log(v.mid / c.mcap)));
    rows.push({ slug: c.lead.slug, name: c.lead.name, category: categoryOf(c.lead), symbol: c.lead.symbol, members: c.members, tvl: c.tvl, mcap: c.mcap, ratio: c.mcap / c.tvl, model: Math.round(v.mid) });
  }
  rows.sort((a, b) => b.mcap - a.mcap);
  return { rows, in_band: rows.length === 0 ? 0 : inBand / rows.length, median_error: Math.exp(quantile(ascending(errors), 0.5)) };
}

const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d;

/** Everything the page shows, as one plain object. */
export function radarData(snapshot: Snapshot, multiples: Multiples, ranked: RankedProtocol[]): Record<string, unknown> {
  const exchanges = exchangeNames(snapshot.protocols);
  const noToken = snapshot.protocols.filter((p) => !recordsToken(p));
  const aside = new Map<string, number>();
  const rankedSlugs = new Set(ranked.map((r) => r.protocol.slug));
  for (const p of noToken) {
    if (rankedSlugs.has(p.slug)) continue;
    const why = setAsideReason(p, exchanges) ?? 'other';
    aside.set(why, (aside.get(why) ?? 0) + 1);
  }
  const reference = tradingReference(snapshot, multiples);
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      ranked: ranked.length,
      no_token: noToken.length,
      token: snapshot.protocols.length - noToken.length,
      comps: multiples.comps,
      set_aside: [...aside].sort((a, b) => b[1] - a[1]),
    },
    model: {
      ...VALUE_MODEL,
      // Full precision: the page re-runs the model from these and must land on the same dollar.
      slope: multiples.slope,
      intercept: multiples.intercept,
      overall_median: round(multiples.overall_median, 4),
      band_low: round(multiples.band_low, 4),
      band_high: round(multiples.band_high, 4),
      shrink_k: SHRINK_K,
      yardstick_share: YARDSTICK_SHARE,
      in_band: round(reference.in_band, 3),
      median_error: round(reference.median_error, 2),
      categories: [...multiples.categories.values()]
        .sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : 1))
        .map((c) => ({ category: c.category, comps: c.comps, median_ratio: round(c.median_ratio, 4), weight: round(c.weight, 3), tilt: c.tilt })),
    },
    rows: ranked.map((r) => ({
      slug: r.protocol.slug,
      name: r.protocol.name,
      category: categoryOf(r.protocol),
      chains: r.protocol.chains,
      tvl: r.protocol.tvl_usd,
      change_7d: r.protocol.change_7d,
      listed_at: r.protocol.listed_at,
      months: r.valuation.months === null ? null : round(r.valuation.months, 1),
      tier: r.tier,
      sibling_token: r.sibling_token,
      rank: r.rank,
      implied: r.implied_value_usd,
      low: Math.round(r.valuation.low),
      high: Math.round(r.valuation.high),
      multiple: round(r.valuation.multiple, 4),
      size_multiple: round(r.valuation.size_multiple, 4),
      tilt: round(r.valuation.tilt, 3),
      category_comps: r.valuation.category_comps,
      growth: round(r.valuation.growth, 4),
      maturity: round(r.valuation.maturity, 4),
      breadth: round(r.valuation.breadth, 4),
      gaps: r.valuation.gaps,
      plan: {
        label: r.plan.label,
        chain: r.plan.entry_chain,
        ticket: r.plan.ticket_usd,
        days: r.plan.hold_days,
        cost: r.plan.total_cost_usd,
        minutes: r.plan.total_minutes,
        yardstick: r.plan.yardstick_usd,
        risk: r.plan.risk,
        steps: r.plan.steps.map((s) => [s.action, s.cost_usd, s.minutes]),
      },
    })),
    trading: reference.rows,
  };
}

/** Build everything from a snapshot: the gate's rows and the page's data. */
export function buildRadar(snapshot: Snapshot): { rows: BoardRow[]; data: Record<string, unknown>; ranked: RankedProtocol[] } {
  const multiples = measureMultiples(snapshot.protocols);
  const ranked = rankProtocols(snapshot, multiples);
  return { rows: boardRows(ranked), data: radarData(snapshot, multiples, ranked), ranked };
}

/** data.js: the page's data as one global, so the page needs no fetch and no network. */
export function dataScript(data: Record<string, unknown>): string {
  return `window.RADAR = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;
}
