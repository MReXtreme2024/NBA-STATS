// Saved games -> docs/data/app-data.json. Every team figure is built from player lines
// (never ESPN's team totals), so player shares always add up to 100%.
//   node updater/build.js   rebuild from the saved games without fetching

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAppData, checkGame } from './checks.js';
import { scoreResults } from './results.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STATS = ['pts', 'reb', 'ast', 'tpm', 'blk', 'stl'];

// ESPN's non-standard codes -> NBA codes, for display.
const NBA_CODES = { NY: 'NYK', GS: 'GSW', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' };
export const nbaCode = (espnCode) => NBA_CODES[espnCode] ?? espnCode;

const zeroTotals = () => Object.fromEntries(STATS.map((s) => [s, 0]));

const whole = (value, what) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Unexpected ${what} value "${value}"`);
  return n;
};

// One played player's ESPN stat line -> our six stats. 3PM comes from text like "2-6".
export function lineToStats(stats) {
  return {
    pts: whole(stats.points, 'points'),
    reb: whole(stats.rebounds, 'rebounds'),
    ast: whole(stats.assists, 'assists'),
    tpm: whole(String(stats['threePointFieldGoalsMade-threePointFieldGoalsAttempted']).split('-')[0], '3PM'),
    blk: whole(stats.blocks, 'blocks'),
    stl: whole(stats.steals, 'steals'),
  };
}

const addInto = (target, add) => STATS.forEach((s) => (target[s] += add[s]));

// Black or white text, whichever has more contrast on the colour (WCAG luminance).
export function textColourFor(hex) {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(1).slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#000000' : '#ffffff';
}

const normaliseHex = (c) => `#${String(c).replace(/^#/, '').toLowerCase()}`;

// Calendar date in a time zone, e.g. "2026-10-21".
const dateIn = (iso, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));

// ISO timestamp with the zone's offset, e.g. "2026-10-22T00:04:00+11:00".
export function isoIn(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

// games: trimmed game objects; teams: ESPN's 30-team list; now: the check time.
// upcoming: { usDate, games } not yet played; rosters: { teamId: [playerId] } current rosters.
export function buildAppData(games, teams, config, now, { upcoming = null, rosters = {} } = {}) {
  const byId = new Map(
    teams.map((t) => {
      const code = nbaCode(t.code);
      const colour = normaliseHex(config.colourOverrides?.[code] ?? t.color);
      return [t.id, {
        id: t.id, code, name: t.name, colour, textColour: textColourFor(colour),
        gp: 0, totals: zeroTotals(), games: [], playersById: new Map(), roster: rosters[t.id] ?? null,
      }];
    }),
  );

  const sorted = [...games].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  for (const game of sorted) {
    for (const side of game.teams) {
      const team = byId.get(side.id);
      if (!team) throw new Error(`Game ${game.id}: unknown team id ${side.id}`);
      const opp = game.teams.find((t) => t !== side);

      // This game's team line, summed from its players.
      const gameTotals = zeroTotals();
      const lines = side.players.map((p) => ({ p, stats: p.played ? lineToStats(p.stats) : null }));
      lines.forEach(({ stats }) => stats && addInto(gameTotals, stats));

      team.gp++;
      addInto(team.totals, gameTotals);
      team.games.push({
        id: game.id,
        date: dateIn(game.start, config.timeZone),
        opp: nbaCode(opp.code),
        home: side.homeAway === 'home',
        ...gameTotals,
      });

      for (const { p, stats } of lines) {
        let player = team.playersById.get(p.id);
        if (!player) {
          player = { id: p.id, name: p.name, gp: 0, totals: zeroTotals(), teamTotalsInHisGames: zeroTotals() };
          team.playersById.set(p.id, player);
        }
        player.name = p.name; // latest spelling wins
        if (stats) {
          player.gp++;
          addInto(player.totals, stats);
          addInto(player.teamTotalsInHisGames, gameTotals);
        }
      }
    }
  }

  const out = [...byId.values()]
    .map(({ playersById, games: teamGames, ...team }) => ({
      ...team,
      games: teamGames.reverse(), // newest first
      players: [...playersById.values()].sort(
        (a, b) => b.totals.pts - a.totals.pts || b.gp - a.gp || a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const upcomingGames = (upcoming?.games ?? [])
    .filter((g) => byId.has(g.homeId) && byId.has(g.awayId))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

  return {
    season: config.season,
    checked: isoIn(now, config.timeZone),
    upcoming: { usDate: upcoming?.usDate ?? null, games: upcomingGames },
    teams: out,
  };
}

export function loadGames(gamesDir) {
  if (!fs.existsSync(gamesDir)) return [];
  return fs.readdirSync(gamesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(gamesDir, f), 'utf8')));
}

// Rebuild app-data.json from everything saved, after the checks pass; returns the built data.
export function build(now = new Date()) {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const teams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'teams.json'), 'utf8'));
  const games = loadGames(path.join(ROOT, 'data', 'games', config.season));
  games.forEach(checkGame);
  const readOptional = (name) => {
    const f = path.join(ROOT, 'data', name);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : undefined;
  };
  const data = buildAppData(games, teams, config, now, {
    upcoming: readOptional('upcoming.json'), rosters: readOptional('rosters.json'),
  });
  data.results = scoreResults(loadGames(path.join(ROOT, 'data', 'projections', config.season)), games, config.timeZone);
  const file = path.join(ROOT, 'docs', 'data', 'app-data.json');
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  checkAppData(data, previous);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data) + '\n');
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = build();
  console.log(`Built app-data.json: ${data.teams.length} teams, checked ${data.checked}`);
}
