import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, marketScores, projectGame, projectScores, teamRatings } from '../updater/model.js';
import { gameExtras } from '../updater/espn.js';

// A tiny made-up league: teams A and B, each with a few players, two games.
const line = (min, pts, reb, ast, tpm) => ({
  minutes: String(min), points: String(pts), rebounds: String(reb), assists: String(ast),
  'threePointFieldGoalsMade-threePointFieldGoalsAttempted': `${tpm}-${tpm * 3}`,
  'fieldGoalsMade-fieldGoalsAttempted': `${Math.floor(pts / 2.5)}-${Math.floor(pts / 1.2)}`,
  'freeThrowsMade-freeThrowsAttempted': '4-5', offensiveRebounds: '1', turnovers: '2',
});
const side = (id, homeAway, players) => ({
  id, homeAway, score: players.reduce((s, p) => s + Number(p.stats?.points ?? 0), 0),
  players: players.map((p) => ({ played: true, ...p })),
});
const teamA = (dnpStar = false) => [
  dnpStar ? { id: 'a1', name: 'A Star', played: false } : { id: 'a1', name: 'A Star', stats: line(36, 30, 6, 7, 3) },
  { id: 'a2', name: 'A Two', stats: line(34, 20, 8, 3, 2) },
  { id: 'a3', name: 'A Three', stats: line(32, 18, 4, 5, 2) },
  { id: 'a4', name: 'A Four', stats: line(30, 14, 10, 2, 0) },
  { id: 'a5', name: 'A Five', stats: line(28, 12, 3, 4, 2) },
  { id: 'a6', name: 'A Bench', stats: line(80, 16, 9, 4, 2) },
];
const teamB = () => [
  { id: 'b1', name: 'B One', stats: line(40, 26, 9, 6, 3) },
  { id: 'b2', name: 'B Two', stats: line(40, 22, 7, 5, 2) },
  { id: 'b3', name: 'B Three', stats: line(40, 20, 9, 4, 2) },
  { id: 'b4', name: 'B Four', stats: line(40, 18, 8, 3, 1) },
  { id: 'b5', name: 'B Five', stats: line(40, 16, 6, 4, 2) },
  { id: 'b6', name: 'B Six', stats: line(40, 12, 5, 2, 1) },
];
const games = [
  { id: 'g1', start: '2026-10-21T23:00Z', teams: [side('A', 'home', teamA()), side('B', 'away', teamB())] },
  { id: 'g2', start: '2026-10-23T23:00Z', teams: [side('B', 'home', teamB()), side('A', 'away', teamA())] },
];
const upcoming = { homeId: 'A', awayId: 'B' };

test('betting market implied scores: home favoured by 13.5 with total 233.5 is 123.5 to 110', () => {
  assert.deepEqual(marketScores({ spread: -13.5, overUnder: 233.5 }), { home: 123.5, away: 110 });
  assert.equal(marketScores(null), null);
});

test('team score blends the market and the stats model; without a line it is the stats model', () => {
  const ratings = teamRatings(games);
  const withLine = projectScores(ratings, 'A', 'B', { spread: -4, overUnder: 220 });
  const w = MODEL.marketWeight;
  assert.ok(Math.abs(withLine.home - (w * 112 + (1 - w) * withLine.model.home)) < 1e-9);
  const noLine = projectScores(ratings, 'A', 'B', null);
  assert.equal(noLine.home, noLine.model.home);
  assert.ok(noLine.model.home > noLine.model.away - 2 * MODEL.homeEdge - 50); // sane numbers
});

test('home court adds to the home team and takes from the away team', () => {
  const r = teamRatings(games);
  const s = projectScores(r, 'A', 'B', null);
  const flipped = projectScores(r, 'B', 'A', null);
  assert.ok(Math.abs((s.model.home - flipped.model.away) - 2 * MODEL.homeEdge) < 1e-9);
});

