// An independent check of out/ against every gate rule in RULES.txt, written apart from lib/board.ts so a
// bug in one is caught by the other.   node tools/validate.ts <out dir> <snapshot.json>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const snap = JSON.parse(readFileSync(process.argv[3] ?? 'input/snapshot.json', 'utf8'));
const fails: string[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail === '' ? '' : `  (${detail})`}`);
  if (!ok) fails.push(name);
};

// dashboard_files
const dash = join(out, 'dashboard');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const files = walk(dash);
const bytes = files.reduce((a, f) => a + statSync(f).size, 0);
check('dashboard has index.html, a .css and a .js', files.includes(join(dash, 'index.html')) && files.some((f) => f.endsWith('.css')) && files.some((f) => f.endsWith('.js')));
check('dashboard within 400 files and 4 MiB', files.length <= 400 && bytes <= 4 * 1024 * 1024, `${files.length} files, ${bytes} bytes`);
check('dashboard source under 64 KB', bytes < 64_000, `${bytes} bytes`);
check('dashboard file names are plain', files.every((f) => f.slice(dash.length + 1).split('/').every((n) => /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(n))));
const urlHits = files.filter((f) => /\.(html|css|js)$/.test(f) && /https?:\/\//.test(readFileSync(f, 'utf8')));
check('no http(s) address anywhere in the dashboard source', urlHits.length === 0, urlHits.join(', '));

// board_file, sorted_by_value, coverage, farm_steps
const raw = readFileSync(join(out, 'board.json'));
const board = JSON.parse(raw.toString('utf8'));
const rows: any[] = Array.isArray(board) ? board : board.rows;
check('board.json at most 8 MiB', raw.length <= 8 * 1024 * 1024, `${raw.length} bytes`);
check('100 to 4,000 rows', rows.length >= 100 && rows.length <= 4000, `${rows.length}`);
const known = new Set<string>(snap.protocols.map((p: any) => p.slug));
check('every slug is the snapshot\'s, no whitespace', rows.every((r) => typeof r.slug === 'string' && r.slug.length >= 1 && r.slug.length <= 128 && !/\s/.test(r.slug) && known.has(r.slug)));
check('slugs are unique', new Set(rows.map((r) => r.slug)).size === rows.length);
check('names are non-empty strings', rows.every((r) => typeof r.name === 'string' && r.name.trim() !== ''));
check('implied values are positive whole dollars within the cap', rows.every((r) => Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14));
const byRank = [...rows].sort((a, b) => a.rank - b.rank);
check('ranks are exactly 1..N', byRank.every((r, i) => r.rank === i + 1));
check('implied value never rises as rank ascends', byRank.every((r, i) => i === 0 || r.implied_value_usd <= byRank[i - 1].implied_value_usd));
check('implied values are not all the same', new Set(rows.map((r) => r.implied_value_usd)).size > 1, `${new Set(rows.map((r) => r.implied_value_usd)).size} distinct`);
const have = new Set(rows.map((r) => r.slug));
const missing = snap.watchlist.filter((s: string) => !have.has(s));
check('every watchlist slug is covered', missing.length === 0, `${snap.watchlist.length - missing.length}/${snap.watchlist.length}`);
check('at least 60 rows are outside the watchlist', rows.filter((r) => !snap.watchlist.includes(r.slug)).length >= 60);
const lens = rows.flatMap((r) => r.farm_steps.map((s: string) => s.trim().length));
check('3 to 12 farm steps per row', rows.every((r) => Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12));
check('each farm step is 20 to 600 characters', rows.every((r) => r.farm_steps.every((s: unknown) => typeof s === 'string' && s.trim().length >= 20 && s.trim().length <= 600)), `min ${Math.min(...lens)}, max ${Math.max(...lens)}`);
check('every farm step states a cost and a time', rows.every((r) => r.farm_steps.every((s: string) => /Cost: /.test(s) && /Time: /.test(s))));
const tokened = rows.filter((r) => { const p = snap.protocols.find((q: any) => q.slug === r.slug); return p.gecko_id !== null || p.symbol !== null; });
check('no ranked row records a token', tokened.length === 0, tokened.map((r) => r.slug).join(', '));

// screenshots
const shotDir = join(out, 'screenshots');
const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.'));
check('3 to 4 screenshots', shots.length >= 3 && shots.length <= 4, shots.join(', '));
for (const n of shots) {
  const b = readFileSync(join(shotDir, n));
  let w = 0, h = 0;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
  else if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9; ) {
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xc3) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  check(`screenshot ${n}: at most 350 KB, long side <= 1440, short side >= 800`, b.length <= 350_000 && Math.max(w, h) <= 1440 && Math.min(w, h) >= 800, `${b.length} bytes, ${w}x${h}`);
}

// dossier_matches
const dossier = readFileSync(join(out, 'dossier.json'));
const rebuilt = Buffer.from(buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
check('dossier.json is what buildDossier writes, at most 1.5 MiB', dossier.equals(rebuilt) && dossier.length <= 1.5 * 1024 * 1024, `${dossier.length} bytes`);
const text: string = JSON.stringify(JSON.parse(dossier.toString('utf8')));
check('dossier text shows every source file whole', !/not shown|left out/.test(text.replace(/\\n/g, '\n').split('## Source')[0] ?? '') && !/lines? (are |is )?not shown/.test(text));

console.log(fails.length === 0 ? '\nall checks pass' : `\n${fails.length} check(s) failed: ${fails.join('; ')}`);
process.exit(fails.length === 0 ? 0 : 1);
