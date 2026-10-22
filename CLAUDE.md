# NBA Team Stats App — rules for Claude Code

The full spec is in `PLAN.md`. Build exactly that; suggest extras, don't add them unasked.
The owner, Nate, is not a developer: explain steps in plain English and run commands yourself.

## Maths rules

Nate changed these after the build (22 Oct 2026); they replace PLAN.md's "cut at every step" rule.

- All maths is done in **whole numbers** (no floating-point), so results are exact. Never multiply decimals.
- Team GP = the team's finished regular-season games.
- Team total = one stat summed over the team's games, **built from player lines** (never ESPN's team `totalRebounds`).
- Player GP = games where ESPN lists stats for him (not `didNotPlay`). Player totals count only games for that team.
- **The projection formula keeps every decimal; only the final projection is cut** (round down) to a whole number: 20.56 → 20.
- **Shown** averages and share % have **2 decimals, cut** (never rounded): 33.627% → 33.62%, average 4.50.
- Logic lives in `docs/calc.js`; shown figures are held as whole hundredths (1769 = 17.69):

  ```js
  const cut = (a, b) => (a - (a % b)) / b;                     // whole-number division, decimals dropped
  const teamAvg100  = cut(100 * teamTotal, teamGP);            // 9 over 2 → 450, shown 4.50
  const share100    = cut(10000 * playerTotal, base);          // base = teamTotal (All team games) or teamTotalInHisGames (Games he played)
  const projection  = cut(teamTotal * playerTotal, teamGP * base);  // = team average × share with every decimal kept
  ```

- Both modes use the full-season team average.
- Zero cases: team GP 0 → "—" for averages, shares, projections. Base total 0 → share 0.00%, projection 0. "Games he played" mode with player GP 0 → "—".
- **Projections page** (Team page's third button): only Points, Rebounds, Assists and 3PM; lists players with a projection of 1 or more in any of them; projections below 1 are blank. Uses the remembered mode switch; sorted by PTS; headings re-sort; rows open the Player page. The Player page keeps all six stats.
- `tests/calc.test.js` (run with `node --test`) must pass before any screen work.

## Data source rules

- ESPN's free public JSON API is the **only** source. No key. Never use `stats.nba.com` / `nba_api` or balldontlie.
  - Teams: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams`
  - Scoreboard: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` (US dates)
  - Box score: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=<eventId>`
- Count only regular season (season type 2), finished games (`status.type.completed`), and exclude the NBA Cup Championship (11 Dec 2026). Cup group/knockout games count.
- ESPN labels 2026-27 as season 2027. US date D = Melbourne date D+1.
- Map player stats by the `keys` list, never by position. 3PM comes from `"made-attempted"` text.
- `didNotPlay: true` with empty `stats` = not a game played.
- Team codes for display: `NY→NYK`, `GS→GSW`, `SA→SAS`, `NO→NOP`, `UTAH→UTA`, `WSH→WAS`.
- Be polite: browser User-Agent, ~0.5 s between calls, up to 3 retries with growing waits.
- Checks before publishing: each team's player points = its final score; 30 teams; no GP goes down; no GP above 82. A failed check stops the run.
- Backup only if ESPN breaks for good: `cdn.nba.com` box-score files.

## Tech

Node.js (LTS) built-ins only: no frameworks, no npm packages, no build step. Site is plain HTML/CSS/JS in `docs/`.

## Schedule

The nightly run is at **12:07am** Australia/Melbourne (`cron: '7 0 * * *'`), not 12:00am as in PLAN.md. Nate approved the move because GitHub delays or drops jobs scheduled exactly on the hour; the first midnight run started about 5 hours late.

## Upcoming games

Added at Nate's request (22 Oct 2026). Each run saves today's (America/New_York date) regular-season games that haven't started (`status.type.state === 'pre'`) to `data/upcoming.json`, and every team's current roster to `data/rosters.json` (`/teams/<id>/roster`). The home screen's **Upcoming games** button lists them; tapping one shows a matchup page with, for each of PTS, REB, AST and 3PM, both teams' players side by side, sorted by projection, showing only projections of 1 or more. Players are those on the current roster who have played for the team (all players if the roster is unknown). Same maths and remembered mode switch as everywhere else.
