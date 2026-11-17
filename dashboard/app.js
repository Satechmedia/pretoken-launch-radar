// Pre-token Launch Radar: the page. Plain JavaScript, no framework, no network.
// It reads window.RADAR, which main.ts writes to data.js from the same ranked rows as board.json
// (lib/board.ts radarData), and draws three sections: the pre-token board, the already-trading
// reference, and the method. Every view is addressable by the URL, for example
//   index.html#view=detail&slug=<slug>      index.html#cat=RWA&min=100000000&sort=tvl
'use strict';

const D = window.RADAR;
const main = document.getElementById('main');

// ---------------------------------------------------------------- formatting

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** $97.4M, $1.56B, $812K: three significant figures for tables. */
function usd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(n < 100 ? 2 : 0);
}
const usdFull = (n) => '$' + Math.round(n).toLocaleString('en-US');
const mult = (x) => (x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3)) + 'x';
const factor = (x) => '×' + x.toFixed(3);
const pct = (x) => (x === null ? 'n/a' : (x > 0 ? '+' : '') + x.toFixed(1) + '%');
const pctClass = (x) => (x === null ? 'soft' : x > 0 ? 'up' : x < 0 ? 'down' : '');
const age = (m) => (m === null ? 'n/a' : m < 1 ? '<1 mo' : Math.round(m) + ' mo');
function time(min) {
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? h + ' h' : h + ' h ' + m + ' min';
}
const TIER = { watchlist: 'Watchlist', 'above-floor': 'Above floor, off list', early: 'Below floor' };
const tierTag = (t) => `<span class="tag ${t}">${TIER[t]}</span>`;

// ---------------------------------------------------------------- state and URL

const DEFAULTS = { tab: 'board', view: 'list', slug: '', q: '', cat: '', chain: '', min: '0', tier: '', sort: 'rank', dir: 'asc', tsort: 'mcap', tdir: 'desc' };
const state = { ...DEFAULTS };

/** Read the state from the query string and the hash, so a link opens the page in that state. */
function readUrl() {
  Object.assign(state, DEFAULTS);
  for (const part of [location.search.slice(1), location.hash.slice(1)]) {
    for (const [k, v] of new URLSearchParams(part)) {
      if (k === 'filter') state.cat = v;
      else if (k === 'watch') state.tier = v === '1' ? 'watchlist' : '';
      else if (k in DEFAULTS) state[k] = v;
    }
  }
  if (state.view === 'detail') state.tab = 'board';
}

/** Write the state back to the hash, leaving defaults out. */
function writeUrl() {
  const p = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) if (state[k] !== DEFAULTS[k]) p.set(k, state[k]);
  const hash = p.toString();
  history.replaceState(null, '', location.pathname + (hash === '' ? '' : '#' + hash));
}

function go(patch) {
  Object.assign(state, patch);
  writeUrl();
  render();
}

// ---------------------------------------------------------------- the board

const COLUMNS = [
  { key: 'rank', label: '#', get: (r) => r.rank },
  { key: 'name', label: 'Protocol', get: (r) => r.name.toLowerCase() },
  { key: 'tvl', label: 'TVL', num: true, get: (r) => r.tvl },
  { key: 'change', label: '7d', num: true, get: (r) => (r.change_7d === null ? -Infinity : r.change_7d) },
  { key: 'age', label: 'No token for', num: true, get: (r) => (r.months === null ? -1 : r.months) },
  { key: 'multiple', label: 'Multiple', num: true, get: (r) => r.multiple },
  { key: 'implied', label: 'Implied value · band', num: true, get: (r) => r.implied },
  { key: 'plan', label: 'Farm plan', get: (r) => r.plan.label },
  { key: 'cost', label: 'Plan cost', num: true, get: (r) => r.plan.cost },
  { key: 'time', label: 'Time', num: true, get: (r) => r.plan.minutes },
];

/** The rows that pass every filter, in the chosen order. */
function filteredRows() {
  const q = state.q.trim().toLowerCase();
  const min = Number(state.min) || 0;
  const rows = D.rows.filter(
    (r) =>
      (q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.category.toLowerCase().includes(q)) &&
      (state.cat === '' || r.category === state.cat) &&
      (state.chain === '' || r.chains.includes(state.chain)) &&
      (state.tier === '' || r.tier === state.tier) &&
      r.tvl >= min,
  );
  return sortRows(rows, COLUMNS, state.sort, state.dir);
}

