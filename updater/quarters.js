// Each player's points, rebounds and assists in each quarter, from ESPN's play-by-play (box scores only
// have game totals). Overtime periods are added together as a fifth entry.
//   node updater/quarters.js   fill in saved games that don't have them yet (fetches each game's summary)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// summary -> { playerId: [[pts, reb, ast] Q1, Q2, Q3, Q4, OT] }, or null if there's no play-by-play.
export function quarterLines(summary) {
  const plays = summary.plays ?? [];
  if (!plays.length) return null;
  const out = {};
  const add = (id, q, k, n) => {
    if (!id) return;
    const lines = (out[id] ??= [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    lines[q][k] += n;
  };
  for (const p of plays) {
    const q = Math.min(Number(p.period?.number) || 1, 5) - 1;
    const who = p.participants?.map((x) => x.athlete?.id) ?? [];
    if (p.scoringPlay && p.scoreValue > 0) {
      add(who[0], q, 0, p.scoreValue);
      if (/assists?\)/i.test(p.text ?? '')) add(who[1], q, 2, 1);
    } else if (/rebound/i.test(p.type?.text ?? '') && who[0]) {
      add(who[0], q, 1, 1);
    }
  }
  return out;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Not awaited at the top level: espn.js imports this file, so waiting here would deadlock.
async function backfill() {
  const { getSummary } = await import('./espn.js');
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const dir = path.join(ROOT, 'data', 'games', config.season);
  let done = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const file = path.join(dir, f);
    const game = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (game.teams.every((t) => t.players.every((p) => !p.played || p.quarters))) continue;
    const q = quarterLines(await getSummary(game.id));
    if (!q) continue;
    for (const t of game.teams) for (const p of t.players) if (p.played) p.quarters = q[p.id] ?? [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    fs.writeFileSync(file, JSON.stringify(game, null, 2) + '\n');
    done++;
  }
  console.log(`Added quarter lines to ${done} games`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) backfill();
