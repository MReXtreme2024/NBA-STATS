// Claude's formula: projections for an upcoming game, designed by Claude at Nate's request.
// Separate from Nate's formula (docs/calc.js) and its whole-number rules: this model works in
// ordinary decimals and its output is shown cut to one decimal.
//
// Team scores: a possessions model (pace, points per 100 possessions scored and allowed,
// home court), pulled toward league average while samples are small, blended with the
// betting market's implied score when ESPN has a line.
// Players: expected minutes (recent games weigh more, blended with last season, injured
// players' minutes shared out) × per-minute rates (this season blended with last season,
// or league average for players without one), then scaled so each team's players add up
// to the team's projected points, rebounds, assists and 3PM for this matchup.

import { MODEL, allocate } from '../docs/claude.js';

export { MODEL };

const STAT_KEYS = { pts: 'points', reb: 'rebounds', ast: 'assists' };
const num = (v) => Number(v) || 0;
const made = (text) => num(String(text ?? '').split('-')[0]);
const attempted = (text) => num(String(text ?? '').split('-')[1]);
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));
const shrink = (value, league, n, k) => (n * value + k * league) / (n + k);

// One played player's line -> the numbers the model uses.
export function lineOf(stats) {
  return {
    min: num(stats.minutes),
    pts: num(stats[STAT_KEYS.pts]),
    reb: num(stats[STAT_KEYS.reb]),
    ast: num(stats[STAT_KEYS.ast]),
    tpm: made(stats['threePointFieldGoalsMade-threePointFieldGoalsAttempted']),
    fga: attempted(stats['fieldGoalsMade-fieldGoalsAttempted']),
    fta: attempted(stats['freeThrowsMade-freeThrowsAttempted']),
    oreb: num(stats.offensiveRebounds),
    tov: num(stats.turnovers),
  };
}

const sumLines = (lines) => lines.reduce((t, l) => {
  for (const k of Object.keys(l)) t[k] = (t[k] ?? 0) + l[k];
  return t;
}, {});

// Season numbers for every team and the league, from saved games (only those before `before`, if given).
export function teamRatings(games, before = null) {
  const teams = new Map();
  const team = (id) => {
    if (!teams.has(id)) teams.set(id, { gp: 0, poss: 0, pts: 0, oppPts: 0, reb: 0, oppReb: 0, ast: 0, oppAst: 0, tpm: 0, oppTpm: 0 });
    return teams.get(id);
  };
  for (const g of games) {
    if (before && g.start >= before) continue;
    const sides = g.teams.map((s) => ({ id: s.id, t: sumLines(s.players.filter((p) => p.played).map((p) => lineOf(p.stats))) }));
    const possOf = (t) => (t.fga ?? 0) - (t.oreb ?? 0) + (t.tov ?? 0) + 0.44 * (t.fta ?? 0);
    const poss = (possOf(sides[0].t) + possOf(sides[1].t)) / 2;
    for (const [me, opp] of [[sides[0], sides[1]], [sides[1], sides[0]]]) {
      const r = team(me.id);
      r.gp++;
      r.poss += poss;
      r.pts += me.t.pts ?? 0; r.oppPts += opp.t.pts ?? 0;
      r.reb += me.t.reb ?? 0; r.oppReb += opp.t.reb ?? 0;
      r.ast += me.t.ast ?? 0; r.oppAst += opp.t.ast ?? 0;
      r.tpm += me.t.tpm ?? 0; r.oppTpm += opp.t.tpm ?? 0;
    }
  }
  const all = [...teams.values()];
  const games2 = all.reduce((s, r) => s + r.gp, 0) || 1;
  const total = (k) => all.reduce((s, r) => s + r[k], 0);
  const league = {
    pace: total('poss') / games2,
    rtg: (100 * total('pts')) / (total('poss') || 1),
    reb: total('reb') / games2,
    ast: total('ast') / games2,
    tpm: total('tpm') / games2,
  };
  const k = MODEL.shrinkGames;
  const rated = new Map();
  for (const [id, r] of teams) {
    const n = r.gp;
    rated.set(id, {
      gp: n,
      pace: shrink(r.poss / n, league.pace, n, k),
      ortg: shrink((100 * r.pts) / r.poss, league.rtg, n, k),
      drtg: shrink((100 * r.oppPts) / r.poss, league.rtg, n, k),
      reb: shrink(r.reb / n, league.reb, n, k), rebAllowed: shrink(r.oppReb / n, league.reb, n, k),
      ast: shrink(r.ast / n, league.ast, n, k), astAllowed: shrink(r.oppAst / n, league.ast, n, k),
      tpm: shrink(r.tpm / n, league.tpm, n, k), tpmAllowed: shrink(r.oppTpm / n, league.tpm, n, k),
    });
  }
  const blank = { gp: 0, pace: league.pace, ortg: league.rtg, drtg: league.rtg, reb: league.reb, rebAllowed: league.reb, ast: league.ast, astAllowed: league.ast, tpm: league.tpm, tpmAllowed: league.tpm };
  return { league, team: (id) => rated.get(id) ?? blank };
}