function sortRows(rows, columns, key, dir) {
  const col = columns.find((c) => c.key === key) || columns[0];
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sign || a.rank - b.rank || 0;
  });
}

/** <option> list of a field's values with how many rows carry each. */
function options(values, chosen, all) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  const list = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return `<option value="">${all}</option>` + list.map(([v, n]) => `<option value="${esc(v)}"${v === chosen ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('');
}

function headCells(columns, sort, dir, attr) {
  return columns
    .map((c) => `<th class="${c.num ? 'r' : ''}"${c.key === sort ? ` aria-sort="${dir === 'desc' ? 'descending' : 'ascending'}"` : ''}><button ${attr}="${c.key}" title="Sort by ${esc(c.label)}">${esc(c.label)}</button></th>`)
    .join('');
}

/** The low-to-high band as a small bar on a shared log scale, with the mid marked. */
function bandBar(r, lo, hi) {
  const at = (v) => Math.max(0, Math.min(100, ((Math.log(v) - lo) / (hi - lo)) * 100));
  const a = at(r.low), b = at(r.high);
  return `<span class="band" title="${usd(r.low)} to ${usd(r.high)}"><i style="left:${a.toFixed(1)}%;width:${(b - a).toFixed(1)}%"></i><b style="left:${at(r.implied).toFixed(1)}%"></b></span>`;
}

function boardRow(r, lo, hi) {
  return `<tr data-slug="${esc(r.slug)}" tabindex="0">
<td class="rank">${r.rank}</td>
<td><span class="name">${esc(r.name)}</span>${tierTag(r.tier)}<span class="sub">${esc(r.category)} · ${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''}</span></td>
<td class="r num">${usd(r.tvl)}</td>
<td class="r num ${pctClass(r.change_7d)}">${pct(r.change_7d)}</td>
<td class="r num">${age(r.months)}</td>
<td class="r num">${mult(r.multiple)}</td>
<td class="r value">${usd(r.implied)}<span class="sub num">${usd(r.low)}–${usd(r.high)}</span>${bandBar(r, lo, hi)}</td>
<td>${esc(r.plan.label)}<span class="sub">${r.plan.steps.length} steps on ${esc(r.plan.chain)} · $${r.plan.ticket.toLocaleString('en-US')} for ${r.plan.days} d</span></td>
<td class="r num">$${r.plan.cost.toFixed(2)}</td>
<td class="r num">${time(r.plan.minutes)}</td>
</tr>`;
}

function renderBoard() {
  const rows = filteredRows();
  const lo = Math.log(Math.min(...D.rows.map((r) => r.low)));
  const hi = Math.log(Math.max(...D.rows.map((r) => r.high)));
  const mins = [0, 1e7, 2.5e7, 5e7, 1e8, 2.5e8, 1e9];
  const filtered = ['q', 'cat', 'chain', 'tier'].some((k) => state[k] !== '') || state.min !== '0';
  main.innerHTML = `<form class="filters" id="filters" onsubmit="return false">
<label>Search<input type="search" name="q" value="${esc(state.q)}" placeholder="name, slug or category"></label>
<label>Category<select name="cat">${options(D.rows.map((r) => r.category), state.cat, 'All categories')}</select></label>
<label>Chain<select name="chain">${options(D.rows.flatMap((r) => r.chains), state.chain, 'All chains')}</select></label>
<label>Minimum TVL<select name="min">${mins.map((m) => `<option value="${m}"${String(m) === state.min ? ' selected' : ''}>${m === 0 ? 'Any TVL' : usd(m) + ' or more'}</option>`).join('')}</select></label>
<label>Standing<select name="tier"><option value="">All ${D.rows.length} ranked</option>${Object.keys(TIER).map((t) => `<option value="${t}"${state.tier === t ? ' selected' : ''}>${TIER[t]} (${D.rows.filter((r) => r.tier === t).length})</option>`).join('')}</select></label>
<label class="check"><input type="checkbox" name="watch"${state.tier === 'watchlist' ? ' checked' : ''}> Watchlist only</label>
<button type="button" class="plain" id="reset"${filtered ? '' : ' disabled'}>Reset</button>
<span class="count"><b>${rows.length}</b> of ${D.rows.length} protocols · implied value <b>${usd(rows.reduce((a, r) => a + r.implied, 0))}</b></span>
</form>
<div class="wrap"><table id="board"><thead><tr>${headCells(COLUMNS, state.sort, state.dir, 'data-sort')}</tr></thead>
<tbody>${rows.map((r) => boardRow(r, lo, hi)).join('')}</tbody></table>
${rows.length === 0 ? '<p class="empty">No protocol passes these filters. Reset them to see the whole board.</p>' : ''}</div>`;
}

// ---------------------------------------------------------------- the model, re-run in the page

/**
 * The value model again, from a row's snapshot figures alone: TVL, category, 7-day change, listing day and
 * chain count. It mirrors valueProtocol in lib/value.ts, so the page can show that every number on the
 * board follows from the figures beside it and from the multiples measured on the trading tokens.
 */
function impliedFromFigures(r) {
  const m = D.model;
  const size = Math.exp(m.intercept + m.slope * Math.log(r.tvl));
  const cat = m.categories.find((c) => c.category === r.category);
  const tilt = cat ? cat.tilt : 1;
  const c7 = r.change_7d === null ? 0 : Math.max(-m.growth_clamp_pct, Math.min(m.growth_clamp_pct, r.change_7d));
  const growth = 1 + (c7 / 100) * m.growth_carry;
  const months = r.listed_at === null ? null : Math.max(0, (Date.parse(D.as_of) - Date.parse(r.listed_at)) / 86400000 / 30.4375);
  const maturity = months === null ? (1 + m.maturity_floor) / 2 : m.maturity_floor + (1 - m.maturity_floor) * Math.min(1, months / m.maturity_full_months);
  const breadth = Math.min(m.breadth_cap, 1 + m.breadth_per_doubling * Math.log2(Math.max(1, r.chains.length)));
  return Math.max(1, Math.round(r.tvl * size * tilt * growth * maturity * breadth));
}

/** How many rows the page's own run of the model reproduces to within a dollar. */
const reproduced = () => D.rows.filter((r) => Math.abs(impliedFromFigures(r) - r.implied) <= 1).length;

// ---------------------------------------------------------------- the detail view

/** The six lines of the valuation, each with the snapshot figure that produced it. */
function breakdown(r) {
  const m = D.model;
  const cat = m.categories.find((c) => c.category === r.category);
  const lines = [
    ['TVL', usdFull(r.tvl), `Total value locked on ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'} at the snapshot.`],
    ['Size multiple', mult(r.size_multiple), `mcap/TVL the ${D.counts.comps} trading tokens fetch at this TVL: the fitted curve exp(${m.intercept.toFixed(3)} − ${(-m.slope).toFixed(3)} · ln TVL).`],
    ['Category tilt', factor(r.tilt), cat ? `${esc(r.category)}: ${cat.comps} trading comp${cat.comps === 1 ? '' : 's'}, raw median ${mult(cat.median_ratio)}; ${Math.round(cat.weight * 100)}% of their tilt kept after shrinkage.` : `${esc(r.category)}: no trading token in the snapshot, so no tilt and a wider band.`],
    ['Growth', factor(r.growth), r.change_7d === null ? 'No 7-day change reported: neutral, wider band.' : `7-day TVL change ${pct(r.change_7d)}, clamped to ±${m.growth_clamp_pct}%, half of it carried.`],
    ['Maturity', factor(r.maturity), r.months === null ? 'No listing day on record: midpoint, wider band.' : `${r.months} months tracked with no token; ${m.maturity_floor} at listing, 1 from ${m.maturity_full_months} months.`],
    ['Breadth', factor(r.breadth), `${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}: +${m.breadth_per_doubling * 100}% per doubling, capped at ${factor(m.breadth_cap)}.`],
  ];
  return `<table class="calc"><tbody>${lines.map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td><td>${l[2]}</td></tr>`).join('')}
