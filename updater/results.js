// Scoring real projections. Each nightly run saves what both formulas projected for that day's
// games (data/projections/<season>/<gameId>.json, made before tip-off with that day's injury
// report and betting line). Once a game is finished, its saved projections are compared with
// what actually happened.

import { MODES, playerStat } from '../docs/calc.js';
import { lineOf } from './model.js';

const STATS = ['pts', 'reb', 'ast'];

// What both formulas projected for one upcoming game, for the players Claude's formula projects.
//   claude: projectGame() result; teams: app-data teams (for Nate's formula).
export function snapshot(game, claude, teams, savedAt) {
  const sides = {};
  for (const side of [claude.home, claude.away]) {
    const t = teams.find((x) => x.id === side.teamId);
    const players = {};
    for (const p of side.players) {
      const mine = t?.players.find((x) => x.id === p.id);
      const nate = Object.fromEntries(STATS.map((s) => [s, mine
        ? playerStat({
          teamTotal: t.totals[s], teamGP: t.gp, playerTotal: mine.totals[s],
          teamTotalInHisGames: mine.teamTotalsInHisGames[s], playerGP: mine.gp,
        }, MODES.ALL).projection
        : null]));
      players[p.id] = {
        name: p.name,
        min: Math.round(p.min * 10) / 10,
        claude: Object.fromEntries(STATS.map((s) => [s, Math.round(p[s] * 100) / 100])),
        nate,
      };
    }
    sides[side.teamId] = { score: Math.round(side.score * 100) / 100, players };
  }
  return { id: game.id, start: game.start, homeId: game.homeId, awayId: game.awayId, savedAt, teams: sides };
}

const dateIn = (iso, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));

// Season-to-date average misses for both formulas, and the most recent day's games in detail.
// Only players both formulas projected and who then played are scored.
export function scoreResults(snapshots, games, timeZone) {
  const finished = new Map(games.map((g) => [g.id, g]));
  const sums = { claude: { pts: 0, reb: 0, ast: 0, pra: 0 }, nate: { pts: 0, reb: 0, ast: 0, pra: 0 } };
  let n = 0;
  const scored = [];
  for (const snap of snapshots) {
    const g = finished.get(snap.id);
    if (!g) continue;
    const players = [];
    for (const side of g.teams) {
      for (const p of side.players) {
        const proj = snap.teams[side.id]?.players[p.id];
        if (!p.played || !proj || STATS.some((s) => proj.nate[s] === null)) continue;
        const l = lineOf(p.stats);
        const actual = { pts: l.pts, reb: l.reb, ast: l.ast };
        for (const f of ['claude', 'nate']) {
          for (const s of STATS) sums[f][s] += Math.abs(proj[f][s] - actual[s]);
          sums[f].pra += Math.abs(STATS.reduce((t, s) => t + proj[f][s] - actual[s], 0));
        }
        n++;
        players.push({ id: p.id, name: proj.name, teamId: side.id, claude: proj.claude, nate: proj.nate, actual });
      }
    }
    const team = (id) => ({ id, projected: snap.teams[id]?.score ?? null, actual: g.teams.find((t) => t.id === id).score });
    scored.push({
      id: g.id, start: g.start, date: dateIn(g.start, timeZone),
      away: team(snap.awayId), home: team(snap.homeId),
      players: players.sort((a, b) => b.actual.pts - a.actual.pts),
    });
  }
  const avg = (f) => Object.fromEntries(Object.entries(sums[f]).map(([k, v]) => [k, n ? v / n : null]));
  const lastDate = scored.map((s) => s.date).sort().at(-1) ?? null;
  return {
    games: scored.length,
    players: n,
    claude: avg('claude'),
    nate: avg('nate'),
    lastDate,
    lastDay: scored.filter((s) => s.date === lastDate).sort((a, b) => a.start.localeCompare(b.start)),
  };
}
