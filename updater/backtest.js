// How accurate is Claude's formula? Projects every finished game using only the games before it
// (and the betting line ESPN kept for it), then compares with what happened. Nate's formula
// ("All team games") is scored on the same players for comparison.
//   node updater/backtest.js
// No injury reports exist for past games, so every player who had played counts as available;
// only players who then played are scored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGames } from './build.js';
import { projectGame, lineOf } from './model.js';
import { getSummary, gameExtras } from './espn.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const games = loadGames(path.join(ROOT, 'data', 'games', config.season)).sort((a, b) => a.start.localeCompare(b.start));
const priorFile = path.join(ROOT, 'data', 'prior', `${config.priorSeason}.json`);
const prior = fs.existsSync(priorFile) ? JSON.parse(fs.readFileSync(priorFile, 'utf8')) : {};

const misses = {};
const add = (k, e) => (misses[k] ??= []).push(Math.abs(e));
let tested = 0;
for (const g of games) {
  const prev = games.filter((x) => x.start < g.start);
  const played = (id) => prev.filter((x) => x.teams.some((s) => s.id === id));
  const home = g.teams.find((t) => t.homeAway === 'home');
  const away = g.teams.find((t) => t.homeAway === 'away');
  if (!played(home.id).length || !played(away.id).length) continue;
  const { line } = gameExtras(await getSummary(g.id));
  const proj = projectGame(prev, { homeId: home.id, awayId: away.id }, { extras: { line, injuries: {} }, prior });
  tested++;
  for (const [side, actual] of [['home', home], ['away', away]]) {
    const s = proj[side];
    add('Team score: Claude', s.score - actual.score);
    add('Team score: stats model only', s.model - actual.score);
    if (s.market !== null) add('Team score: betting market only', s.market - actual.score);
    const teamGames = played(actual.id);
    const tot = {};
    for (const x of teamGames) {
      for (const p of x.teams.find((t) => t.id === actual.id).players) {
        if (!p.played) continue;
        const l = lineOf(p.stats);
        const t = (tot[p.id] ??= { pts: 0, reb: 0, ast: 0, tpm: 0 });
        for (const k of Object.keys(t)) t[k] += l[k];
      }
    }
    for (const p of actual.players) {
      const mine = s.players.find((x) => x.id === p.id);
      if (!p.played || !mine || !tot[p.id]) continue;
      const a = lineOf(p.stats);
      const nate = Object.fromEntries(Object.entries(tot[p.id]).map(([k, v]) => [k, Math.floor(v / teamGames.length)]));
      for (const [label, k] of [['Points', 'pts'], ['Rebounds', 'reb'], ['Assists', 'ast'], ['3PM', 'tpm']]) {
        add(`${label}: Claude`, mine[k] - a[k]);
        add(`${label}: Nate`, nate[k] - a[k]);
      }
      add('P+R+A: Claude', mine.pts + mine.reb + mine.ast - (a.pts + a.reb + a.ast));
      add('P+R+A: Nate', nate.pts + nate.reb + nate.ast - (a.pts + a.reb + a.ast));
    }
  }
}
console.log(`${tested} games tested. Average miss (lower is better):`);
for (const [k, v] of Object.entries(misses)) {
  console.log(`  ${k.padEnd(32)} ${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2)}  (${v.length})`);
}