<tr class="total"><td>Implied value</td><td>${usdFull(r.implied)}</td><td>= TVL × ${mult(r.multiple)}. Band ${usdFull(r.low)} to ${usdFull(r.high)}: the middle half of the model’s error on tokens that do trade${r.gaps > 0 ? `, widened for ${r.gaps} missing input${r.gaps === 1 ? '' : 's'}` : ''}. ${Math.abs(impliedFromFigures(r) - r.implied) <= 1 ? 'Re-run in this page from the figures above: same dollar.' : `This page’s re-run gives ${usdFull(impliedFromFigures(r))}.`}</td></tr></tbody></table>`;
}

/** Low, mid, high and TVL on one log axis. */
function scale(r) {
  const lo = Math.log(Math.min(r.low, r.tvl) * 0.6), hi = Math.log(Math.max(r.high, r.tvl) * 1.6);
  const at = (v) => (((Math.log(v) - lo) / (hi - lo)) * 100).toFixed(1);
  return `<div class="scale"><div class="track"></div><div class="range" style="left:${at(r.low)}%;width:${(at(r.high) - at(r.low)).toFixed(1)}%"></div>
<div class="pin" style="left:${at(r.implied)}%"></div><div class="pin tvl" style="left:${at(r.tvl)}%"></div>
<span class="b" style="left:${at(r.low)}%">low ${usd(r.low)}</span><span class="t" style="left:${at(r.implied)}%">implied ${usd(r.implied)}</span>
<span class="b" style="left:${at(r.high)}%">high ${usd(r.high)}</span><span class="t" style="left:${at(r.tvl)}%">TVL ${usd(r.tvl)}</span></div>`;
}

/** Trading tokens of the same category: the comps this row was priced against. */
function peers(r) {
  const list = D.trading.filter((t) => t.category === r.category).sort((a, b) => Math.abs(Math.log(a.tvl / r.tvl)) - Math.abs(Math.log(b.tvl / r.tvl))).slice(0, 4);
  if (list.length === 0) return `<p class="soft">No ${esc(r.category)} protocol in the snapshot has a trading token with a market cap, so this row leans on the size curve alone.</p>`;
  return `<table class="mini"><thead><tr><th>Trading comp, nearest in TVL</th><th class="r">TVL</th><th class="r">Market cap</th><th class="r">mcap/TVL</th></tr></thead><tbody>${list
    .map((t) => `<tr><td>${esc(t.name)} <span class="soft num">${esc(t.symbol || '')}</span></td><td class="r num">${usd(t.tvl)}</td><td class="r num">${usd(t.mcap)}</td><td class="r num">${mult(t.ratio)}</td></tr>`)
    .join('')}</tbody></table>`;
}

function planPanel(r) {
  const p = r.plan;
  return `<section class="panel"><h3>Farm plan · ${esc(p.label)} on ${esc(p.chain)}</h3>
