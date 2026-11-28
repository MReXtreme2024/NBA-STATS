import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADDERS, SAFETY, ladderPicks, pickRung, rungChances } from '../docs/ladders.js';

// Misses shaped like a bell curve (good enough for a test).
const bell = Array.from({ length: 101 }, (_, i) => {
  const p = Math.min(0.995, Math.max(0.005, i / 100));
  const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t ** 3);
  return p < 0.5 ? -z : z;
});
const cal = { pts: { bias: 1, k: 3, shape: bell }, reb: { bias: 1, k: 1.5, shape: bell }, ast: { bias: 1, k: 1.2, shape: bell }, tpm: { bias: 1, k: 1, shape: bell } };

test("Nate's ladders", () => {
  assert.deepEqual(LADDERS.pts, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  assert.deepEqual(LADDERS.reb, [4, 6, 8, 10, 12, 14, 16, 18, 20]);
  assert.deepEqual(LADDERS.ast, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  assert.deepEqual(LADDERS.tpm, [1, 2, 3, 4, 5]);
});

test('rung chances fall as the rungs rise; picks are the highest rung at each safety level', () => {
  const chances = rungChances(25, 'pts', cal);
  for (let i = 1; i < chances.length; i++) assert.ok(chances[i].chance <= chances[i - 1].chance);
  const picks = SAFETY.map((lv) => pickRung(chances, lv));
  picks.forEach((p, i) => {
    assert.ok(p.chance >= SAFETY[i]);
    const next = chances[chances.indexOf(p) + 1];
    assert.ok(!next || next.chance < SAFETY[i]); // the next rung up isn't that safe
  });
  assert.ok(picks[0].n <= picks[1].n && picks[1].n <= picks[2].n); // safer = lower (or the same) rung
});

test('no rung safe enough gives no pick; nothing learned gives no ladder', () => {
  const p = ladderPicks({ pts: 3, reb: 1.2, ast: 0.5, tpm: 0.2 }, cal);
  assert.equal(p.reb[0.9], null);
  assert.equal(p.tpm[0.9], null);
  assert.equal(rungChances(20, 'pts', null), null);
  assert.equal(pickRung(null, 0.9), null);
});

test('fiftyMark: half the results above, half below', async () => {
  const { fiftyMark } = await import('../docs/ladders.js');
  const { chanceOver } = await import('../docs/slips.js');
  const shape = Array.from({ length: 101 }, (_, i) => (i - 50) / 25); // even spread, middle 0
  const cal = { pts: { bias: 0.95, k: 2, shape } };
  const m = fiftyMark(21.5, 'pts', cal);
  assert.ok(Math.abs(m - 0.95 * 21.5) < 1e-9);
  // the .5 lines either side of the mark sit either side of 50%
  assert.ok(chanceOver(21.5, Math.floor(m) - 0.5, cal.pts) >= 0.5);
  assert.ok(chanceOver(21.5, Math.floor(m) + 0.5, cal.pts) <= 0.5);
  assert.equal(fiftyMark(10, 'reb', cal), null);
});

test('markAt: 60% and 70% marks sit below the 50% mark and agree with chanceOver', async () => {
  const { markAt } = await import('../docs/ladders.js');
  const { chanceOver } = await import('../docs/slips.js');
  const shape = Array.from({ length: 101 }, (_, i) => (i - 50) / 25);
  const cal = { pts: { bias: 1, k: 2, shape } };
  const [m5, m6, m7, m8] = [0.5, 0.6, 0.7, 0.8].map((s) => markAt(20, 'pts', cal, s));
  assert.ok(m5 > m6 && m6 > m7 && m7 > m8);
  for (const [m, s] of [[m6, 0.6], [m7, 0.7], [m8, 0.8]]) {
    const below = Math.floor(m - 0.5); // the result has to clear below + 0.5, which is at most m
    assert.ok(chanceOver(20, below, cal.pts) >= s);
    assert.ok(chanceOver(20, below + 1, cal.pts) <= s);
  }
});
