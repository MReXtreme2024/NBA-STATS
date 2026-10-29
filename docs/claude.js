// Claude's formula, the part shared by the nightly update and the app: sharing out a team's
// minutes and production among its players. The nightly update (updater/model.js) prepares each
// team's inputs; the app re-runs this step on the phone when Nate confirms a starting lineup.
// Ordinary decimals (exempt from the whole-number rules in calc.js).

export const MODEL = {
  shrinkGames: 8, // team ratings: league average counts as this many games
  recency: 0.85, // each older game counts this much of the next newer one
  priorMinuteGames: 3, // last season's minutes count as this many games
  priorRateMinutes: 400, // last season's per-minute rates count as this many minutes
  leagueRateMinutes: 60, // league-average rates (no last season) count as this many minutes (tested: 60 beat 150)
  homeEdge: 1.2, // points added to the home team, taken from the away team
  marketWeight: 0.9, // share of the betting market's implied score in the final team score
  teamMinutes: 240, // regulation minutes per team
  maxMinutes: 42,
  showMinutes: 8, // players projected below this are left off
  factorRange: [0.8, 1.2], // limits on the team scaling of player projections
  // Improvements, each tested on finished games before being switched on (0 / false = off):
  blowoutFrom: 6, // a spread bigger than this many points counts as a likely blowout…
  blowoutPerPoint: 0, // …and starters lose this share of their minutes per point beyond it
  backToBack: 0, // share of starters' minutes lost on the second night of a back-to-back
  usagePower: 1, // >1: points and assists a team gains (e.g. a star is out) go mostly to its main scorers
  starterRole: false, // true: a player's minutes come from games in his current role (starter or bench)
  minutesPower: 1, // >1: when sharing out the team's 240 minutes, the main players get a bigger share
  playRateBonus: 1, // fringe players' chance to play = (games played + this) ÷ (team games + this)
  projectedStartShare: 0.85, // a projected (not yet confirmed) starter: this share starter minutes, the rest bench minutes
  positionWeight: 0.5, // moving a player to another position shifts his rates this far toward that position's (0 = not at all)
  matchupWeight: 0, // how much the opponent's record against his role (PG, SG, SF, PF, C) counts (0 = off, 1 = fully)
  matchupMinutes: 600, // a team's record against a role is pulled toward average as if it had allowed this many average minutes
  ratingWeight: 1, // (tested 29 Oct: 0.5–1.5 all helped the stats model in both halves) how much players' on-court offensive/defensive ratings adjust the stats model's team scores for who is playing (0 = off)
  ratingPossessions: 200, // a player's ratings are pulled toward his team's as if he'd also played this many average possessions
  newRoleShare: 0.25, // (tested: 0.25 beat 0, 0.15, 0.35, 0.5) a player new to a role (first start, or first game off the bench): this share of the way to the team's typical minutes in it
};

const STATS = ['pts', 'reb', 'ast', 'tpm'];
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));