test("each team's players add up to the projected score, and minutes share out 240", () => {
  const p = projectGame(games, upcoming, { extras: { line: { spread: -4, overUnder: 220 }, injuries: {} } });
  for (const s of [p.home, p.away]) {
    const pts = s.players.reduce((t, x) => t + x.pts, 0);
    assert.ok(Math.abs(pts - s.score) < 0.01, `players ${pts} vs team ${s.score}`);
    const min = s.players.reduce((t, x) => t + x.min, 0);
    assert.ok(Math.abs(min - 240) < 0.01, `minutes ${min}`);
    assert.ok(s.players.every((x) => x.min <= MODEL.maxMinutes + 1e-9));
  }
});

test("a player ruled out is removed and listed as out; his minutes go to teammates", () => {
  const base = projectGame(games, upcoming, { extras: { line: null, injuries: {} } });
  const hurt = projectGame(games, upcoming, { extras: { line: null, injuries: { A: { a1: 'Out' } } } });
  assert.ok(!hurt.home.players.some((x) => x.id === 'a1'));
  assert.deepEqual(hurt.home.out.map((x) => x.name), ['A Star']);
  const five = (r) => r.home.players.find((x) => x.id === 'a5').min;
  assert.ok(five(hurt) > five(base));
});

test('a game-time decision stays in, tagged', () => {
  const p = projectGame(games, upcoming, { extras: { line: null, injuries: { A: { a2: 'Day-To-Day' } } } });
  assert.equal(p.home.players.find((x) => x.id === 'a2').status, 'Day-To-Day');
});

test("last season's averages pull a player's projection toward them", () => {
  const none = projectGame(games, upcoming, {});
  const prior = { a3: { gp: 70, min: 32, pts: 30, reb: 4, ast: 5, tpm: 2 } }; // scored far more last season
  const withPrior = projectGame(games, upcoming, { prior });
  const share = (r) => r.home.players.find((x) => x.id === 'a3').pts / r.home.score;
  assert.ok(share(withPrior) > share(none));
});

test('only players on the current roster are projected when the roster is known', () => {
  const p = projectGame(games, upcoming, { rosters: { A: ['a1', 'a2', 'a3', 'a4', 'a5'] } });
  assert.ok(!p.home.players.some((x) => x.id === 'a6'));
});

test('betting line and injuries are read from an ESPN game summary', () => {
  const summary = {
    pickcenter: [{ provider: { name: 'DraftKings' }, spread: -13.5, overUnder: 233.5 }],
    injuries: [{ team: { id: '4' }, injuries: [{ athlete: { id: '4278067' }, status: 'Out' }, { athlete: { id: '4431687' }, status: 'Day-To-Day' }] }],
  };
  assert.deepEqual(gameExtras(summary), {
    line: { spread: -13.5, overUnder: 233.5 },
    injuries: { 4: { 4278067: 'Out', 4431687: 'Day-To-Day' } },
  });
  assert.deepEqual(gameExtras({}), { line: null, injuries: {} });
});

test('a confirmed lineup re-works a team: players marked out are removed, everyone else plays', async () => {
  const { allocate } = await import('../docs/claude.js');
  const base = projectGame(games, upcoming, { extras: { line: null, injuries: { A: { a2: 'Out' } } } });
  const inputs = base.home.inputs;
  assert.ok(inputs.candidates.length >= 5);
  // No lineup: the same result as the nightly update.
  assert.deepEqual(allocate(inputs).players.map((p) => p.id), base.home.players.map((p) => p.id));
  // Nate confirms a2 is playing after all (starting) and a1 is out.
  const confirmed = allocate(inputs, { starters: ['a2', 'a3', 'a4', 'a5', 'a6'], out: ['a1'] });
  assert.ok(confirmed.players.some((p) => p.id === 'a2'));
  assert.deepEqual(confirmed.out.map((p) => p.id), ['a1']);
  // five players left in this small made-up team: each capped at 42 minutes, never more than 240 in all
  const min = confirmed.players.reduce((t, p) => t + p.min, 0);
  assert.ok(min <= 240 + 1e-9 && confirmed.players.every((p) => p.min <= 42 + 1e-9));
});
