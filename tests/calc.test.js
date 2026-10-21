// The worked examples from PLAN.md "Maths rules". Every case must pass before any screen is built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DASH, MODES, playerStat, projection, sharePct, show, teamAverage, working } from '../docs/calc.js';

test('team average: 226 points over 2 games is 113', () => {
  assert.equal(teamAverage(226, 2), 113);
});

test('average is cut, not rounded: 9 blocks over 2 games is 4', () => {
  assert.equal(teamAverage(9, 2), 4);
});

test("share, all team games: player 40 of team's 226 points is 17%", () => {
  assert.equal(sharePct(40, 226), 17);
});

test('projection, all team games: team average 113, share 17% is 19', () => {
  assert.equal(projection(113, 17), 19);
  const s = playerStat({ teamTotal: 226, teamGP: 2, playerTotal: 40, teamTotalInHisGames: 116, playerGP: 1 });
  assert.deepEqual([s.share, s.projection], [17, 19]);
  assert.equal(working(40, s), '100 ÷ 226 × 40 = 17% · 113 × 17% = 19');
});

test('games he played: 40 points in his only game (team 116), team average 113 is 34%, projection 38', () => {
  const s = playerStat(
    { teamTotal: 226, teamGP: 2, playerTotal: 40, teamTotalInHisGames: 116, playerGP: 1 },
    MODES.PLAYED,
  );
  assert.deepEqual([s.share, s.projection], [34, 38]);
  assert.equal(working(40, s), '100 ÷ 116 × 40 = 34% · 113 × 34% = 38');
});

test("low-count stat: player 2 of team's 9 blocks, team average 4 is 22%, projection 0", () => {
  const s = playerStat({ teamTotal: 9, teamGP: 2, playerTotal: 2, teamTotalInHisGames: 9, playerGP: 2 });
  assert.equal(s.avg, 4);
  assert.deepEqual([s.share, s.projection], [22, 0]); // intended: cutting pulls small numbers down
});

test('no games yet: team GP 0 shows "—" with no divide-by-zero error', () => {
  assert.equal(teamAverage(0, 0), null);
  assert.equal(show(teamAverage(0, 0)), DASH);
  for (const mode of [MODES.ALL, MODES.PLAYED]) {
    const s = playerStat({ teamTotal: 0, teamGP: 0, playerTotal: 0, teamTotalInHisGames: 0, playerGP: 0 }, mode);
    assert.equal(show(s.share, '%'), DASH);
    assert.equal(show(s.projection), DASH);
    assert.equal(working(0, s), DASH);
  }
});

test('base total of 0 gives share 0% and projection 0', () => {
  const s = playerStat({ teamTotal: 0, teamGP: 2, playerTotal: 0, teamTotalInHisGames: 0, playerGP: 2 });
  assert.deepEqual([s.share, s.projection], [0, 0]);
});

test('games he played with player GP 0 shows "—"', () => {
  const input = { teamTotal: 226, teamGP: 2, playerTotal: 0, teamTotalInHisGames: 0, playerGP: 0 };
  assert.equal(show(playerStat(input, MODES.PLAYED).share, '%'), DASH);
  assert.equal(playerStat(input, MODES.ALL).share, 0); // all-team-games mode still shows 0%
});

test('exact shares are not lost to floating-point error', () => {
  assert.equal(sharePct(1, 1), 100);
  assert.equal(sharePct(29, 100), 29); // 0.29 * 100 = 28.999... in floating point
  assert.equal(projection(100, 29), 29);
});
