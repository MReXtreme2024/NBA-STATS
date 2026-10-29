// Who was on the court, from ESPN's play-by-play: for each player, seconds played and the points his
// team scored and allowed while he was on (for player offensive and defensive ratings).
// Starters begin the game; substitutions ("X enters the game for Y") change the five. ESPN doesn't
// always log changes between quarters, so each later quarter's five are the players seen in it before
// being subbed in (anyone subbed out, or making a play), topped up from the previous quarter's five.

const periodSeconds = (n) => (n <= 4 ? 720 : 300);
// "8:11" -> 491; in the last minute ESPN shows seconds only, "45.3" -> 45.3.
const clockSeconds = (text) => {
  const t = String(text ?? '0');
  if (!t.includes(':')) return Number(t) || 0;
  const [m, s] = t.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
};

// summary: ESPN game summary. Returns { playerId: { secs, ptsFor, ptsAgainst } } or null if the
// play-by-play is missing or doesn't hold together.
export function onCourt(summary) {
  const plays = summary.plays ?? [];
  if (!plays.length) return null;
  const comp = summary.header.competitions[0];
  const homeId = comp.competitors.find((c) => c.homeAway === 'home').team.id;
  const teamOf = new Map();
  const starters = {};
  for (const side of summary.boxscore.players) {
    starters[side.team.id] = [];
    for (const a of side.statistics[0].athletes) {
      teamOf.set(a.athlete.id, side.team.id);
      if (a.starter) starters[side.team.id].push(a.athlete.id);
    }
  }
  const teams = Object.keys(starters);
  const stats = {};
  const stat = (id) => (stats[id] ??= { secs: 0, ptsFor: 0, ptsAgainst: 0 });

  // Each quarter's starting five per team.
  const byPeriod = new Map();
  for (const p of plays) {
    const n = p.period?.number ?? 1;
    if (!byPeriod.has(n)) byPeriod.set(n, []);
    byPeriod.get(n).push(p);
  }
  // At the same moment on the clock, substitutions come after the other plays (players subbed in
  // between free throws don't get those points, as in the NBA's own plus-minus).
  const isSubPlay = (p) => /Substitution/i.test(p.type?.text ?? '');
  for (const [n, list] of byPeriod) {
    const ordered = [];
    for (let i = 0; i < list.length;) {
      let j = i;
      while (j < list.length && list[j].clock?.displayValue === list[i].clock?.displayValue) j++;
      const group = list.slice(i, j);
      ordered.push(...group.filter((p) => !isSubPlay(p)), ...group.filter(isSubPlay));
      i = j;
    }
    byPeriod.set(n, ordered);
  }
  let five = Object.fromEntries(teams.map((t) => [t, [...starters[t]]]));
  let lastHome = 0;
  let lastAway = 0;
  for (const [n, list] of [...byPeriod].sort((a, b) => a[0] - b[0])) {
    if (n > 1) {
      const seen = Object.fromEntries(teams.map((t) => [t, []]));
      const entered = new Set();
      for (const p of list) {
        const ids = (p.participants ?? []).map((x) => x.athlete?.id).filter(Boolean);
        const isSub = /Substitution/i.test(p.type?.text ?? '');
        ids.forEach((id, i) => {
          const t = teamOf.get(id);
          if (!t) return;
          if (isSub && i === 0) { entered.add(id); return; } // the player coming on
          if (!entered.has(id) && !seen[t].includes(id)) seen[t].push(id);
        });
      }
      for (const t of teams) {
        const start = seen[t].slice(0, 5);
        for (const id of five[t]) if (start.length < 5 && !start.includes(id) && !entered.has(id)) start.push(id);
        five[t] = start;
      }
    }
    let clock = periodSeconds(n);
    for (const p of list) {
      const now = clockSeconds(p.clock?.displayValue);
      const elapsed = Math.max(0, clock - now);
      for (const t of teams) for (const id of five[t]) stat(id).secs += elapsed;
      clock = now;
      const home = Number(p.homeScore ?? lastHome);
      const away = Number(p.awayScore ?? lastAway);
      const dHome = home - lastHome;
      const dAway = away - lastAway;
      if (dHome || dAway) {
        for (const t of teams) {
          const [mine, theirs] = t === homeId ? [dHome, dAway] : [dAway, dHome];
          for (const id of five[t]) { stat(id).ptsFor += mine; stat(id).ptsAgainst += theirs; }
        }
        lastHome = home;
        lastAway = away;
      }
      if (/Substitution/i.test(p.type?.text ?? '')) {
        const [inId, outId] = (p.participants ?? []).map((x) => x.athlete?.id);
        const t = teamOf.get(inId) ?? teamOf.get(outId);
        if (t && five[t].includes(outId) && !five[t].includes(inId)) five[t] = five[t].map((id) => (id === outId ? inId : id));
      }
    }
    for (const t of teams) for (const id of five[t]) stat(id).secs += clock; // to the end of the quarter
  }
  return stats;
}
