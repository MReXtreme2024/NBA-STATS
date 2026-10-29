import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onCourt } from '../updater/oncourt.js';
import { playerRatings } from '../updater/model.js';

// A made-up one-quarter game: home H (h1–h5 start, h6 on the bench), away A (a1–a5).
const ath = (id, starter) => ({ athlete: { id }, starter, stats: ['1'] });
const summary = {
  header: { competitions: [{ competitors: [{ homeAway: 'home', team: { id: 'H' } }, { homeAway: 'away', team: { id: 'A' } }] }] },
  boxscore: { players: [
    { team: { id: 'H' }, statistics: [{ athletes: [...['h1', 'h2', 'h3', 'h4', 'h5'].map((i) => ath(i, true)), ath('h6', false)] }] },
    { team: { id: 'A' }, statistics: [{ athletes: ['a1', 'a2', 'a3', 'a4', 'a5'].map((i) => ath(i, true)) }] },
  ] },
  plays: [
    { period: { number: 1 }, clock: { displayValue: '10:00' }, homeScore: 2, awayScore: 0, type: { text: 'Jump Shot' }, participants: [{ athlete: { id: 'h1' } }] },
    { period: { number: 1 }, clock: { displayValue: '6:00' }, homeScore: 2, awayScore: 0, type: { text: 'Substitution' }, participants: [{ athlete: { id: 'h6' } }, { athlete: { id: 'h1' } }] },
    { period: { number: 1 }, clock: { displayValue: '45.5' }, homeScore: 2, awayScore: 3, type: { text: 'Jump Shot' }, participants: [{ athlete: { id: 'a1' } }] },
  ],
};

test('time on court and points for and against follow substitutions', () => {
  const c = onCourt(summary);
  assert.equal(c.h1.secs, 360); // 12:00 to 6:00
  assert.equal(c.h6.secs, 360); // 6:00 to the end
  assert.deepEqual([c.h1.ptsFor, c.h1.ptsAgainst], [2, 0]);
  assert.deepEqual([c.h6.ptsFor, c.h6.ptsAgainst], [0, 3]);
  assert.equal(c.h2.secs, 720);
  assert.equal(c.h2.ptsFor - c.h2.ptsAgainst, -1); // plus-minus
});

test("last-minute clock text (seconds only) is read as seconds", () => {
  assert.equal(onCourt(summary).a1.secs, 720);
});

test('player ratings are differences from his team, pulled toward 0', () => {
  const line = { minutes: '24', points: '0', rebounds: '0', assists: '0', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted': '0-0',
    'fieldGoalsMade-fieldGoalsAttempted': '0-20', 'freeThrowsMade-freeThrowsAttempted': '0-0', offensiveRebounds: '0', turnovers: '0' };
  const side = (id, score, players) => ({ id, score, players: players.map(([pid, oc]) => ({ id: pid, played: true, stats: line, onCourt: oc })) });
  const g = { id: 'g', start: '2026-10-21T00:00Z', teams: [
    side('H', 100, [['good', { secs: 1440, ptsFor: 60, ptsAgainst: 40 }], ['bad', { secs: 1440, ptsFor: 40, ptsAgainst: 60 }]]),
    side('A', 100, [['x', { secs: 2880, ptsFor: 100, ptsAgainst: 100 }]]),
  ] };
  const r = playerRatings([g]);
  assert.ok(r.good.off > 0 && r.good.def < 0, 'better on both ends');
  assert.ok(r.bad.off < 0 && r.bad.def > 0);
  assert.ok(Math.abs(r.good.off) < 20); // pulled toward 0 with few possessions
});