// Betting market's implied scores. spread is the home team's line (-13.5 = home favoured by 13.5).
export function marketScores(line) {
  if (!line || !Number.isFinite(line.overUnder) || !Number.isFinite(line.spread)) return null;
  return { home: (line.overUnder - line.spread) / 2, away: (line.overUnder + line.spread) / 2 };
}

// Projected team scores: the possessions model, blended with the market when there is a line.
export function projectScores(ratings, homeId, awayId, line) {
  const { league } = ratings;
  const h = ratings.team(homeId);
  const a = ratings.team(awayId);
  const poss = league.pace * (h.pace / league.pace) * (a.pace / league.pace);
  const model = {
    home: (poss * h.ortg * a.drtg) / league.rtg / 100 + MODEL.homeEdge,
    away: (poss * a.ortg * h.drtg) / league.rtg / 100 - MODEL.homeEdge,
  };
  const market = marketScores(line);
  const w = market ? MODEL.marketWeight : 0;
  return {
    poss,
    model,
    market,
    home: w * (market?.home ?? 0) + (1 - w) * model.home,
    away: w * (market?.away ?? 0) + (1 - w) * model.away,
  };
}

// League per-minute rates, used for players with no last season.
export function leagueRates(games, before = null) {
  let min = 0;
  const tot = { pts: 0, reb: 0, ast: 0, tpm: 0 };
  for (const g of games) {
    if (before && g.start >= before) continue;
    for (const s of g.teams) for (const p of s.players) {
      if (!p.played) continue;
      const l = lineOf(p.stats);
      min += l.min;
      for (const k of Object.keys(tot)) tot[k] += l[k];
    }
  }
  return Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, min ? v / min : 0]));
}

const r = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d; // keep the saved inputs small

export const ROLES = ['PG', 'SG', 'SF', 'PF', 'C'];

