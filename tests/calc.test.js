// The worked examples from PLAN.md "Maths rules", updated for Nate's decimals change:
// the formula keeps every decimal, averages and shares show 2 decimals (cut), the projection is cut to a whole number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DASH, MODES, playerStat, projection, sharePct, show, teamAverage, working } from '../docs/calc.js';

const D = { decimals: true };

test('team average: 226 points over 2 games is 113.00', () => {
  assert.equal(show(teamAverage(226, 2), D), '113.00');
});

test('average keeps 2 decimals: 9 blocks over 2 games is 4.50', () => {
  assert.equal(show(teamAverage(9, 2), D), '4.50');
});

test('average decimals are cut, not rounded: 10 over 3 games is 3.33, 20 over 3 is 6.66', () => {
  assert.equal(show(teamAverage(10, 3), D), '3.33');
  assert.equal(show(teamAverage(20, 3), D), '6.66');
});

test("share, all team games: player 40 of team's 226 points is 17.69%", () => {
  assert.equal(show(sharePct(40, 226), D), '17.69');
});

test('projection keeps every decimal: team 226 over 2 games, player 40 of 226 is exactly 20', () => {
  assert.deepEqual(projection(226, 2, 40, 226), { exact: 2000, whole: 20 });
  const s = playerStat({ teamTotal: 226, teamGP: 2, playerTotal: 40, teamTotalInHisGames: 116, playerGP: 1 });
  assert.equal(s.projection, 20);
  assert.equal(working(40, s), '100 ÷ 226 × 40 = 17.69% · 113.00 × 17.69% = 20.00 → 20');
});

test('games he played: 40 points in his only game (team 116), team average 113 is 34.48%, projection 38', () => {
  const s = playerStat(
    { teamTotal: 226, teamGP: 2, playerTotal: 40, teamTotalInHisGames: 116, playerGP: 1 },
    MODES.PLAYED,
  );
  assert.equal(show(s.share, D), '34.48');
  assert.equal(s.projection, 38); // 38.96 is cut to 38
  assert.equal(working(40, s), '100 ÷ 116 × 40 = 34.48% · 113.00 × 34.48% = 38.96 → 38');
});

test("low-count stat: player 2 of team's 9 blocks over 2 games is 22.22%, projection exactly 1", () => {
  const s = playerStat({ teamTotal: 9, teamGP: 2, playerTotal: 2, teamTotalInHisGames: 9, playerGP: 2 });
  assert.equal(show(s.avg, D), '4.50');
  assert.equal(show(s.share, D), '22.22');
  assert.deepEqual([s.exact, s.projection], [100, 1]); // 4.5 × 2/9 = 1 exactly, never 0.9999
});

test('final projection is the whole number only: 20.56 shows as 20', () => {
  // team 257 over 5 games (51.40), player 100 of 250 in his games: 51.4 × 0.4 = 20.56
  assert.deepEqual(projection(257, 5, 100, 250), { exact: 2056, whole: 20 });
});

test('no games yet: team GP 0 shows "—" with no divide-by-zero error', () => {
  assert.equal(teamAverage(0, 0), null);
  assert.equal(show(teamAverage(0, 0), D), DASH);
  for (const mode of [MODES.ALL, MODES.PLAYED]) {
    const s = playerStat({ teamTotal: 0, teamGP: 0, playerTotal: 0, teamTotalInHisGames: 0, playerGP: 0 }, mode);
    assert.equal(show(s.share, { ...D, suffix: '%' }), DASH);
    assert.equal(show(s.projection), DASH);
    assert.equal(working(0, s), DASH);
  }
});

test('base total of 0 gives share 0.00% and projection 0', () => {
  const s = playerStat({ teamTotal: 0, teamGP: 2, playerTotal: 0, teamTotalInHisGames: 0, playerGP: 2 });
  assert.equal(show(s.share, D), '0.00');
  assert.equal(s.projection, 0);
});

test('games he played with player GP 0 shows "—"', () => {
  const input = { teamTotal: 226, teamGP: 2, playerTotal: 0, teamTotalInHisGames: 0, playerGP: 0 };
  assert.equal(show(playerStat(input, MODES.PLAYED).share, D), DASH);
  assert.equal(playerStat(input, MODES.ALL).share, 0); // all-team-games mode still shows 0.00%
});

test('exact values are not lost to floating-point error', () => {
  assert.equal(sharePct(1, 1), 10000); // 100.00%
  assert.equal(sharePct(29, 100), 2900); // 0.29 * 100 = 28.999... in floating point
  assert.deepEqual(projection(100, 1, 29, 100), { exact: 2900, whole: 29 });
  assert.deepEqual(projection(3, 3, 1, 1), { exact: 100, whole: 1 });
});
