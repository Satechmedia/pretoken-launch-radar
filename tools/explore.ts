// Exploration of the sealed snapshot: the numbers the value model is designed from.
//   node tools/explore.ts <snapshot.json>
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'input/snapshot.json';
const snap = JSON.parse(readFileSync(file, 'utf8'));
const ps: any[] = snap.protocols;
const watch = new Set<string>(snap.watchlist);

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return NaN;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
};
const asc = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);
const f = (n: number, d = 3): string => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');
const usd = (n: number): string => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(1)}M`);

console.log(`as_of ${snap.as_of} | floor ${usd(snap.floor_usd)} | ${ps.length} protocols | ${watch.size} on the watchlist`);

const noToken = ps.filter((p) => p.gecko_id === null && p.symbol === null);
const hasToken = ps.filter((p) => !(p.gecko_id === null && p.symbol === null));
const priced = hasToken.filter((p) => typeof p.mcap_usd === 'number' && p.mcap_usd > 0 && p.tvl_usd > 0);
console.log(`records no token: ${noToken.length} | records a token: ${hasToken.length} | of those with a market cap: ${priced.length}`);
console.log(`token recorded but mcap null: ${hasToken.length - priced.length}; no token but mcap set: ${noToken.filter((p) => p.mcap_usd !== null).length}`);

// mcap/TVL of the token-trading protocols, overall and by category.
const ratios = asc(priced.map((p) => p.mcap_usd / p.tvl_usd));
console.log(`\nmcap/TVL overall (n=${ratios.length}): p10 ${f(quantile(ratios, 0.1))} q1 ${f(quantile(ratios, 0.25))} median ${f(quantile(ratios, 0.5))} q3 ${f(quantile(ratios, 0.75))} p90 ${f(quantile(ratios, 0.9))} max ${f(ratios[ratios.length - 1]!, 1)}`);
const logs = priced.map((p) => Math.log(p.mcap_usd / p.tvl_usd));
const meanLog = logs.reduce((a, b) => a + b, 0) / logs.length;
const sdLog = Math.sqrt(logs.reduce((a, b) => a + (b - meanLog) ** 2, 0) / logs.length);
console.log(`log ratio: mean ${f(meanLog)} (=${f(Math.exp(meanLog))}x) sd ${f(sdLog)}`);

const cats = new Map<string, { all: number; noTok: number; watch: number; ratios: number[] }>();
for (const p of ps) {
  const c = p.category ?? '(none)';
  const e = cats.get(c) ?? { all: 0, noTok: 0, watch: 0, ratios: [] };
  e.all++;
  if (p.gecko_id === null && p.symbol === null) e.noTok++;
  if (watch.has(p.slug)) e.watch++;
  if (typeof p.mcap_usd === 'number' && p.mcap_usd > 0 && !(p.gecko_id === null && p.symbol === null)) e.ratios.push(p.mcap_usd / p.tvl_usd);
  cats.set(c, e);
}
console.log('\ncategory                     all noTok watch comps    q1   median     q3');
for (const [c, e] of [...cats].sort((a, b) => b[1].all - a[1].all)) {
  const r = asc(e.ratios);
  console.log(`${c.padEnd(28)} ${String(e.all).padStart(3)} ${String(e.noTok).padStart(5)} ${String(e.watch).padStart(5)} ${String(r.length).padStart(5)} ${f(quantile(r, 0.25)).padStart(7)} ${f(quantile(r, 0.5)).padStart(7)} ${f(quantile(r, 0.75)).padStart(7)}`);
}

// Does the multiple depend on size? mcap/TVL by TVL bucket.
console.log('\nmcap/TVL by TVL bucket (token-trading):');
for (const [lo, hi] of [[5e6, 2e7], [2e7, 5e7], [5e7, 2e8], [2e8, 1e9], [1e9, 1e13]] as const) {
  const r = asc(priced.filter((p) => p.tvl_usd >= lo && p.tvl_usd < hi).map((p) => p.mcap_usd / p.tvl_usd));
  console.log(`  ${usd(lo).padStart(9)}..${usd(hi).padEnd(12)} n=${String(r.length).padStart(3)} q1 ${f(quantile(r, 0.25))} median ${f(quantile(r, 0.5))} q3 ${f(quantile(r, 0.75))}`);
}
// log-log slope of mcap on TVL: 1 means the multiple is flat in size.
{
  const xs = priced.map((p) => Math.log(p.tvl_usd));
  const ys = priced.map((p) => Math.log(p.mcap_usd));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
  console.log(`  log(mcap) = a + b*log(tvl): b = ${f(sxy / sxx)}`);
}

// TVL distribution of the tokenless set.
const tv = asc(noToken.map((p) => p.tvl_usd));
console.log(`\nTVL of no-token protocols (n=${tv.length}): min ${usd(tv[0]!)} q1 ${usd(quantile(tv, 0.25))} median ${usd(quantile(tv, 0.5))} q3 ${usd(quantile(tv, 0.75))} max ${usd(tv[tv.length - 1]!)}`);
console.log(`  at/above floor: ${noToken.filter((p) => p.tvl_usd >= snap.floor_usd).length}, of which on the watchlist: ${watch.size}`);

// Ages.
const asOf = Date.parse(`${snap.as_of}T00:00:00Z`);
const months = (p: any): number | null => (p.listed_at === null ? null : (asOf - Date.parse(`${p.listed_at}T00:00:00Z`)) / 86_400_000 / 30.4375);
const ages = asc(noToken.map(months).filter((m): m is number => m !== null));
console.log(`\nmonths since listed_at, no-token (n=${ages.length}, null ${noToken.length - ages.length}): min ${f(ages[0]!, 1)} q1 ${f(quantile(ages, 0.25), 1)} median ${f(quantile(ages, 0.5), 1)} q3 ${f(quantile(ages, 0.75), 1)} max ${f(ages[ages.length - 1]!, 1)}`);
const agesT = asc(priced.map(months).filter((m): m is number => m !== null));
console.log(`months since listed_at, token-trading: q1 ${f(quantile(agesT, 0.25), 1)} median ${f(quantile(agesT, 0.5), 1)} q3 ${f(quantile(agesT, 0.75), 1)}`);
console.log('mcap/TVL of token-trading by age bucket (months):');
for (const [lo, hi] of [[0, 12], [12, 24], [24, 48], [48, 999]] as const) {
  const r = asc(priced.filter((p) => { const m = months(p); return m !== null && m >= lo && m < hi; }).map((p) => p.mcap_usd / p.tvl_usd));
  console.log(`  ${lo}-${hi}: n=${r.length} median ${f(quantile(r, 0.5))}`);
}

// 7-day change.
const ch = asc(noToken.map((p) => p.change_7d).filter((c): c is number => typeof c === 'number'));
console.log(`\nchange_7d, no-token (n=${ch.length}, null ${noToken.length - ch.length}): min ${f(ch[0]!, 1)} p5 ${f(quantile(ch, 0.05), 1)} q1 ${f(quantile(ch, 0.25), 1)} median ${f(quantile(ch, 0.5), 1)} q3 ${f(quantile(ch, 0.75), 1)} p95 ${f(quantile(ch, 0.95), 1)} max ${f(ch[ch.length - 1]!, 1)}`);

// Chains.
const cc = asc(noToken.map((p) => p.chains.length));
console.log(`chain count, no-token: median ${quantile(cc, 0.5)} q3 ${quantile(cc, 0.75)} p95 ${quantile(cc, 0.95)} max ${cc[cc.length - 1]}; zero chains: ${noToken.filter((p) => p.chains.length === 0).length}`);
const chainFreq = new Map<string, number>();
for (const p of noToken) for (const c of p.chains) chainFreq.set(c, (chainFreq.get(c) ?? 0) + 1);
console.log('top chains (no-token): ' + [...chainFreq].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([c, n]) => `${c} ${n}`).join(', '));
console.log(`distinct chains: ${chainFreq.size}`);

// The watchlist itself.
console.log('\nwatchlist:');
for (const p of ps.filter((p) => watch.has(p.slug)).sort((a, b) => b.tvl_usd - a.tvl_usd)) {
  const m = months(p);
  console.log(`  ${p.slug.padEnd(30)} ${String(p.category).padEnd(22)} ${usd(p.tvl_usd).padStart(9)} ${String(p.change_7d).padStart(9)} ${m === null ? 'n/a' : f(m, 0).padStart(4)}mo chains ${p.chains.length} [${p.chains.slice(0, 4).join(',')}]`);
}
// No-token protocols at/above the floor that the watchlist leaves out, and why (category / name).
console.log('\nno-token, at/above floor, NOT on the watchlist:');
for (const p of noToken.filter((p) => p.tvl_usd >= snap.floor_usd && !watch.has(p.slug)).sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 60)) {
  console.log(`  ${p.slug.padEnd(34)} ${String(p.category).padEnd(22)} ${usd(p.tvl_usd).padStart(9)} ${p.name}`);
}

// Do growth, age or chain breadth explain what the size curve leaves over? Spearman rank correlation of
// the comps' size-adjusted log multiple with each signal.
{
  const comps = priced.filter((p) => p.category !== 'CEX');
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd / p.tvl_usd));
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] !== xs[j]) slopes.push((ys[j]! - ys[i]!) / (xs[j]! - xs[i]!));
  const slope = quantile(asc(slopes), 0.5);
  const icpt = quantile(asc(ys.map((y, i) => y - slope * xs[i]!)), 0.5);
  const resid = ys.map((y, i) => y - icpt - slope * xs[i]!);
  const rs = asc(resid);
  console.log(`\nTheil-Sen size curve on ${comps.length} comps (CEX left out): ln(mcap/tvl) = ${f(icpt)} + ${f(slope)} ln(tvl); residual q1 ${f(quantile(rs, 0.25))} q3 ${f(quantile(rs, 0.75))}`);
  for (const t of [1e7, 5e7, 1e8, 5e8, 1e9, 3e9]) console.log(`  multiple at ${usd(t)}: ${f(Math.exp(icpt + slope * Math.log(t)))}`);
  const rank = (v: number[]): number[] => { const o = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const spearman = (a: number[], b: number[]): number => { const ra = rank(a), rb = rank(b); const n = a.length; let d = 0; for (let i = 0; i < n; i++) d += (ra[i] - rb[i]) ** 2; return 1 - (6 * d) / (n * (n * n - 1)); };
  const withCh = comps.map((p, i) => [p.change_7d, resid[i]!] as const).filter(([c]) => typeof c === 'number');
  console.log(`  spearman(residual, change_7d) n=${withCh.length}: ${f(spearman(withCh.map((x) => x[0] as number), withCh.map((x) => x[1])))}`);
  const withAge = comps.map((p, i) => [months(p), resid[i]!] as const).filter(([m]) => m !== null);
  console.log(`  spearman(residual, months listed) n=${withAge.length}: ${f(spearman(withAge.map((x) => x[0] as number), withAge.map((x) => x[1])))}`);
  console.log(`  spearman(residual, chain count): ${f(spearman(comps.map((p) => p.chains.length), resid))}`);
}

// How many no-token protocols survive the watchlist's own exclusions, with exchange and parent names
// taken from the snapshot itself rather than typed in.
{
  const custody = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
  const versioned = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  const words = /\b(wrapped|staked|staking)\b/i;
  const exch = [...new Set(ps.filter((p) => p.category === 'CEX').map((p) => p.name.split(/\s+/)[0].toLowerCase()))];
  const tokenNames = hasToken.map((p) => p.name.toLowerCase());
  const why = (p: any): string | null => {
    if (custody.has(p.category)) return 'custody category';
    if (versioned.test(p.name)) return 'versioned';
    if (words.test(p.name)) return 'wrapped/staked word';
    const n = p.name.toLowerCase();
    if (exch.some((e) => n === e || n.startsWith(e + ' '))) return 'exchange name';
    if (tokenNames.some((t) => n.startsWith(t + ' '))) return 'child of token name';
    return null;
  };
  const tally = new Map<string, number>();
  const kept: any[] = [];
  for (const p of noToken) { const w = why(p); if (w === null) kept.push(p); else tally.set(w, (tally.get(w) ?? 0) + 1); }
  console.log(`\nrankable no-token: ${kept.length} (above floor ${kept.filter((p) => p.tvl_usd >= snap.floor_usd).length}); dropped: ${[...tally].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  watchlist slugs my rule would drop: ${ps.filter((p) => watch.has(p.slug) && why(p) !== null).map((p) => `${p.slug} (${why(p)})`).join(', ') || 'none'}`);
  console.log('  child-of-token-name drops: ' + noToken.filter((p) => why(p) === 'child of token name').map((p) => p.name).join(' | '));
  console.log('  above floor, kept, off the watchlist: ' + kept.filter((p) => p.tvl_usd >= snap.floor_usd && !watch.has(p.slug)).map((p) => p.name).join(' | '));
}

// One comp per token: siblings (a V2 and a V3, a lending arm and a DEX arm) share a ticker while only one
// carries the market cap, so a per-protocol ratio divides the whole cap by part of the TVL.
{
  const groups = new Map<string, any[]>();
  for (const p of hasToken) { const k = p.symbol !== null ? p.symbol.toUpperCase() : `id:${p.gecko_id}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
  const multi = [...groups].filter(([, g]) => g.length > 1 && g.some((p) => p.mcap_usd > 0));
  console.log(`\ntickers recorded by more than one protocol, with a market cap: ${multi.length}`);
  for (const [k, g] of multi.slice(0, 12)) {
    const mcap = Math.max(...g.map((p) => p.mcap_usd ?? 0));
    const carrier = g.find((p) => p.mcap_usd > 0);
    const sum = g.reduce((a, p) => a + p.tvl_usd, 0);
    console.log(`  ${k.padEnd(8)} ${g.length} protocols: per-protocol ${f(mcap / carrier.tvl_usd)}x on ${carrier.slug}, per-token ${f(mcap / sum)}x`);
  }
}