// Each player's role. ESPN only lists G, F or C, so guards and forwards are split by how they play
// (this season plus last season): the guards who pass most (assists a minute at or above the guards'
// middle value) are PGs, the rest SGs; the forwards who rebound most are PFs, the rest SFs.
//   groups: { playerId: 'G' | 'F' | 'C' } from ESPN rosters.
export function inferRoles(games, groups, prior = {}, before = null) {
  const tot = new Map();
  for (const g of games) {
    if (before && g.start >= before) continue;
    for (const s of g.teams) for (const p of s.players) {
      if (!p.played) continue;
      const l = lineOf(p.stats);
      const t = tot.get(p.id) ?? { min: 0, reb: 0, ast: 0 };
      t.min += l.min; t.reb += l.reb; t.ast += l.ast;
      tot.set(p.id, t);
    }
  }
  const rateOf = (id, k) => {
    const t = tot.get(id) ?? { min: 0, reb: 0, ast: 0 };
    const pr = prior[id];
    const min = t.min + (pr ? pr.min * pr.gp : 0);
    return min > 0 ? (t[k] + (pr ? pr[k] * pr.gp : 0)) / min : null;
  };
  const middle = (xs) => {
    const v = xs.filter((x) => x !== null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  const ids = Object.keys(groups);
  const guardAst = middle(ids.filter((id) => groups[id] === 'G').map((id) => rateOf(id, 'ast')));
  const forwardReb = middle(ids.filter((id) => groups[id] === 'F').map((id) => rateOf(id, 'reb')));
  const roles = {};
  for (const id of ids) {
    const grp = groups[id];
    if (grp === 'C') roles[id] = 'C';
    else if (grp === 'G') roles[id] = (rateOf(id, 'ast') ?? 0) >= guardAst ? 'PG' : 'SG';
    else if (grp === 'F') roles[id] = (rateOf(id, 'reb') ?? 0) >= forwardReb ? 'PF' : 'SF';
  }
  return roles;
}

// League per-minute points, rebounds, assists and 3PM by role, for when Nate moves a player.
export function positionRates(games, roles, before = null) {
  const min = Object.fromEntries(ROLES.map((k) => [k, 0]));
  const tot = Object.fromEntries(ROLES.map((k) => [k, { pts: 0, reb: 0, ast: 0, tpm: 0 }]));
  for (const g of games) {
    if (before && g.start >= before) continue;
    for (const s of g.teams) for (const p of s.players) {
      const pos = roles[p.id];
      if (!p.played || !(pos in min)) continue;
      const l = lineOf(p.stats);
      min[pos] += l.min;
      for (const k of Object.keys(tot[pos])) tot[pos][k] += l[k];
    }
  }
  return Object.fromEntries(Object.entries(tot).map(([pos, t]) => [pos,
    Object.fromEntries(Object.entries(t).map(([k, v]) => [k, min[pos] ? r(v / min[pos], 5) : 0]))]));
}

// Matchups between roles: for each team, how much opposing players in each role produce against it,
// as a multiple of the league rate for that role (1.1 = 10% more), pulled toward 1 as if every team had
// also allowed MODEL.matchupMinutes league-average minutes in that role.
export function matchupFactors(games, roles, posRates, before = null) {
  const allowed = new Map();
  for (const g of games) {
    if (before && g.start >= before) continue;
    for (const s of g.teams) {
      const defence = g.teams.find((t) => t !== s).id;
      if (!allowed.has(defence)) allowed.set(defence, Object.fromEntries(ROLES.map((k) => [k, { min: 0, pts: 0, reb: 0, ast: 0, tpm: 0 }])));
      for (const p of s.players) {
        const pos = roles[p.id];
        if (!p.played || !ROLES.includes(pos)) continue;
        const l = lineOf(p.stats);
        const a = allowed.get(defence)[pos];
        for (const k of Object.keys(a)) a[k] += l[k];
      }
    }
  }
  const k = MODEL.matchupMinutes;
  const out = {};
  for (const [team, byPos] of allowed) {
    out[team] = Object.fromEntries(ROLES.map((pos) => [pos, Object.fromEntries(['pts', 'reb', 'ast', 'tpm'].map((st) => {
      const lr = posRates[pos]?.[st] ?? 0;
      const a = byPos[pos];
      return [st, lr > 0 ? r((a[st] + k * lr) / (a.min + k) / lr, 3) : 1];
    }))]));
  }
  return out;
}

// One team's inputs for the shared step (docs/claude.js), from its saved games: every player who has
// played for it (on the current roster, when known), with his minutes by role, last season's minutes
// and his per-minute rates.
//   injuries: { playerId: status }; prior: { playerId: last-season averages }; rates: league per-minute rates;
//   roles: { playerId: 'PG' | 'SG' | 'SF' | 'PF' | 'C' }.
export function prepareTeam(games, teamId, { injuries = {}, prior = {}, rates, before = null, roster = null, roles = {} }) {
  const mine = games
    .filter((g) => (!before || g.start < before) && g.teams.some((s) => s.id === teamId))
    .sort((x, y) => y.start.localeCompare(x.start)); // newest first
  const players = new Map();
  mine.forEach((g, i) => {
    const w = MODEL.recency ** i;
    for (const p of g.teams.find((s) => s.id === teamId).players) {
      if (!p.played) continue;
      if (!players.has(p.id)) {
        players.set(p.id, {
          id: p.id, name: p.name, gp: 0, wMin: 0, w: 0, starter: p.starter === true, roleMin: 0, roleW: 0,
          startMin: 0, startW: 0, benchMin: 0, benchW: 0,
          tot: { min: 0, pts: 0, reb: 0, ast: 0, tpm: 0 },
        });
      }
      const pl = players.get(p.id);
      const l = lineOf(p.stats);
      pl.gp++;
      pl.wMin += w * l.min;
      pl.w += w;
      if (p.starter === true) { pl.startMin += w * l.min; pl.startW += w; } else { pl.benchMin += w * l.min; pl.benchW += w; }
      if ((p.starter === true) === pl.starter) { // same role as in his most recent game
        pl.roleMin += w * l.min;
        pl.roleW += w;
      }
      for (const k of Object.keys(pl.tot)) pl.tot[k] += l[k];
    }
  });

  const candidates = [];
  for (const pl of players.values()) {
    if (roster && !roster.includes(pl.id)) continue;
    const pr = prior[pl.id];
    const rate = {};
    for (const s of ['pts', 'reb', 'ast', 'tpm']) {
      const [k, rt] = pr && pr.min > 0 ? [MODEL.priorRateMinutes, pr[s] / pr.min] : [MODEL.leagueRateMinutes, rates[s]];
      rate[s] = r((pl.tot[s] + k * rt) / (pl.tot.min + k), 5);
    }
    candidates.push({
      id: pl.id, name: pl.name, pos: roles[pl.id] ?? '', status: injuries[pl.id] ?? '', starter: pl.starter, gp: pl.gp,
      wMin: r(pl.wMin), w: r(pl.w), startMin: r(pl.startMin), startW: r(pl.startW),
      benchMin: r(pl.benchMin), benchW: r(pl.benchW), roleMin: r(pl.roleMin), roleW: r(pl.roleW),
      priorMin: pr?.min ?? 0, kMin: pr ? MODEL.priorMinuteGames : 0, rate,
    });
  }
  return { teamGames: mine.length, candidates };
}

// One team's player projections for a game: its inputs, then the shared step.
//   expected: this team's projected { pts, reb, ast, tpm }; spread: expected winning margin (size only);
//   backToBack: this team played the day before; lineup: optional confirmed lineup.
export function projectPlayers(games, teamId, {
  injuries = {}, prior = {}, rates, expected, before = null, roster = null, spread = 0, backToBack = false, lineup = null,
  roles = {}, oppMatchup = null,
}) {
  const team = { ...prepareTeam(games, teamId, { injuries, prior, rates, before, roster, roles }), expected, spread, backToBack, oppMatchup };
  return { ...allocate(team, lineup), inputs: team };
}

// The whole projection for one upcoming game.
//   extras: { line: { spread, overUnder } | null, injuries: { teamId: { playerId: status } },
//             lineups: { teamId: { starters: [playerId], out: [playerId] } } (optional, confirmed before tip-off) }
export function projectGame(games, game, { extras = {}, prior = {}, rosters = {}, positions = {}, before = null } = {}) {
  const ratings = teamRatings(games, before);
  const rates = leagueRates(games, before);
  const scores = projectScores(ratings, game.homeId, game.awayId, extras.line);
  const roles = inferRoles(games, positions, prior, before);
  const posRates = positionRates(games, roles, before);
  const matchups = matchupFactors(games, roles, posRates, before);
  const spread = Math.abs(scores.home - scores.away);
  // Second night of a back-to-back: the team's previous game started less than 30 hours earlier.
  const backToBack = (teamId) => Boolean(game.start) && games.some((g) => g.teams.some((s) => s.id === teamId)
    && g.start < game.start && Date.parse(game.start) - Date.parse(g.start) < 30 * 3600 * 1000);
  const sides = {};
  for (const [side, id, oppId] of [['home', game.homeId, game.awayId], ['away', game.awayId, game.homeId]]) {
    const t = ratings.team(id);
    const o = ratings.team(oppId);
    const paceFactor = scores.poss / t.pace;
    const lg = ratings.league;
    const expected = {
      pts: scores[side],
      reb: t.reb * paceFactor * (o.rebAllowed / lg.reb),
      // assists follow made baskets: the team's usual assists × how many points it is projected
      // to score against its usual points, nudged by how many assists the opponent allows
      ast: t.ast * (scores[side] / ((t.ortg * t.pace) / 100)) * Math.sqrt(o.astAllowed / lg.ast),
      tpm: t.tpm * paceFactor * (o.tpmAllowed / lg.tpm),
    };
    sides[side] = {
      teamId: id,
      score: scores[side],
      model: scores.model[side],
      market: scores.market?.[side] ?? null,
      ...projectPlayers(games, id, {
        injuries: extras.injuries?.[id] ?? {}, prior, rates, expected, before, roster: rosters[id]?.length ? rosters[id] : null,
        spread, backToBack: backToBack(id), lineup: extras.lineups?.[id] ?? null, roles, oppMatchup: matchups[oppId] ?? null,
      }),
    };
  }
  return { line: extras.line ?? null, positionRates: posRates, home: sides.home, away: sides.away };
}
