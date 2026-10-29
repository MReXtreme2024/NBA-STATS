import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isCountedGame, isCupFinal, isUpcomingGame, trimGame, trimUpcoming } from '../updater/espn.js';
import { checkGame } from '../updater/checks.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const events = read('scoreboard-events.json');
const summary = read('summary-401909088.json');

test('finished regular-season game counts', () => {
  assert.equal(isCountedGame(events.regularFinal, 2027), true);
});

test('live game does not count until final', () => {
  assert.equal(isCountedGame(events.live, 2027), false);
});

test('game from another season does not count', () => {
  assert.equal(isCountedGame(events.regularFinal, 2026), false);
});

// Real 2025-26 games: ESPN labels both as regular season (type 2).
test('NBA Cup semifinal counts', () => {
  assert.equal(isCupFinal(events.cupSemifinal), false);
  assert.equal(isCountedGame(events.cupSemifinal, 2026), true);
});

test('NBA Cup Championship does not count', () => {
  assert.equal(events.cupFinal.season.type, 2);
  assert.equal(isCupFinal(events.cupFinal), true);
  assert.equal(isCountedGame(events.cupFinal, 2026), false);
});

test('trimmed game keeps teams, scores and stat lines by key', () => {
  const game = trimGame(summary, '2026-10-20');
  assert.equal(game.id, '401909088');
  const det = game.teams.find((t) => t.code === 'DET');
  const bos = game.teams.find((t) => t.code === 'BOS');
  assert.equal(det.homeAway, 'home');
  assert.equal(bos.homeAway, 'away');
  assert.equal(det.score, 121);
  assert.equal(bos.score, 113);
  assert.equal(bos.color, '008348');
  const played = bos.players.find((p) => p.played);
  assert.equal(bos.players.filter((p) => p.starter).length, 5);
  assert.ok('threePointFieldGoalsMade-threePointFieldGoalsAttempted' in played.stats);
  const dnp = bos.players.find((p) => !p.played);
  assert.equal(dnp.stats, undefined);
  checkGame(game);
});

test('points check fails when players do not add up to the score', () => {
  const game = trimGame(summary, '2026-10-20');
  game.teams[0].score += 1;
  assert.throws(() => checkGame(game), /final score/);
});

const preGame = {
  id: '401909092', date: '2026-10-22T02:00Z',
  season: { year: 2027, type: 2 }, status: { type: { state: 'pre', completed: false } },
  competitions: [{ notes: [], competitors: [
    { homeAway: 'home', team: { id: '13' } }, { homeAway: 'away', team: { id: '9' } },
  ] }],
};

test('a game that has not started is upcoming; live and finished games are not', () => {
  assert.equal(isUpcomingGame(preGame, 2027), true);
  assert.equal(isUpcomingGame({ ...preGame, status: { type: { state: 'in' } } }, 2027), false);
  assert.equal(isUpcomingGame(events.regularFinal, 2027), false);
  assert.equal(isUpcomingGame({ ...preGame, season: { year: 2027, type: 1 } }, 2027), false); // preseason
});

test('upcoming game keeps start time and home/away teams', () => {
  assert.deepEqual(trimUpcoming(preGame), { id: '401909092', start: '2026-10-22T02:00Z', homeId: '13', awayId: '9', note: '' });
});