<dl class="sum"><div><dt>Position</dt><dd>$${p.ticket.toLocaleString('en-US')}</dd></div><div><dt>Held</dt><dd>${p.days} days</dd></div><div><dt>Total cost</dt><dd>$${p.cost.toFixed(2)}</dd></div><div><dt>Your time</dt><dd>${time(p.minutes)}</dd></div></dl>
<ol class="steps">${p.steps.map((s) => `<li><span>${esc(s[0])}</span><span class="cost">${s[1] === 0 ? 'no fee' : '$' + s[1].toFixed(2)}<small>${time(s[2])}</small></span></li>`).join('')}</ol>
<p class="risk"><b>Risk.</b> ${esc(p.risk)}</p>
<p class="yard"><b>Scale check, not a forecast.</b> If a token launched at the implied value and ${D.model.yardstick_share * 100}% of it were shared pro rata to TVL, a $${p.ticket.toLocaleString('en-US')} position would be about <b class="num">$${p.yardstick.toFixed(2)}</b> of it, against <b class="num">$${p.cost.toFixed(2)}</b> of cost. Nothing says a token, a share or that rule will exist. Costs are estimates from the chain and category.</p></section>`;
}

function renderDetail() {
  const r = D.rows.find((x) => x.slug === state.slug) || D.rows[0];
  const prev = D.rows.find((x) => x.rank === r.rank - 1), next = D.rows.find((x) => x.rank === r.rank + 1);
  main.innerHTML = `<div class="crumbs"><button class="plain" data-go="list">← Back to the board</button><span class="soft">Rank ${r.rank} of ${D.rows.length} by implied value</span><span class="sp"></span>
