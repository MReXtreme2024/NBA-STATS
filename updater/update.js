// Nightly entry point.
//   node updater/update.js                    last 3 US dates (first run backfills from season start)
//   node updater/update.js --from 2026-11-01  re-check every US date from then until today

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTeams, getScoreboard, getSummary, isCountedGame, trimGame } from './espn.js';
import { checkGame } from './checks.js';

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
  writeJson(path.join(DATA_DIR, 'teams.json'), await getTeams());

  let saved = 0;
  let unchanged = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const events = await getScoreboard(date);
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
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
