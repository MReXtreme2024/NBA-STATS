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

export const MODEL = {
  shrinkGames: 8, // team ratings: league average counts as this many games
  recency: 0.85, // each older game counts this much of the next newer one
  priorMinuteGames: 3, // last season's minutes count as this many games
  priorRateMinutes: 400, // last season's per-minute rates count as this many minutes
  leagueRateMinutes: 150, // league-average rates (no last season) count as this many minutes
  homeEdge: 1.2, // points added to the home team, taken from the away team
  marketWeight: 0.9, // share of the betting market's implied score in the final team score
  teamMinutes: 240, // regulation minutes per team
  maxMinutes: 42,
  showMinutes: 8, // players projected below this are left off
  factorRange: [0.8, 1.2], // limits on the team scaling of player projections
};

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

// One team's player projections for a game.
//   games: saved games; teamId: this team; injuries: { playerId: status }; prior: { playerId: last-season averages };
//   expected: this team's projected { pts, reb, ast, tpm } for the game.
export function projectPlayers(games, teamId, { injuries = {}, prior = {}, rates, expected, before = null, roster = null }) {
  const mine = games
    .filter((g) => (!before || g.start < before) && g.teams.some((s) => s.id === teamId))
    .sort((x, y) => y.start.localeCompare(x.start)); // newest first
  const teamGames = mine.length;
  const players = new Map();
  mine.forEach((g, i) => {
    const w = MODEL.recency ** i;
    for (const p of g.teams.find((s) => s.id === teamId).players) {
      if (!p.played) continue;
      if (!players.has(p.id)) players.set(p.id, { id: p.id, name: p.name, gp: 0, wMin: 0, w: 0, tot: { min: 0, pts: 0, reb: 0, ast: 0, tpm: 0 } });
      const pl = players.get(p.id);
      const l = lineOf(p.stats);
      pl.gp++;
      pl.wMin += w * l.min;
      pl.w += w;
      for (const k of Object.keys(pl.tot)) pl.tot[k] += l[k];
    }
  });

  const out = [];
  const injured = [];
  for (const pl of players.values()) {
    if (roster && !roster.includes(pl.id)) continue;
    const status = injuries[pl.id] ?? '';
    if (/^out$/i.test(status)) { injured.push({ id: pl.id, name: pl.name, status }); continue; }
    const pr = prior[pl.id];
    const kMin = pr ? MODEL.priorMinuteGames : 0;
    const minWhenPlaying = (pl.wMin + kMin * (pr?.min ?? 0)) / (pl.w + kMin);
    const playRate = teamGames ? (pl.gp + 1) / (teamGames + 1) : 1; // fringe players don't play every game
    const rate = {};
    for (const s of ['pts', 'reb', 'ast', 'tpm']) {
      const [k, r] = pr && pr.min > 0 ? [MODEL.priorRateMinutes, pr[s] / pr.min] : [MODEL.leagueRateMinutes, rates[s]];
      rate[s] = (pl.tot[s] + k * r) / (pl.tot.min + k);
    }
    out.push({ id: pl.id, name: pl.name, status, min: minWhenPlaying * playRate, rate });
  }

  // Share the team's 240 minutes among the available players (absorbs injured players' minutes), capped.
  for (const p of out) p.min = Math.min(MODEL.maxMinutes, p.min);
  for (let i = 0; i < 4; i++) {
    const free = out.filter((p) => p.min < MODEL.maxMinutes);
    const fixed = out.filter((p) => p.min >= MODEL.maxMinutes).length * MODEL.maxMinutes;
    const sum = free.reduce((s, p) => s + p.min, 0);
    if (!sum) break;
    const scale = (MODEL.teamMinutes - fixed) / sum;
    for (const p of free) p.min = Math.min(MODEL.maxMinutes, p.min * scale);
  }

  // Raw projections, then scale each stat so the team adds up to its projected total for this matchup.
  for (const s of ['pts', 'reb', 'ast', 'tpm']) {
    const raw = out.reduce((t, p) => t + p.rate[s] * p.min, 0);
    const factor = raw ? clamp(expected[s] / raw, MODEL.factorRange) : 1;
    for (const p of out) p[s] = p.rate[s] * p.min * factor;
  }
  return {
    players: out
      .filter((p) => p.min >= MODEL.showMinutes)
      .map(({ id, name, status, min, pts, reb, ast, tpm }) => ({ id, name, status, min, pts, reb, ast, tpm }))
      .sort((x, y) => y.pts - x.pts),
    out: injured,
  };
}

// The whole projection for one upcoming game.
//   extras: { line: { spread, overUnder } | null, injuries: { teamId: { playerId: status } } }
export function projectGame(games, game, { extras = {}, prior = {}, rosters = {}, before = null } = {}) {
  const ratings = teamRatings(games, before);
  const rates = leagueRates(games, before);
  const scores = projectScores(ratings, game.homeId, game.awayId, extras.line);
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
      }),
    };
  }
  return { line: extras.line ?? null, home: sides.home, away: sides.away };
}