${prev ? `<button class="plain" data-slug="${esc(prev.slug)}">↑ #${prev.rank} ${esc(prev.name)}</button>` : ''}${next ? `<button class="plain" data-slug="${esc(next.slug)}">↓ #${next.rank} ${esc(next.name)}</button>` : ''}</div>
<div class="detail"><div>
<section class="panel"><div class="head"><div><h2>${esc(r.name)}${tierTag(r.tier)}${r.sibling_token ? '<span class="tag note" title="Another protocol in the snapshot with the same first name word records a token">sibling records a token</span>' : ''}</h2>
<p class="soft">${esc(r.category)} · DefiLlama records no token for it as of ${D.as_of}${r.listed_at ? ` · tracked since ${r.listed_at}` : ''}</p>
<div class="chips">${r.chains.slice(0, 12).map((c) => `<span>${esc(c)}</span>`).join('')}${r.chains.length > 12 ? `<span>+${r.chains.length - 12} more</span>` : ''}</div></div>
<div class="big">${usd(r.implied)}<small>implied value</small></div></div>
${scale(r)}
<dl class="facts"><div><dt>TVL</dt><dd>${usd(r.tvl)}</dd></div><div><dt>7-day change</dt><dd class="${pctClass(r.change_7d)}">${pct(r.change_7d)}</dd></div><div><dt>No token for</dt><dd>${age(r.months)}</dd></div><div><dt>Implied / TVL</dt><dd>${mult(r.multiple)}</dd></div></dl></section>
<section class="panel"><h3>How the value is built</h3>${breakdown(r)}</section>
<section class="panel"><h3>Priced against tokens that already trade</h3>${peers(r)}</section>
</div><div>${planPanel(r)}</div></div>`;
}

// ---------------------------------------------------------------- already trading

const TRADING_COLUMNS = [
  { key: 'name', label: 'Trading token (largest protocol recording it)', get: (t) => t.name.toLowerCase() },
  { key: 'category', label: 'Category', get: (t) => t.category },
  { key: 'tvl', label: 'TVL', num: true, get: (t) => t.tvl },
  { key: 'mcap', label: 'Market cap (actual)', num: true, get: (t) => t.mcap },
  { key: 'ratio', label: 'mcap/TVL', num: true, get: (t) => t.ratio },
  { key: 'model', label: 'Model would say', num: true, get: (t) => t.model },
  { key: 'miss', label: 'Model / actual', num: true, get: (t) => t.model / t.mcap },
];

function renderTrading() {
  const rows = sortRows(D.trading, TRADING_COLUMNS, state.tsort, state.tdir);
  main.innerHTML = `<div class="filters"><p style="max-width:118ch">These <b>${rows.length}</b> tokens already trade, so their protocols are kept off the board and used as the comparables instead: each token’s market cap over the summed TVL of every protocol that records it is where the board’s multiples come from. The last two columns run the board’s own model on them, where the answer is known: ${Math.round(D.model.in_band * 100)}% of actual market caps fall inside the model’s band, and the typical miss is a factor of ${D.model.median_error}. The other protocols that record a token share one of these tokens, carry no market cap, or sit in custody categories (bridges, liquid staking, exchanges); they are neither ranked nor used.</p></div>
