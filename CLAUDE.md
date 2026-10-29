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

Added at Nate's request (22 Oct 2026). Each run saves today's (America/New_York date) regular-season games that haven't started (`status.type.state === 'pre'`) to `data/upcoming.json`, and every team's current roster to `data/rosters.json` (`/teams/<id>/roster`). The home screen's **Upcoming games** button lists them; tapping one shows a matchup page with, for each of PTS, REB, AST and 3PM, both teams' players side by side, sorted by projection, showing only projections of 1 or more. Players are those on the current roster who have played for the team (all players if the roster is unknown). Same maths and remembered mode switch as everywhere else. On a matchup page, swiping left/right (or the ‹ › arrows) moves to the next/previous upcoming game, wrapping round; it replaces the history entry so Back returns to the list.

## Claude's formula

Added at Nate's request (26 Oct 2026): "your perfect formula, not mine". A second tab on the Upcoming games and matchup pages ("Your formula" / "Claude's formula", remembered on the phone). Logic in `updater/model.js`, run by the nightly update, results saved in `data/upcoming.json` as each game's `claude` field. **It is exempt from the whole-number Maths rules above**: it uses ordinary decimals and its figures are shown cut to one decimal.

- Team scores: possessions model (pace, points per 100 possessions scored/allowed, shrunk toward league average with 8 games' weight, ±1.2 home court) blended 10% with 90% of the betting market's implied score (ESPN `pickcenter`: home = (O/U − spread) / 2; spread is the home team's line).
- Players: expected minutes (recency-weighted, blended with last season, × how often he plays, Out players removed, team scaled to 240, cap 42) × per-minute rates (this season blended with last season at 400 minutes' weight, or league rate at 150 minutes for players without one), then scaled so each team's players add up to its projected points, rebounds, assists and 3PM for the matchup (factor limited to 0.8–1.2). Players under 8 projected minutes are left off.
- Shows team scores (with the stats-model and market figures), and both teams' players side by side for PTS, REB, AST, P+R, P+A, R+A, P+R+A and 3PM. Day-To-Day players are tagged GTD; Out players listed.
- Last season's averages come from `apis/common/v3/.../athletes/<id>/stats` (Totals row for traded players), cached in `data/prior/<season>.json`; `priorSeason` is in `config.json`.
- `node updater/backtest.js` re-tests it on finished games against Nate's formula (players who had been playing but missed the game count as ruled out). Nate's priorities are **points, rebounds and assists**: judge changes on those.
- Improvements tested 29 Oct 2026 on 50 games, each in both halves of the games: blowout minutes (`blowoutPerPoint`), back-to-backs (`backToBack`), star-out shot sharing (`usagePower`), starter-role minutes (`starterRole`), main-player minutes share (`minutesPower`) and play-rate smoothing all made PTS/REB/AST worse, so they stay off (built, switchable). Kept: `leagueRateMinutes` 150 → 60 (rookies were under-projected). Box scores now save each player's `starter` flag.
- `node updater/tune.js` grid-tests the main settings; it only recommends a change with 150+ tested games and a win in both halves. On 29 Oct (50 games) the current settings were within 0.01% of the best.
- Real results: each run saves both formulas' pre-game projections to `data/projections/<season>/<gameId>.json` (`updater/results.js`); `build.js` scores finished ones into `app-data.json` `results` (season averages for PTS/REB/AST/P+R+A plus the last day in detail), shown on the "How did the projections go?" page linked from Upcoming games. Re-check `marketWeight` with the sweep once the season has more games (29 Oct, 40 games: 100% market was best for team scores, 8.81 vs 8.90 at 90%; Nate chose to keep 90%).
