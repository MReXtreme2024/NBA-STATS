# NBA Team Stats App — rules for Claude Code

The full spec is in `PLAN.md`. Build exactly that; suggest extras, don't add them unasked.
The owner, Nate, is not a developer: explain steps in plain English and run commands yourself.

## Maths rules

- Whole numbers only. **Cut** (round down, `Math.floor`) at every step. Never round up, never multiply decimals.
- Team GP = the team's finished regular-season games.
- Team total = one stat summed over the team's games, **built from player lines** (never ESPN's team `totalRebounds`).
- Team average = cut(team total ÷ team GP).
- Player GP = games where ESPN lists stats for him (not `didNotPlay`). Player totals count only games for that team.
- Share % and projection, in this exact order (logic lives in `docs/calc.js`):

  ```js
  const cut = (a, b) => Math.floor(a / b);
  const teamAvg    = cut(teamTotal, teamGP);
  const sharePct   = cut(100 * playerTotal, base);   // base = teamTotal (All team games) or teamTotalInHisGames (Games he played)
  const projection = cut(teamAvg * sharePct, 100);   // both modes use the full-season team average
  ```

- Zero cases: team GP 0 → "—" for averages, shares, projections. Base total 0 → share 0%, projection 0. "Games he played" mode with player GP 0 → "—".
- Small numbers cutting to 0 (e.g. blocks projection 0) is intended. Don't "fix" it.
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