// One team's player projections.
//   team: { teamGames, candidates, expected: { pts, reb, ast, tpm }, spread, backToBack }, where each
//     candidate is a player who has played for the team: { id, name, pos (G, F or C), status (injury report),
//     starter (in his latest game), gp, wMin, w, startMin, startW, benchMin, benchW, roleMin, roleW, priorMin, kMin, rate }.
//   lineup (optional, set by Nate before tip-off): { starters: [id] (confirmed), projected: [id], out: [id],
//     positions: { id: 'G' | 'F' | 'C' } }; with a lineup, everyone else comes off the bench, whatever the
//     injury report said.
//   team.oppMatchup (optional): { PG|SG|SF|PF|C: { pts, reb, ast, tpm } }, how much the opponent allows to each role.
//   options: all (include players under showMinutes), positionRates ({ PG|…|C: per-minute rates }, for position moves).
export function allocate(team, lineup = null, { all = false, positionRates = null } = {}) {
  const { teamGames, candidates, expected, spread = 0, backToBack = false } = team;
  const confirmedLineup = Boolean(lineup?.starters?.length || lineup?.projected?.length || lineup?.out?.length);
  // The team's typical minutes for a starter and for a bench player, for players new to a role.
  const typical = (m, w) => {
    const ws = candidates.reduce((t, c) => t + c[w], 0);
    return ws > 0 ? candidates.reduce((t, c) => t + c[m], 0) / ws : null;
  };
  const teamStarterMin = typical('startMin', 'startW');
  const teamBenchMin = typical('benchMin', 'benchW');
  const out = [];
  const injured = [];
  for (const c of candidates) {
    const isOut = confirmedLineup ? lineup.out?.includes(c.id) : /^out$/i.test(c.status);
    if (isOut) { injured.push({ id: c.id, name: c.name, status: 'Out' }); continue; }
    // His role: confirmed or projected starter, bench (with a lineup), or unknown (no lineup: the nightly figures).
    const role = !confirmedLineup ? null
      : lineup.starters?.includes(c.id) ? 'confirmed' : lineup.projected?.includes(c.id) ? 'projected' : 'bench';
    // Minutes when he plays, from games in that role (or all his games if he hasn't played in it).
    const fromGames = (m, w) => (w > 0 ? (m + c.kMin * c.priorMin) / (w + c.kMin) : null);
    // New to a role: part of the way from his usual minutes to the team's typical minutes in that role.
    const anyRole = fromGames(c.wMin, c.w);
    const newTo = (teamMin) => (teamMin === null ? anyRole : anyRole + MODEL.newRoleShare * (teamMin - anyRole));
    const asStarter = fromGames(c.startMin, c.startW) ?? newTo(teamStarterMin);
    const offBench = fromGames(c.benchMin, c.benchW) ?? newTo(teamBenchMin);
    let minWhenPlaying = anyRole;
    if (role === 'confirmed') minWhenPlaying = asStarter;
    else if (role === 'projected') minWhenPlaying = MODEL.projectedStartShare * asStarter + (1 - MODEL.projectedStartShare) * offBench;
    else if (role === 'bench') minWhenPlaying = offBench;
    else if (MODEL.starterRole && c.roleW > 0) minWhenPlaying = fromGames(c.roleMin, c.roleW);
    const playRate = role === 'confirmed' ? 1 // a confirmed starter will play
      : teamGames ? (c.gp + MODEL.playRateBonus) / (teamGames + MODEL.playRateBonus) : 1; // fringe players don't play every game
    // A different position: his rates move part of the way toward that position's league rates.
    const pos = lineup?.positions?.[c.id];
    let rate = c.rate;
    if (pos && c.pos && pos !== c.pos && positionRates?.[pos] && positionRates?.[c.pos]) {
      rate = Object.fromEntries(Object.entries(c.rate).map(([s, v]) => {
        const from = positionRates[c.pos][s];
        return [s, from > 0 ? v * (positionRates[pos][s] / from) ** MODEL.positionWeight : v];
      }));
    }
    // Matchup: how much this opponent gives up to his role, compared with the league.
    const playsAs = pos || c.pos;
    if (MODEL.matchupWeight > 0 && team.oppMatchup?.[playsAs]) {
      rate = Object.fromEntries(Object.entries(rate).map(([s, v]) => [s, v * (team.oppMatchup[playsAs][s] ?? 1) ** MODEL.matchupWeight]));
    }
    const status = confirmedLineup ? '' : c.status; // a lineup replaces the injury report
    const starter = role ? role === 'confirmed' || role === 'projected' : c.starter;
    out.push({ id: c.id, name: c.name, status, role, starter, min: minWhenPlaying * playRate, rate });
  }

  // Share the team's 240 minutes among the available players (absorbs injured players' minutes), capped.
  for (const p of out) p.min = Math.min(MODEL.maxMinutes, 24 * (p.min / 24) ** MODEL.minutesPower); // 24 min stays 24
  for (let i = 0; i < 4; i++) {
    const free = out.filter((p) => p.min < MODEL.maxMinutes);
    const fixed = out.filter((p) => p.min >= MODEL.maxMinutes).length * MODEL.maxMinutes;
    const sum = free.reduce((s, p) => s + p.min, 0);
    if (!sum) break;
    const scale = (MODEL.teamMinutes - fixed) / sum;
    for (const p of free) p.min = Math.min(MODEL.maxMinutes, p.min * scale);
  }

  // Likely blowouts and back-to-backs: starters play less, and the bench picks up those minutes.
  const cut = clamp(
    MODEL.blowoutPerPoint * Math.max(0, spread - MODEL.blowoutFrom) + (backToBack ? MODEL.backToBack : 0), [0, 0.3],
  );
  const bench = out.filter((p) => !p.starter);
  const benchMin = bench.reduce((t, p) => t + p.min, 0);
  if (cut > 0 && benchMin > 0) {
    let freed = 0;
    for (const p of out.filter((x) => x.starter)) { freed += p.min * cut; p.min *= 1 - cut; }
    for (const p of bench) p.min += (freed * p.min) / benchMin;
  }

  // Raw projections, then make each stat add up to the team's projected total for this matchup.
  // Points and assists the team gains or loses go to players by their share of raw output^usagePower,
  // so with usagePower > 1 an injured star's shots go mostly to the other main scorers.
  for (const s of STATS) {
    for (const p of out) p[s] = p.rate[s] * p.min;
    const raw = out.reduce((t, p) => t + p[s], 0);
    if (!raw) continue;
    const target = raw * clamp(expected[s] / raw, MODEL.factorRange);
    const power = s === 'pts' || s === 'ast' ? MODEL.usagePower : 1;
    const weights = out.map((p) => p[s] ** power);
    const wSum = weights.reduce((t, x) => t + x, 0);
    out.forEach((p, i) => { p[s] += ((target - raw) * weights[i]) / wSum; });
  }
  return {
    players: out
      .filter((p) => all || p.min >= MODEL.showMinutes)
      .map(({ id, name, status, role, starter, min, pts, reb, ast, tpm }) => ({ id, name, status, role, starter, min, pts, reb, ast, tpm }))
      .sort((x, y) => y.pts - x.pts),
    out: injured,
  };
}
