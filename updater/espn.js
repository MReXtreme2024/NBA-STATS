// ESPN calls, retries and parsing. ESPN is the only data source (see CLAUDE.md).

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PAUSE_MS = 500;
const RETRIES = 3;

const TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams';
const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const SUMMARY_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
const ATHLETE_URL = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch JSON politely: pause before every call, retry up to 3 times with growing waits.
export async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    await sleep(attempt === 0 ? PAUSE_MS : PAUSE_MS * 4 ** attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      console.warn(`  attempt ${attempt + 1} failed: ${err.message}`);
    }
  }
  throw lastError;
}

// "2026-10-20" -> "20261020"
const compact = (usDate) => usDate.replaceAll('-', '');

export async function getTeams() {
  const data = await fetchJson(TEAMS_URL);
  return data.sports[0].leagues[0].teams.map(({ team: t }) => ({
    id: t.id,
    code: t.abbreviation,
    name: t.displayName,
    color: t.color,
    alternateColor: t.alternateColor,
  }));
}

export async function getScoreboard(usDate) {
  const data = await fetchJson(`${SCOREBOARD_URL}?dates=${compact(usDate)}`);
  return data.events ?? [];
}

export async function getSummary(eventId) {
  return fetchJson(`${SUMMARY_URL}?event=${eventId}`);
}

// Betting line and injury report for one game, from its summary.
//   line: { spread (home team's line), overUnder } or null; injuries: { teamId: { playerId: status } }.
export function gameExtras(summary) {
  const pick = (summary.pickcenter ?? []).find((p) => Number.isFinite(p.spread) && Number.isFinite(p.overUnder));
  const injuries = {};
  for (const t of summary.injuries ?? []) {
    const id = t.team?.id;
    if (!id) continue;
    injuries[id] = {};
    for (const i of t.injuries ?? []) if (i.athlete?.id) injuries[id][i.athlete.id] = i.status ?? '';
  }
  return { line: pick ? { spread: pick.spread, overUnder: pick.overUnder } : null, injuries };
}

// A player's per-game averages for one season (e.g. "2025-26"), or null if he didn't play in it.
// Players traded mid-season have a row per team plus a Totals row; the Totals row is used.
export async function getSeasonAverages(athleteId, seasonLabel) {
  const data = await fetchJson(`${ATHLETE_URL}/${athleteId}/stats`);
  const cat = (data.categories ?? []).find((c) => c.name === 'averages');
  if (!cat) return null;
  const rows = (cat.statistics ?? []).filter((s) => s.season?.displayName === seasonLabel);
  const row = rows.find((s) => !s.teamId) ?? (rows.length === 1 ? rows[0] : null);
  if (!row) return null;
  const v = (name) => Number(String(row.stats[cat.names.indexOf(name)] ?? '').split('-')[0]) || 0;
  return {
    gp: v('gamesPlayed'),
    min: v('avgMinutes'),
    pts: v('avgPoints'),
    reb: v('avgRebounds'),
    ast: v('avgAssists'),
    tpm: v('avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted'),
  };
}

// One team's current roster as a list of player ids.
export async function getRoster(teamId) {
  const data = await fetchJson(`${TEAMS_URL}/${teamId}/roster`);
  return (data.athletes ?? []).map((a) => a.id);
}

// A regular-season game of this season that hasn't started yet.
export function isUpcomingGame(event, espnSeasonYear) {
  return (
    event.season?.year === espnSeasonYear &&
    event.season?.type === 2 &&
    event.status?.type?.state === 'pre'
  );
}

// An upcoming game as we keep it: when, and who is home and away.
export function trimUpcoming(event) {
  const comp = event.competitions[0];
  const side = (homeAway) => comp.competitors.find((c) => c.homeAway === homeAway).team.id;
  return {
    id: event.id,
    start: event.date,
    homeId: side('home'),
    awayId: side('away'),
    note: comp.notes?.[0]?.headline ?? '',
  };
}

// The NBA Cup Championship is labelled regular season (type 2) by ESPN, but doesn't count.
// ESPN marks it with competition type "CC" (id 39) and the note "NBA Cup Championship".
export function isCupFinal(event) {
  const comp = event.competitions?.[0] ?? {};
  if (comp.type?.abbreviation === 'CC' || comp.type?.id === '39') return true;
  return (comp.notes ?? []).some((n) => /NBA Cup Championship/i.test(n.headline ?? ''));
}

// Keep only finished regular-season games of this season, excluding the Cup final.
export function isCountedGame(event, espnSeasonYear) {
  return (
    event.season?.year === espnSeasonYear &&
    event.season?.type === 2 &&
    event.status?.type?.completed === true &&
    !isCupFinal(event)
  );
}

// Trim an ESPN summary to what we keep: date, teams, home/away, final score and
// every player's full stat line, mapped by ESPN's `keys` (never by position).
export function trimGame(summary, usDate) {
  const comp = summary.header.competitions[0];
  const boxTeams = summary.boxscore.teams;
  const boxPlayers = summary.boxscore.players;

  const teams = comp.competitors.map((c) => {
    const box = boxTeams.find((t) => t.team.id === c.team.id)?.team ?? c.team;
    const lines = boxPlayers.find((p) => p.team.id === c.team.id)?.statistics?.[0];
    if (!lines) throw new Error(`Game ${summary.header.id}: no player lines for team ${c.team.id}`);
    const players = lines.athletes.map((a) => {
      const played = !a.didNotPlay && a.stats.length > 0;
      const stats = {};
      if (played) lines.keys.forEach((k, i) => (stats[k] = a.stats[i]));
      return {
        id: a.athlete.id,
        name: a.athlete.displayName,
        played,
        ...(played ? { stats } : { reason: a.reason ?? '' }),
      };
    });
    return {
      id: c.team.id,
      code: box.abbreviation,
      name: box.displayName,
      homeAway: c.homeAway,
      score: Number(c.score),
      color: box.color,
      alternateColor: box.alternateColor,
      players,
    };
  });

  return {
    id: summary.header.id,
    usDate,
    start: comp.date,
    teams,
  };
}
