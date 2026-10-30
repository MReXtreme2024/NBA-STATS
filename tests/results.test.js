import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreResults, snapshot } from '../updater/results.js';

const stats = (pts, reb, ast) => ({ minutes: '30', points: String(pts), rebounds: String(reb), assists: String(ast), 'threePointFieldGoalsMade-threePointFieldGoalsAttempted': '1-3' });
const teams = [{ id: 'A', gp: 2, totals: { pts: 200, reb: 80, ast: 40 }, players: [
  { id: 'p1', gp: 2, totals: { pts: 50, reb: 10, ast: 9 }, teamTotalsInHisGames: { pts: 200, reb: 80, ast: 40 } },
] }, { id: 'B', gp: 2, totals: { pts: 210, reb: 90, ast: 44 }, players: [] }];
const claude = {
  home: { teamId: 'A', score: 110.456, players: [{ id: 'p1', name: 'P One', min: 31.24, pts: 24.567, reb: 5.1, ast: 4.2, tpm: 2 }] },
  away: { teamId: 'B', score: 104, players: [] },
};
const game = { id: 'g9', start: '2026-10-28T23:00Z', homeId: 'A', awayId: 'B' };

test("snapshot keeps both formulas' projections; Nate's uses his whole-number maths", () => {
  const s = snapshot(game, claude, teams, '2026-10-28T13:00:00Z');
  assert.deepEqual(s.teams.A.players.p1, { name: 'P One', min: 31.2, claude: { pts: 24.57, reb: 5.1, ast: 4.2 }, nate: { pts: 25, reb: 5, ast: 4 } });
  assert.equal(s.teams.A.score, 110.46);
});

test('finished games are scored; unfinished ones wait', () => {
  const s = snapshot(game, claude, teams, '2026-10-28T13:00:00Z');
  const finished = { id: 'g9', start: game.start, teams: [
    { id: 'A', score: 112, players: [{ id: 'p1', played: true, stats: stats(30, 4, 6) }, { id: 'zz', played: true, stats: stats(10, 1, 1) }] },
    { id: 'B', score: 100, players: [] },
  ] };
  const r = scoreResults([s], [finished], 'Australia/Melbourne');
  assert.equal(r.games, 1);
  assert.equal(r.players, 1); // only players both formulas projected
  assert.ok(Math.abs(r.claude.pts - 5.43) < 1e-9);
  assert.equal(r.nate.pts, 5);
  assert.equal(r.nate.pra, Math.abs(25 + 5 + 4 - 40));
  assert.equal(r.lastDate, '2026-10-29');
  assert.deepEqual(r.lastDay[0].home, { id: 'A', projected: 110.46, actual: 112 });
  assert.equal(scoreResults([s], [], 'Australia/Melbourne').games, 0);
});
