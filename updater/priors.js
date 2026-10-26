// Last season's per-game averages for players, saved in data/prior/<season>.json so each
// player is fetched from ESPN only once (null = didn't play that season).

import fs from 'node:fs';
import path from 'node:path';
import { getSeasonAverages } from './espn.js';

export async function loadPriors(dataDir, seasonLabel, playerIds) {
  const file = path.join(dataDir, 'prior', `${seasonLabel}.json`);
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const missing = [...new Set(playerIds)].filter((id) => !(id in cache));
  for (const id of missing) cache[id] = await getSeasonAverages(id, seasonLabel);
  if (missing.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
  }
  console.log(`Last-season averages: ${missing.length} fetched, ${Object.keys(cache).length} saved`);
  return cache;
}
