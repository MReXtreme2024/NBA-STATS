// Tries combinations of Claude's formula's main settings on finished games and reports which
// would have been most accurate for points, rebounds and assists (Nate's priorities).
//   node updater/tune.js
// Only trust a result once at least MIN_GAMES games are tested, and only if it wins in both the
// earlier and later half of the games; with fewer games, the "best" settings may just fit luck.

import { MODEL } from './model.js';
import { loadCases, score } from './backtest.js';

const MIN_GAMES = 150;
const GRID = {
  priorRateMinutes: [200, 400, 800], // how much last season's per-minute production counts
  priorMinuteGames: [1, 3, 6], // how much last season's minutes count
  recency: [0.7, 0.85, 1], // how much more recent games count (1 = all equal)
};

const data = await loadCases();
const half = Math.floor(data.cases.length / 2);
const sets = { all: data, early: { ...data, cases: data.cases.slice(0, half) }, late: { ...data, cases: data.cases.slice(half) } };
const current = Object.fromEntries(Object.keys(GRID).map((k) => [k, MODEL[k]]));

// One number to compare settings: points, rebounds and assists misses, each relative to the current formula's.
let baseline;
const measure = (settings) => {
  Object.assign(MODEL, current, settings);
  const r = Object.fromEntries(Object.entries(sets).map(([k, d]) => [k, score(d)]));
  const parts = (set) => ['Points', 'Rebounds', 'Assists'].map((s) => r[set][`${s}: Claude`].avg);
  return { all: parts('all'), early: parts('early'), late: parts('late') };
};
const index = (m, set) => m[set].reduce((t, v, i) => t + v / baseline[set][i], 0) / 3;

baseline = measure({});
const results = [];
const keys = Object.keys(GRID);
const combos = keys.reduce((acc, k) => acc.flatMap((c) => GRID[k].map((v) => ({ ...c, [k]: v }))), [{}]);
for (const c of combos) {
  const m = measure(c);
  results.push({ c, m, all: index(m, 'all'), early: index(m, 'early'), late: index(m, 'late') });
}
Object.assign(MODEL, current);
results.sort((a, b) => a.all - b.all);

const fmt = (m) => `PTS ${m.all[0].toFixed(3)}  REB ${m.all[1].toFixed(3)}  AST ${m.all[2].toFixed(3)}`;
console.log(`${data.cases.length} games tested. Current settings ${JSON.stringify(current)}: ${fmt(baseline)}`);
console.log('Best 5 (score below 1.000 = better than current, in all games / earlier half / later half):');
for (const r of results.slice(0, 5)) {
  console.log(`  ${JSON.stringify(r.c)}  ${fmt(r.m)}  score ${r.all.toFixed(4)} (${r.early.toFixed(4)} / ${r.late.toFixed(4)})`);
}
const best = results[0];
if (data.cases.length < MIN_GAMES) {
  console.log(`Not enough games yet to change anything (${data.cases.length} of ${MIN_GAMES}).`);
} else if (best.all < 0.995 && best.early < 1 && best.late < 1) {
  console.log(`Recommend: ${JSON.stringify(best.c)} (better in both halves).`);
} else {
  console.log('Recommend: keep the current settings.');
}
