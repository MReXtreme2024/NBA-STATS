import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAppData } from '../updater/checks.js';

const teams = (gps) => ({ teams: gps.map((gp, i) => ({ id: String(i + 1), name: `Team ${i + 1}`, gp })) });
const thirty = (gp) => teams(Array(30).fill(gp));

test('30 teams with sensible games played pass', () => {
  assert.doesNotThrow(() => checkAppData(thirty(5), thirty(4)));
  assert.doesNotThrow(() => checkAppData(thirty(0), null)); // first ever run
});

test('missing team fails', () => {
  assert.throws(() => checkAppData(teams(Array(29).fill(1)), null), /30 teams/);
});

test('games played above 82 fails', () => {
  const data = thirty(82);
  data.teams[3].gp = 83;
  assert.throws(() => checkAppData(data, null), /more than 82/);
});

test('games played going down fails', () => {
  const data = thirty(5);
  data.teams[0].gp = 4;
  assert.throws(() => checkAppData(data, thirty(5)), /went down/);
});
