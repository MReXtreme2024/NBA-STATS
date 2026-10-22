// All app maths, done in whole numbers so there is no floating-point error
// (which could turn an exact 20 into 19.9999 and cut it to 19).
// The projection formula keeps every decimal; only the final projection is cut to a whole number.
// Averages and share % are shown with 2 decimals, cut (never rounded up): 33.627% shows as 33.62%.
// Shown 2-decimal figures are held as whole hundredths: 3362 means 33.62.
// null means "no figure yet" and is shown as "—".

export const DASH = '—';

// a ÷ b with the decimals cut. a and b are whole numbers, b > 0.
export const cut = (a, b) => (a - (a % b)) / b;

// Team average in hundredths: 9 blocks over 2 games -> 450 (shown 4.50). null when the team hasn't played.
export function teamAverage(teamTotal, teamGP) {
  return teamGP > 0 ? cut(100 * teamTotal, teamGP) : null;
}

// Share % in hundredths: 100 ÷ 226 × 40 = 17.699…% -> 1769 (shown 17.69%). A base of 0 gives 0.
export function sharePct(playerTotal, base) {
  return base > 0 ? cut(10000 * playerTotal, base) : 0;
}

// Projection with every decimal kept: team average × share
//   = (teamTotal ÷ teamGP) × (playerTotal ÷ base) = (teamTotal × playerTotal) ÷ (teamGP × base).
// Returns the exact value in hundredths (for the working) and the projection cut to a whole number.
export function projection(teamTotal, teamGP, playerTotal, base) {
  if (base <= 0) return { exact: 0, whole: 0 };
  const top = teamTotal * playerTotal;
  const bottom = teamGP * base;
  return { exact: cut(100 * top, bottom), whole: cut(top, bottom) };
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
    return { base, avg, share: null, exact: null, projection: null };
  }
  const p = projection(teamTotal, teamGP, playerTotal, base);
  return { base, avg, share: sharePct(playerTotal, base), exact: p.exact, projection: p.whole };
}

// Hundredths as text with 2 decimals: 1769 -> "17.69", 450 -> "4.50".
export const hundredths = (n) => `${cut(n, 100)}.${String(n % 100).padStart(2, '0')}`;

// A figure as text: "—" for null; 2 decimals when it is in hundredths.
export const show = (value, { decimals = false, suffix = '' } = {}) =>
  value === null ? DASH : `${decimals ? hundredths(value) : value}${suffix}`;

// The working shown beneath each stat, e.g. "100 ÷ 226 × 40 = 17.69% · 113.00 × 17.69% = 20.00 → 20".
// The product is worked from the full decimals, so it can be a touch above the shown figures multiplied.
export function working(playerTotal, { base, avg, share, exact, projection: proj }) {
  if (share === null) return DASH;
  return `100 ÷ ${base} × ${playerTotal} = ${hundredths(share)}% · ${hundredths(avg)} × ${hundredths(share)}% = ${hundredths(exact)} → ${proj}`;
}
