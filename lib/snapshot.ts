// The sealed snapshot: its shape, a strict reader, and the few facts every other module asks of a protocol.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export class SnapshotError extends Error {}

/** Parse and check the snapshot text; a malformed file stops the run with a reason. */
export function parseSnapshot(text: string): Snapshot {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SnapshotError(`snapshot is not JSON: ${(e as Error).message}`);
  }
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new SnapshotError('snapshot needs protocols[] and watchlist[]');
  }
  if (typeof raw.as_of !== 'string' || Number.isNaN(Date.parse(`${raw.as_of}T00:00:00Z`))) throw new SnapshotError('snapshot as_of is not a date');
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const protocols: Protocol[] = [];
  const seen = new Set<string>();
  for (const p of raw.protocols) {
    const slug = str(p?.slug);
    const name = str(p?.name);
    const tvl = num(p?.tvl_usd);
    if (slug === null || name === null || tvl === null || tvl <= 0 || seen.has(slug)) continue;
    seen.add(slug);
    protocols.push({
      slug,
      name,
      category: str(p.category),
      chains: Array.isArray(p.chains) ? p.chains.filter((c: unknown): c is string => typeof c === 'string' && c !== '') : [],
      tvl_usd: tvl,
      change_7d: num(p.change_7d),
      mcap_usd: num(p.mcap_usd),
      listed_at: str(p.listed_at),
      gecko_id: str(p.gecko_id),
      symbol: str(p.symbol),
    });
  }
  if (protocols.length === 0) throw new SnapshotError('snapshot holds no usable protocol');
  return {
    as_of: raw.as_of,
    source: typeof raw.source === 'string' ? raw.source : '',
    floor_usd: num(raw.floor_usd) ?? 50_000_000,
    protocols,
    watchlist: raw.watchlist.filter((s: unknown): s is string => typeof s === 'string' && seen.has(s)),
  };
}

/** True when the record carries a token id or ticker. The record is not proof either way. */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Months between listed_at and the snapshot day; null when the record has no listing day. */
export function monthsListed(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const from = Date.parse(`${listedAt}T00:00:00Z`);
  const to = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, (to - from) / 86_400_000 / 30.4375);
}

/** Categories whose TVL is custody of somebody else's asset: the watchlist rule leaves them out, so do we. */
export const CUSTODY_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
