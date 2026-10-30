import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_LINE, chanceOver, lineFor, settle, slipChance, suggestSlips } from '../docs/slips.js';
import { learn } from '../updater/calibrate.js';

// A calibration like the learned one: no lean, spread k, misses shaped like a bell curve.
const bell = Array.from({ length: 101 }, (_, i) => {
  const p = Math.min(0.995, Math.max(0.005, i / 100));
  // inverse of the normal curve (good enough for a test)
  const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t ** 3);
  return p < 0.5 ? -z : z;
});
const cal = { pts: { bias: 1, k: 3, shape: bell }, reb: { bias: 1, k: 1.5, shape: bell }, ast: { bias: 1, k: 1.2, shape: bell } };

test('chance of going over: about 50% at the projection, higher below it, lower above it', () => {
  const at = chanceOver(20.5, 20.5, cal.pts);
  assert.ok(Math.abs(at - 0.5) < 0.05, `${at}`);
  assert.ok(chanceOver(20, 12.5, cal.pts) > 0.8);
  assert.ok(chanceOver(20, 29.5, cal.pts) < 0.15);
  assert.equal(chanceOver(20, 20.5, null), null);
});

test('a bookmaker-style line is his average to the .5 below', () => {
  assert.equal(lineFor(23.4), 22.5);
  assert.equal(lineFor(23.6), 23.5);
  assert.equal(lineFor(0.2), 0.5);
});

test('two slips: one leg each for points, rebounds and assists, three different players, realistic lines', () => {
  const p = (id, min, pts, reb, ast) => ({ id, name: id, min, pts, reb, ast });
  const sides = [
    { teamId: 'A', players: [p('star', 34, 28, 6, 7), p('big', 30, 14, 11, 2), p('pg', 32, 16, 4, 9), p('bench', 12, 9, 3, 2)] },
    { teamId: 'B', players: [p('wing', 33, 19, 5, 3), p('tiny', 25, 4, 1, 1)] },
  ];
  // season averages a little below the projections for some players (their lines sit lower)
  const avgs = { star: { pts: 26, reb: 6, ast: 7 }, big: { pts: 14, reb: 9.2, ast: 2 }, pg: { pts: 16, reb: 4, ast: 7.6 }, wing: { pts: 19, reb: 5, ast: 3 }, tiny: { pts: 4, reb: 1, ast: 1 } };
  const slips = suggestSlips(sides, (t, id) => avgs[id] ?? null, cal);
  assert.deepEqual(slips.map((s) => s.type), ['safest', 'biggest']);
  for (const s of slips) {
    assert.deepEqual(s.legs.map((l) => l.stat), ['pts', 'reb', 'ast']);
    assert.equal(new Set(s.legs.map((l) => l.playerId)).size, 3);
    for (const l of s.legs) assert.ok(l.line >= MIN_LINE[l.stat]);
    assert.ok(!s.legs.some((l) => l.playerId === 'bench' || l.playerId === 'tiny')); // under 20 minutes / tiny lines
  }
  const biggest = slips[1].legs.map((l) => l.playerId);
  assert.deepEqual(biggest, ['star', 'big', 'pg']);
  const safest = slips[0].legs;
  assert.equal(safest.find((l) => l.stat === 'reb').playerId, 'big'); // projected 11 against a 8.5 line
  assert.ok(Math.abs(slipChance(safest) - safest.reduce((t, l) => t * l.chance, 1)) < 1e-12);
});

test('settling: won, lost, void legs, and waiting', () => {
  const slip = { gameId: 'g', legs: [
    { playerId: 'a', stat: 'pts', line: 20.5 }, { playerId: 'b', stat: 'reb', line: 7.5 }, { playerId: 'c', stat: 'ast', line: 4.5 },
  ] };
  assert.equal(settle(slip, {}).status, 'pending');
  const won = settle(slip, { g: { players: { a: [21, 0, 0], b: [0, 8, 0], c: [0, 0, 5] } } });
  assert.equal(won.status, 'won');
  const lost = settle(slip, { g: { players: { a: [20, 0, 0], b: [0, 8, 0], c: [0, 0, 5] } } });
  assert.equal(lost.status, 'lost');
  assert.deepEqual(lost.legs[0], { result: 'miss', actual: 20 }); // exactly on the line is not over
  const voidLeg = settle(slip, { g: { players: { a: [21, 0, 0], b: [0, 8, 0] } } }); // c didn't play
  assert.equal(voidLeg.status, 'won');
  assert.equal(voidLeg.legs[2].result, 'void');
});

test('learning: the lean and spread come from how results compared with projections', () => {
  const records = [];
  for (let i = 0; i < 200; i++) records.push({ stat: 'pts', mu: 20, x: i % 2 ? 22 : 16 }); // results 5% under on average
  const out = learn(records);
  assert.ok(Math.abs(out.pts.bias - 0.95) < 1e-9);
  assert.equal(out.pts.shape.length, 101);
  assert.ok(out.pts.shape[0] < 0 && out.pts.shape[100] > 0);
  assert.equal(out.reb, null); // too few results to learn from
});

test("Claude's locked slips: milestone lines, every leg at the target chance, three different players, value over season average", async () => {
  const { claudeSlips, MILESTONES, CLAUDE_SLIPS } = await import('../docs/slips.js');
  const p = (id, min, pts, reb, ast) => ({ id, name: id, min, pts, reb, ast });
  const sides = [
    { teamId: 'A', players: [p('star', 34, 28, 6, 7), p('big', 30, 14, 11, 2), p('pg', 32, 16, 4, 9), p('bench', 12, 20, 9, 8)] },
    { teamId: 'B', players: [p('wing', 33, 19, 5, 3), p('hot', 30, 18, 5, 3)] },
  ];
  // 'hot' is projected well above his season average (e.g. a teammate is out): value.
  const avgs = { star: { pts: 28, reb: 6, ast: 7 }, big: { pts: 14, reb: 11, ast: 2 }, pg: { pts: 16, reb: 4, ast: 9 }, wing: { pts: 19, reb: 5, ast: 3 }, hot: { pts: 11, reb: 5, ast: 3 } };
  const slips = claudeSlips(sides, (t, id) => avgs[id] ?? null, cal);
  assert.deepEqual(slips.map((s) => s.type), CLAUDE_SLIPS.map((c) => c.type));
  slips.forEach((s, i) => {
    assert.ok(s.locked);
    assert.deepEqual(s.legs.map((l) => l.stat), ['pts', 'reb', 'ast']);
    assert.equal(new Set(s.legs.map((l) => l.playerId)).size, 3);
    for (const l of s.legs) {
      assert.ok(MILESTONES[l.stat].includes(l.line));
      assert.ok(l.chance >= CLAUDE_SLIPS[i].target);
      assert.notEqual(l.playerId, 'bench'); // under 20 minutes
    }
  });
  assert.equal(slips[0].legs[0].playerId, 'hot');
  assert.deepEqual(claudeSlips(sides, () => null, null), []); // nothing learned yet
});

test('a settled slip keeps its result after the game drops out of the published results', () => {
  const kept = { status: 'won', legs: [] };
  assert.equal(settle({ gameId: 'old', legs: [], result: kept }, {}), kept);
});