<div class="wrap"><table class="mini" id="trading"><thead><tr>${headCells(TRADING_COLUMNS, state.tsort, state.tdir, 'data-tsort')}</tr></thead><tbody>${rows
    .map((t) => `<tr><td><b>${esc(t.name)}</b> <span class="soft num">${esc(t.symbol || '')}</span>${t.members > 1 ? ` <span class="soft">· ${t.members} protocols</span>` : ''}</td><td>${esc(t.category)}</td><td class="r num">${usd(t.tvl)}</td><td class="r num">${usd(t.mcap)}</td><td class="r num">${mult(t.ratio)}</td><td class="r num">${usd(t.model)}</td><td class="r num">${mult(t.model / t.mcap)}</td></tr>`)
    .join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------- method

/** Scatter of the comps (dots), the fitted size curve (line) and the board's protocols (ticks along the curve). */
function sizePlot() {
  const W = 640, H = 300, L = 46, B = 26, m = D.model;
  const xs = [Math.log(5e6), Math.log(2e10)], ys = [Math.log(0.001), Math.log(30)];
  const X = (v) => L + ((Math.log(v) - xs[0]) / (xs[1] - xs[0])) * (W - L - 8);
  const Y = (v) => H - B - ((Math.log(Math.max(0.001, Math.min(30, v))) - ys[0]) / (ys[1] - ys[0])) * (H - B - 8);
  const curve = (tvl) => Math.exp(m.intercept + m.slope * Math.log(tvl));
  const xt = [1e7, 1e8, 1e9, 1e10].map((v) => `<line class="ax" x1="${X(v)}" x2="${X(v)}" y1="8" y2="${H - B}"/><text x="${X(v)}" y="${H - 8}" text-anchor="middle">${usd(v)} TVL</text>`).join('');
  const yt = [0.01, 0.1, 1, 10].map((v) => `<line class="ax" x1="${L}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${v}x</text>`).join('');
  return `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Market cap over TVL against TVL for trading tokens, with the fitted curve">${xt}${yt}
${D.trading.map((t) => `<circle class="comp" cx="${X(t.tvl).toFixed(1)}" cy="${Y(t.ratio).toFixed(1)}" r="3"><title>${esc(t.name)} ${mult(t.ratio)}</title></circle>`).join('')}
${D.rows.map((r) => `<line class="pre" x1="${X(r.tvl).toFixed(1)}" x2="${X(r.tvl).toFixed(1)}" y1="${(Y(curve(r.tvl)) - 5).toFixed(1)}" y2="${(Y(curve(r.tvl)) + 5).toFixed(1)}"/>`).join('')}
<path class="fit" d="M${X(5e6)} ${Y(curve(5e6))} L${X(2e10)} ${Y(curve(2e10))}"/></svg>
<p class="soft">Dots: the ${D.counts.comps} trading tokens. Green line: the fitted size curve. Rust ticks: where the board’s ${D.rows.length} tokenless protocols sit on it.</p>`;
}

function renderMethod() {
  const m = D.model, c = D.counts;
  main.innerHTML = `<div class="method"><div>
<section class="panel"><h3>The model in one line</h3>
<p class="formula">implied value = TVL × size multiple × category tilt × growth × maturity × breadth</p>
<p>Every number comes from the sealed snapshot of ${D.as_of} (${c.protocols} protocols). No protocol is named in the code: a row’s value follows from its TVL, category, 7-day change, listing day and chains alone.</p>
<ul>
<li><b>Who is ranked.</b> ${c.ranked} protocols that record no token: all ${c.watchlist} on the house watchlist, plus every other tokenless protocol that is not set aside (${c.set_aside.map((s) => `${s[1]} ${esc(s[0])}`).join(', ')}).</li>
<li><b>Who is the yardstick.</b> ${c.comps} tokens that trade with a market cap on record, one comp per token: its cap over the summed TVL of every protocol recording it. Their protocols never appear on the board; they are listed under Already trading.</li>
<li><b>Size multiple.</b> A robust (Theil–Sen) line through the comps: ln(mcap/TVL) = ${m.intercept.toFixed(3)} − ${(-m.slope).toFixed(3)} · ln(TVL). The market pays less per dollar of TVL as TVL grows, so a flat median (${mult(m.overall_median)} here) would overvalue every large protocol.</li>
<li><b>Category tilt.</b> The median of a category’s residuals from that line, shrunk toward no tilt: a category with n comps keeps n/(n+${m.shrink_k}) of it, and no tilt may exceed 4x either way.</li>
<li><b>Growth.</b> Half of the 7-day TVL change, the change clamped to ±${m.growth_clamp_pct}%.</li>
<li><b>Maturity.</b> Months tracked with no token: ${m.maturity_floor} at listing, rising to 1 at ${m.maturity_full_months} months, because young TVL is less proven.</li>
<li><b>Breadth.</b> +${m.breadth_per_doubling * 100}% per doubling of the chain count, capped at ${factor(m.breadth_cap)}.</li>
<li><b>Band.</b> Low and high are the 25th and 75th percentile of the model’s error on the comps (×${m.band_low.toFixed(2)} and ×${m.band_high.toFixed(2)}), widened ×${m.band_widen} for each missing input.</li>
</ul>
<p><b>What it cannot do.</b> Run on the comps themselves, ${Math.round(m.in_band * 100)}% of real market caps land inside the band and the typical miss is a factor of ${m.median_error}. Growth, age and breadth explain little of that error in this snapshot, which is why they are kept small. The model does not say whether or when any token launches.</p>
<p><b>Checked here.</b> This page re-runs the model from each row’s raw figures (impliedFromFigures): <b class="num">${reproduced()} of ${D.rows.length}</b> values match board.json to the dollar.</p></section>
<section class="panel"><h3>Multiple against size, measured</h3>${sizePlot()}</section></div>
<section class="panel"><h3>Category tilts from the ${c.comps} comps</h3>
<table class="mini"><thead><tr><th>Category</th><th class="r">Comps</th><th class="r">Raw median mcap/TVL</th><th class="r">Weight kept</th><th class="r">Tilt used</th><th class="r">Rows on board</th></tr></thead><tbody>${m.categories
    .map((k) => `<tr><td>${esc(k.category)}</td><td class="r num">${k.comps}</td><td class="r num">${mult(k.median_ratio)}</td><td class="r num">${Math.round(k.weight * 100)}%</td><td class="r num">${factor(k.tilt)}</td><td class="r num">${D.rows.filter((r) => r.category === k.category).length}</td></tr>`)
    .join('')}</tbody></table>
<p class="yard">A category with no row here has no trading comp in the snapshot: its tilt is ×1.000 and its band is wider.</p></section></div>`;
}

// ---------------------------------------------------------------- shell and events

function renderTiles() {
  const c = D.counts;
  const covered = D.rows.filter((r) => r.tier === 'watchlist').length;
  const tiles = [
    ['Ranked, no token', c.ranked, `of ${c.no_token} that record none`],
    ['Watchlist covered', `${covered}/${c.watchlist}`, `floor ${usd(D.floor_usd)} TVL`],
    ['Below the floor', D.rows.filter((r) => r.tier === 'early').length, 'the early ones'],
    ['Trading comps', c.comps, 'set apart, not ranked'],
    ['Snapshot', D.as_of, 'DefiLlama, sealed'],
  ];
  document.getElementById('tiles').innerHTML = tiles.map((t) => `<div><dt>${t[0]}</dt><dd>${t[1]}<small>${t[2]}</small></dd></div>`).join('');
  const n = { board: D.rows.length, trading: D.trading.length };
  for (const b of document.querySelectorAll('#tabs button')) {
    if (n[b.dataset.tab] !== undefined && !b.querySelector('span')) b.insertAdjacentHTML('beforeend', `<span>${n[b.dataset.tab]}</span>`);
  }
}

function render() {
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  if (state.tab === 'trading') renderTrading();
  else if (state.tab === 'method') renderMethod();
  else if (state.view === 'detail') renderDetail();
  else renderBoard();
}

/** Clicking a sorted column flips its direction; a new numeric column starts high to low. */
function sortPatch(columns, key, sortKey, dirKey) {
  const col = columns.find((c) => c.key === key);
  const dir = state[sortKey] === key ? (state[dirKey] === 'asc' ? 'desc' : 'asc') : col.num ? 'desc' : 'asc';
  return { [sortKey]: key, [dirKey]: dir };
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) go({ tab: b.dataset.tab, view: 'list' });
});

