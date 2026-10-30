// Bet slips: chances that a player goes over a line, two suggested slips per game, and settling saved
// slips against results. The chances come from the nightly calibration (updater/calibrate.js): how far
// real results have landed from Claude's projections, re-learned from every result each night.

export const SLIP_STATS = ['pts', 'reb', 'ast'];
export const STAT_NAME = { pts: 'points', reb: 'rebounds', ast: 'assists' };
export const MIN_SLIP_MINUTES = 20; // only rotation players go on a slip
// The lowest line a leg can have, so slips use markets bookmakers actually offer (not "over 0.5 assists").
export const MIN_LINE = { pts: 9.5, reb: 3.5, ast: 2.5 };

// Chance he goes over the line (e.g. 22.5 → 23 or more), given his projection. null if not learned yet.
//   cal: { bias, k, shape (101 sorted standardised misses) } for the stat.
export function chanceOver(mu, line, cal) {
  if (!cal?.shape?.length) return null;
  const need = Math.floor(line) + 0.5; // the result has to clear this
  const z = (need - cal.bias * mu) / Math.sqrt(cal.k * Math.max(mu, 1));
  const q = cal.shape;
  if (z <= q[0]) return 1;
  if (z >= q[q.length - 1]) return 0;
  let i = 0;
  while (q[i + 1] < z) i++;
  const frac = q[i + 1] > q[i] ? (z - q[i]) / (q[i + 1] - q[i]) : 0;
  return 1 - (i + frac) / (q.length - 1);
}

// A bookmaker-style line: his average so far, to the .5 below (23.4 → 22.5, 23.6 → 23.5), at least 0.5.
export const lineFor = (avg) => Math.max(0.5, Math.floor(avg - 0.5) + 0.5);

// The two suggested slips for a game: one leg each for points, rebounds and assists, three different players.
//   sides: [{ teamId, players: [{ id, name, min, pts, reb, ast }] }] (Claude's projection, with Nate's lineup);
//   averages: (teamId, playerId) -> { pts, reb, ast } a game this season, or null; cal: nightly calibration.
export function suggestSlips(sides, averages, cal) {
  const pool = sides.flatMap((s) => s.players.filter((p) => p.min >= MIN_SLIP_MINUTES).map((p) => ({ ...p, teamId: s.teamId })));
  const leg = (p, stat) => {
    const avg = averages(p.teamId, p.id)?.[stat] ?? p[stat];
    const line = lineFor(avg);
    return { playerId: p.id, name: p.name, teamId: p.teamId, stat, line, mu: p[stat], chance: chanceOver(p[stat], line, cal?.[stat]) };
  };
  const pick = (score) => {
    const used = new Set();
    return SLIP_STATS.map((stat) => {
      const best = pool.filter((p) => !used.has(p.id)).map((p) => leg(p, stat))
        .filter((l) => l.line >= MIN_LINE[stat])
        .sort((a, b) => score(b) - score(a))[0];
      if (best) used.add(best.playerId);
      return best;
    }).filter(Boolean);
  };
  return [
    { type: 'safest', title: 'Safest overs', legs: pick((l) => (l.chance ?? 0) + l.mu / 1000) },
    { type: 'biggest', title: 'Biggest projections', legs: pick((l) => l.mu) },
  ];
}

// Claude's own two slips (locked: Nate can't edit them). Claude picks the players and the lines, from
// milestone lines bookmakers commonly offer (10+, 15+, 20+ points…). A bookmaker's price roughly follows a
// player's season average, so Claude looks for value: legs where its projection (with the lineup, injuries
// and matchup) beats what his average suggests. Every leg must reach the slip's target chance; of those,
// Claude takes the three different players (one per stat) with the most value (its chance ÷ the chance his
// season average gives), and the likelier line when that's level.
//   averages: (teamId, playerId) -> { pts, reb, ast } a game this season, or null.
export const MILESTONES = {
  pts: [9.5, 14.5, 19.5, 24.5, 29.5, 34.5, 39.5],
  reb: [3.5, 5.5, 7.5, 9.5, 11.5, 13.5, 15.5],
  ast: [2.5, 4.5, 6.5, 8.5, 10.5, 12.5],
};
export const CLAUDE_SLIPS = [
  { type: 'claude-banker', title: "Claude's banker", target: 0.8 },
  { type: 'claude-bigger', title: "Claude's bigger payout", target: 0.55 },
];
export function claudeSlips(sides, averages, cal) {
  if (!SLIP_STATS.every((s) => cal?.[s]?.shape?.length)) return [];
  const pool = sides.flatMap((s) => s.players.filter((p) => p.min >= MIN_SLIP_MINUTES).map((p) => ({ ...p, teamId: s.teamId })));
  return CLAUDE_SLIPS.map(({ type, title, target }) => {
    const options = SLIP_STATS.map((stat) => {
      const best = new Map(); // each player's best leg for this stat
      for (const p of pool) {
        const avg = averages(p.teamId, p.id)?.[stat] ?? p[stat];
        for (const line of MILESTONES[stat]) {
          const chance = chanceOver(p[stat], line, cal[stat]);
          if (chance < target) continue;
          const value = chance / Math.max(0.01, chanceOver(avg, line, cal[stat]));
          const was = best.get(p.id);
          if (!was || value > was.value + 1e-9 || (Math.abs(value - was.value) <= 1e-9 && line > was.line)) {
            best.set(p.id, { playerId: p.id, name: p.name, teamId: p.teamId, stat, line, mu: p[stat], avg, chance, value });
          }
        }
      }
      return [...best.values()];
    });
    let pick = null;
    for (const p of options[0]) for (const r of options[1]) for (const a of options[2]) {
      if (p.playerId === r.playerId || p.playerId === a.playerId || r.playerId === a.playerId) continue;
      const value = p.value * r.value * a.value;
      const chance = p.chance * r.chance * a.chance;
      if (!pick || value > pick.value + 1e-9 || (Math.abs(value - pick.value) <= 1e-9 && chance > pick.chance)) pick = { legs: [p, r, a], value, chance };
    }
    return pick && { type, title, locked: true, legs: pick.legs.map(({ value, ...l }) => l), chance: pick.chance };
  }).filter(Boolean);
}

// All three legs going over, treating them as separate events.
export const slipChance = (legs) => (legs.some((l) => l.chance === null) ? null : legs.reduce((t, l) => t * l.chance, 1));

// Settle a saved slip from recent results: { gameId: { players: { id: [pts, reb, ast] } } }.
// A leg is void if the player didn't play (as bookmakers usually treat it).
export function settle(slip, recent) {
  if (slip.result) return slip.result; // settled earlier and kept (results only stay published for two weeks)
  const game = recent?.[slip.gameId];
  if (!game) return { status: 'pending', legs: slip.legs.map(() => ({ result: 'pending' })) };
  const legs = slip.legs.map((l) => {
    const line = game.players[l.playerId];
    if (!line) return { result: 'void' };
    const actual = line[SLIP_STATS.indexOf(l.stat)];
    return { result: actual > l.line ? 'hit' : 'miss', actual };
  });
  const live = legs.filter((l) => l.result !== 'void');
  const status = !live.length ? 'void' : live.every((l) => l.result === 'hit') ? 'won' : 'lost';
  return { status, legs };
}
