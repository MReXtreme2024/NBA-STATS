// How accurate is Claude's formula? Projects every finished game using only the games before it
// (and the betting line ESPN kept for it), then compares with what happened. Nate's formula
// ("All team games") is scored on the same players for comparison.
//   node updater/backtest.js
// Past injury reports aren't kept, so a player who had been playing for the team but didn't play
// in the game counts as ruled out, as the injury report would usually have shown. Only players
// who then played are scored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGames } from './build.js';
import { projectGame, lineOf } from './model.js';
import { getSummary, gameExtras } from './espn.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const LINES = path.join(ROOT, 'data', 'backtest-lines.json');
export const STATS = [['Points', 'pts'], ['Rebounds', 'reb'], ['Assists', 'ast'], ['3PM', 'tpm']];

// The finished games to test, each with the games before it and its betting line (saved after the first fetch).
export async function loadCases() {
  const games = loadGames(path.join(ROOT, 'data', 'games', config.season)).sort((a, b) => a.start.localeCompare(b.start));
  const priorFile = path.join(ROOT, 'data', 'prior', `${config.priorSeason}.json`);
  const prior = fs.existsSync(priorFile) ? JSON.parse(fs.readFileSync(priorFile, 'utf8')) : {};
  const lines = fs.existsSync(LINES) ? JSON.parse(fs.readFileSync(LINES, 'utf8')) : {};
  const cases = [];
  for (const g of games) {
    const prev = games.filter((x) => x.start < g.start);
    const home = g.teams.find((t) => t.homeAway === 'home');
    const away = g.teams.find((t) => t.homeAway === 'away');
    const before = (id) => prev.filter((x) => x.teams.some((s) => s.id === id));
    if (!before(home.id).length || !before(away.id).length) continue;
    if (!(g.id in lines)) lines[g.id] = gameExtras(await getSummary(g.id)).line;
    const injuries = {};
    for (const side of [home, away]) {
      const playedNow = new Set(side.players.filter((p) => p.played).map((p) => p.id));
      injuries[side.id] = {};
      for (const x of before(side.id)) {
        for (const p of x.teams.find((t) => t.id === side.id).players) {
          if (p.played && !playedNow.has(p.id)) injuries[side.id][p.id] = 'Out';
        }
      }
    }
    cases.push({ g, prev, home, away, line: lines[g.id], injuries, teamGames: { [home.id]: before(home.id), [away.id]: before(away.id) } });
  }
  fs.writeFileSync(LINES, JSON.stringify(lines) + '\n');
  return { cases, prior };
}

// Average misses for Claude's formula (with the current MODEL settings) and Nate's.
export function score({ cases, prior }) {
  const misses = {};
  const add = (k, e) => (misses[k] ??= []).push(Math.abs(e));
  for (const c of cases) {
    const proj = projectGame(c.prev, { homeId: c.home.id, awayId: c.away.id, start: c.g.start }, {
      extras: { line: c.line, injuries: c.injuries }, prior,
    });
    for (const [side, actual] of [['home', c.home], ['away', c.away]]) {
      const s = proj[side];
      add('Team score: Claude', s.score - actual.score);
      add('Team score: stats model only', s.model - actual.score);
      if (s.market !== null) add('Team score: betting market only', s.market - actual.score);
      const tg = c.teamGames[actual.id];
      const tot = {};
      for (const x of tg) {
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
        const nate = Object.fromEntries(Object.entries(tot[p.id]).map(([k, v]) => [k, Math.floor(v / tg.length)]));
        for (const [label, k] of STATS) {
          add(`${label}: Claude`, mine[k] - a[k]);
          add(`${label}: Nate`, nate[k] - a[k]);
        }
        add('P+R+A: Claude', mine.pts + mine.reb + mine.ast - (a.pts + a.reb + a.ast));
        add('P+R+A: Nate', nate.pts + nate.reb + nate.ast - (a.pts + a.reb + a.ast));
      }
    }
  }
  return Object.fromEntries(Object.entries(misses).map(([k, v]) => [k, { avg: v.reduce((s, x) => s + x, 0) / v.length, n: v.length }]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = await loadCases();
  const result = score(data);
  console.log(`${data.cases.length} games tested. Average miss (lower is better):`);
  for (const [k, { avg, n }] of Object.entries(result)) console.log(`  ${k.padEnd(32)} ${avg.toFixed(3)}  (${n})`);
}
