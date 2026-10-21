// All app maths. Whole numbers only; decimals are cut (rounded down) at every step.
// Never multiply decimals: floating-point error can turn an exact 1 into 0.9999, which cuts to 0.
// null means "no figure yet" and is shown as "—".

export const DASH = '—';

// a and b are whole numbers.
export const cut = (a, b) => Math.floor(a / b);

// cut(team total ÷ team GP); null when the team hasn't played.
export function teamAverage(teamTotal, teamGP) {
  return teamGP > 0 ? cut(teamTotal, teamGP) : null;
}

// cut(100 ÷ base × player total), done as cut(100 × player total, base). A base of 0 gives 0%.
export function sharePct(playerTotal, base) {
  return base > 0 ? cut(100 * playerTotal, base) : 0;
}

// cut(team average × share %), done as cut(team average × share, 100).
export function projection(teamAvg, share) {
  return cut(teamAvg * share, 100);
}

export const MODES = { ALL: 'all', PLAYED: 'played' };

// One stat on the Player page.
//   mode ALL:    base = team total over all team games (Nate's formula, the default)
//   mode PLAYED: base = team total over only the games he played
// Both modes project with the full-season team average.
export function playerStat({ teamTotal, teamGP, playerTotal, teamTotalInHisGames, playerGP }, mode = MODES.ALL) {
  const avg = teamAverage(teamTotal, teamGP);
  const base = mode === MODES.PLAYED ? teamTotalInHisGames : teamTotal;
  if (avg === null || (mode === MODES.PLAYED && playerGP === 0)) {
    return { base, avg, share: null, projection: null };
  }
  const share = sharePct(playerTotal, base);
  return { base, avg, share, projection: projection(avg, share) };
}

// The working shown beneath each stat, e.g. "100 ÷ 226 × 40 = 17% · 113 × 17% = 19".
export function working(playerTotal, { base, avg, share, projection: proj }) {
  if (share === null) return DASH;
  return `100 ÷ ${base} × ${playerTotal} = ${share}% · ${avg} × ${share}% = ${proj}`;
}

export const show = (value, suffix = '') => (value === null ? DASH : `${value}${suffix}`);
