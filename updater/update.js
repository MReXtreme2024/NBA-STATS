// Nightly entry point.
//   node updater/update.js                    last 3 US dates (first run backfills from season start)
//   node updater/update.js --from 2026-11-01  re-check every US date from then until today

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTeams, getScoreboard, getSummary, getRoster, gameExtras, isCountedGame, isUpcomingGame, trimGame, trimUpcoming,
} from './espn.js';
import { checkGame } from './checks.js';
import { build, buildAppData, loadGames } from './build.js';
import { projectGame } from './model.js';
import { loadPriors } from './priors.js';
import { snapshot } from './results.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const DATA_DIR = path.join(ROOT, 'data');
const GAMES_DIR = path.join(DATA_DIR, 'games', config.season);

const LOOK_BACK_DAYS = 3; // nightly window of US dates
const REFETCH_DAYS = 2; // saved games this recent are re-fetched for stat corrections

// Plain-date helpers on "YYYY-MM-DD" strings.
const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const todayIn = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

function parseArgs(argv) {
  const i = argv.indexOf('--from');
  if (i === -1) return {};
  const from = argv[i + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '')) throw new Error('Use --from YYYY-MM-DD');
  return { from };
}

// Write only when the content changed, so unchanged games don't show up as edits.
function writeJson(file, value) {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}

async function main() {
  const { from } = parseArgs(process.argv.slice(2));
  const today = todayIn('America/New_York');
  fs.mkdirSync(GAMES_DIR, { recursive: true });
  const firstRun = fs.readdirSync(GAMES_DIR).filter((f) => f.endsWith('.json')).length === 0;

  let start = from ?? (firstRun ? config.seasonStart : addDays(today, -(LOOK_BACK_DAYS - 1)));
  let end = today;
  if (start < config.seasonStart) start = config.seasonStart;
  if (end > config.seasonEnd) end = config.seasonEnd;
  const refetchFrom = from ?? addDays(today, -REFETCH_DAYS);

  console.log(`Teams list`);
  const teams = await getTeams();
  writeJson(path.join(DATA_DIR, 'teams.json'), teams);

  let saved = 0;
  let unchanged = 0;
  let upcoming = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const events = await getScoreboard(date);
    if (date === today) upcoming = events.filter((e) => isUpcomingGame(e, config.espnSeasonYear)).map(trimUpcoming);
    const kept = events.filter((e) => isCountedGame(e, config.espnSeasonYear));
    console.log(`${date}: ${events.length} games listed, ${kept.length} finished regular-season`);
    for (const event of kept) {
      const file = path.join(GAMES_DIR, `${event.id}.json`);
      if (fs.existsSync(file) && date < refetchFrom) continue;
      const game = trimGame(await getSummary(event.id), date);
      checkGame(game);
      const [a, b] = game.teams;
      if (writeJson(file, game)) {
        saved++;
        console.log(`  saved ${event.id}  ${a.code} ${a.score} - ${b.score} ${b.code}`);
      } else {
        unchanged++;
      }
    }
  }
  console.log(`Done: ${saved} game files saved or updated, ${unchanged} unchanged.`);

  // Current rosters, so upcoming-game projections leave out players who have moved on.
  console.log('Rosters');
  const rosters = {};
  for (const t of teams) rosters[t.id] = await getRoster(t.id);
  writeJson(path.join(DATA_DIR, 'rosters.json'), rosters);

  // Claude's formula for each upcoming game: needs the betting line and injury report
  // (from the game's summary) and last season's averages for the players involved.
  const allGames = loadGames(GAMES_DIR);
  const playing = new Set(upcoming.flatMap((g) => [g.homeId, g.awayId]));
  const playerIds = allGames.flatMap((g) => g.teams.filter((t) => playing.has(t.id))
    .flatMap((t) => t.players.filter((p) => p.played).map((p) => p.id)));
  const prior = await loadPriors(DATA_DIR, config.priorSeason, playerIds);
  // Both formulas' projections are also saved per game, to be scored once the game is played.
  const appTeams = buildAppData(allGames, teams, config, new Date()).teams;
  for (const g of upcoming) {
    const extras = gameExtras(await getSummary(g.id));
    g.claude = projectGame(allGames, g, { extras, prior, rosters });
    writeJson(path.join(DATA_DIR, 'projections', config.season, `${g.id}.json`),
      snapshot(g, g.claude, appTeams, new Date().toISOString()));
  }

  // Today's (US date) games that haven't started, for the Upcoming games screen.
  writeJson(path.join(DATA_DIR, 'upcoming.json'), { usDate: today, games: upcoming });
  console.log(`Upcoming: ${upcoming.length} games on ${today}`);

  const data = build();
  console.log(`Built app-data.json: ${data.teams.length} teams, checked ${data.checked}`);
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
