// Player prop ladders (20 Nov 2026, Nate's request): for each player and stat, the chance of clearing every rung
// (5+, 10+, 15+ points…), and the highest rung he clears at least 90%, 80% and 70% of the time. The chances come
// from Claude's projection and the nightly calibration (how far real results land from projections, re-learned
// from every finished game). Tested on every game so far: rungs picked at 90% were cleared 90–96% of the time
// (3PM 89–90%); a player's own hit rate, on its own or blended in, was less accurate.

import { chanceOver } from './slips.js';

export const LADDERS = {
  pts: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  reb: [4, 6, 8, 10, 12, 14, 16, 18, 20],
  ast: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  tpm: [1, 2, 3, 4, 5],
};
export const LADDER_STATS = ['pts', 'reb', 'ast', 'tpm'];
export const SAFETY = [0.9, 0.8, 0.7];
export const MIN_LADDER_MINUTES = 15; // the calibration is learned from players projected 15+ minutes

// Every rung's chance: "N+" = more than N − 0.5. null if that stat isn't learned yet.
export function rungChances(mu, stat, cal) {
  if (!cal?.[stat]?.shape) return null;
  return LADDERS[stat].map((n) => ({ n, chance: chanceOver(mu, n - 0.5, cal[stat]) }));
}

// The highest rung cleared at least `level` of the time, or null if not even the first rung is.
export function pickRung(chances, level) {
  if (!chances) return null;
  let pick = null;
  for (const r of chances) if (r.chance >= level) pick = r;
  return pick;
}

// A player's picks: { pts: { 0.9: { n, chance } | null, 0.8: …, 0.7: … }, … }.
export function ladderPicks(player, cal) {
  return Object.fromEntries(LADDER_STATS.map((s) => {
    const chances = rungChances(player[s], s, cal);
    return [s, Object.fromEntries(SAFETY.map((lv) => [lv, pickRung(chances, lv)]))];
  }));
}