main.addEventListener('click', (e) => {
  const sort = e.target.closest('[data-sort]'), tsort = e.target.closest('[data-tsort]');
  const slug = e.target.closest('[data-slug]');
  if (sort) go(sortPatch(COLUMNS, sort.dataset.sort, 'sort', 'dir'));
  else if (tsort) go(sortPatch(TRADING_COLUMNS, tsort.dataset.tsort, 'tsort', 'tdir'));
  else if (e.target.closest('#reset')) go({ q: '', cat: '', chain: '', min: '0', tier: '' });
  else if (e.target.closest('[data-go="list"]')) go({ view: 'list' });
  else if (slug) { go({ view: 'detail', slug: slug.dataset.slug }); scrollTo(0, 0); }
});

main.addEventListener('keydown', (e) => {
  const row = e.target.closest('tr[data-slug]');
  if (row && e.key === 'Enter') go({ view: 'detail', slug: row.dataset.slug });
});

/** A filter changed: keep the caret in the search box while the table redraws under it. */
function onFilter(e) {
  const el = e.target;
  if (!el.name || !el.closest('#filters')) return;
  if (el.name === 'watch') state.tier = el.checked ? 'watchlist' : '';
  else state[el.name] = el.value;
  const caret = el.name === 'q' ? el.selectionStart : null;
  writeUrl();
  render();
  if (caret !== null) {
    const box = main.querySelector('input[name="q"]');
    box.focus();
    box.setSelectionRange(caret, caret);
  }
}
main.addEventListener('input', onFilter);
main.addEventListener('change', onFilter);
addEventListener('hashchange', () => { readUrl(); render(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.view === 'detail') go({ view: 'list' }); });

if (!D || !Array.isArray(D.rows)) {
  main.innerHTML = '<p class="empty">data.js is missing. Run main.ts: it writes data.js beside the dashboard folder.</p>';
} else {
  readUrl();
  renderTiles();
  render();
}
