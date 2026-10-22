import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trimGame } from '../updater/espn.js';
import { buildAppData, isoIn, nbaCode, textColourFor } from '../updater/build.js';

const summary = JSON.parse(fs.readFileSync(new URL('./fixtures/summary-401909088.json', import.meta.url)));
const game = trimGame(summary, '2026-10-20');
const teams = [
  { id: '2', code: 'BOS', name: 'Boston Celtics', color: '008348' },
  { id: '8', code: 'DET', name: 'Detroit Pistons', color: '1d428a' },
  { id: '18', code: 'NY', name: 'New York Knicks', color: '1d428a' },
];
const config = { season: '2026-27', timeZone: 'Australia/Melbourne', colourOverrides: {} };
const now = new Date('2026-10-21T13:04:00Z');
const data = buildAppData([game], teams, config, now);
const team = (code) => data.teams.find((t) => t.code === code);

// ESPN's own totals row for this game (Celtics 113 @ Pistons 121, 20 Oct 2026).
test('team totals match ESPN box score', () => {
  assert.deepEqual(team('BOS').totals, { pts: 113, reb: 39, ast: 28, tpm: 17, blk: 5, stl: 10 });
  assert.deepEqual(team('DET').totals, { pts: 121, reb: 49, ast: 27, tpm: 15, blk: 5, stl: 7 });
  assert.equal(team('BOS').gp, 1);
});

test('player totals add up to team totals', () => {
  for (const t of [team('BOS'), team('DET')]) {
    for (const s of ['pts', 'reb', 'ast', 'tpm', 'blk', 'stl']) {
      assert.equal(t.players.reduce((sum, p) => sum + p.totals[s], 0), t.totals[s], `${t.code} ${s}`);
    }
  }
});

test('game row shows opponent, home/away and Melbourne date', () => {
  const [row] = team('BOS').games;
  assert.equal(row.opp, 'DET');
  assert.equal(row.home, false);
  assert.equal(row.date, '2026-10-21'); // 3pm Tue in Detroit = 6am Wed in Melbourne
  assert.equal(team('DET').games[0].home, true);
});

test('did-not-play players are listed with 0 GP', () => {
  const dnp = team('BOS').players.find((p) => p.gp === 0);
  assert.ok(dnp);
  assert.deepEqual(dnp.totals, { pts: 0, reb: 0, ast: 0, tpm: 0, blk: 0, stl: 0 });
});

test('team total in his games equals the team total for a one-game season', () => {
  const p = team('BOS').players[0];
  assert.deepEqual(p.teamTotalsInHisGames, team('BOS').totals);
});

test('players sorted by points, teams A-Z, all teams present even with 0 GP', () => {
  const pts = team('BOS').players.map((p) => p.totals.pts);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  assert.deepEqual(data.teams.map((t) => t.name), ['Boston Celtics', 'Detroit Pistons', 'New York Knicks']);
  assert.equal(team('NYK').gp, 0);
});

test('ESPN codes map to NBA codes', () => {
  assert.deepEqual(['NY', 'GS', 'SA', 'NO', 'UTAH', 'WSH', 'BOS'].map(nbaCode),
    ['NYK', 'GSW', 'SAS', 'NOP', 'UTA', 'WAS', 'BOS']);
});

test('colour override and readable text colour', () => {
  const d = buildAppData([], teams, { ...config, colourOverrides: { BOS: 'FFFF00' } }, now);
  assert.equal(d.teams[0].colour, '#ffff00');
  assert.equal(d.teams[0].textColour, '#000000');
  assert.equal(textColourFor('#008348'), '#ffffff');
});

test('check time is Melbourne time with daylight saving offset', () => {
  assert.equal(data.checked, '2026-10-22T00:04:00+11:00');
  assert.equal(isoIn(new Date('2027-06-01T14:00:00Z'), 'Australia/Melbourne'), '2027-06-02T00:00:00+10:00');
});

test('upcoming games are kept in start order; games with unknown teams are dropped', () => {
  const upcoming = { usDate: '2026-10-22', games: [
    { id: 'b', start: '2026-10-23T02:00Z', homeId: '8', awayId: '2', note: '' },
    { id: 'a', start: '2026-10-22T23:00Z', homeId: '18', awayId: '2', note: '' },
    { id: 'x', start: '2026-10-22T23:00Z', homeId: '99', awayId: '2', note: '' },
  ] };
  const d = buildAppData([game], teams, config, now, { upcoming, rosters: { 2: ['1', '2'] } });
  assert.equal(d.upcoming.usDate, '2026-10-22');
  assert.deepEqual(d.upcoming.games.map((g) => g.id), ['a', 'b']);
  assert.deepEqual(d.teams.find((t) => t.code === 'BOS').roster, ['1', '2']);
  assert.equal(d.teams.find((t) => t.code === 'DET').roster, null); // roster unknown
});

test('no upcoming file means an empty upcoming list', () => {
  assert.deepEqual(data.upcoming, { usDate: null, games: [] });
});
