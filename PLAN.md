# NBA Team Stats App — Build Plan

Oct 21, 2026 · @Nate Sutton

## How to use this plan

Hand this whole plan to Claude Code; it builds the app one phase at a time and stops whenever it needs you.

**For Nate**

1. Download this doc as Markdown and save it as `PLAN.md` in a new empty folder (for example `nba-stats`).
2. Make a free GitHub account at github.com if you don't have one.
3. Open Claude Code in that folder and type: *Read PLAN.md and build this app one phase at a time. I'm not a developer, so explain each step simply.*
4. When Claude Code asks you to sign in or click a setting, do it, then tell it you're done.

**For Claude Code: how to work with Nate**

- Nate is not a developer. Explain each step in plain English before doing it, and run every command yourself.
- Ask Nate only for what only he can do: sign-ins, approvals and GitHub settings. Give exact click-by-click steps.
- Ask before anything that costs money, creates an account or makes something public. Everything in this plan is free.
- Build exactly this spec. Suggest extras at the end of a phase; don't add them unasked.
- Copy this plan into the repo as `PLAN.md`, and write a short `CLAUDE.md` holding the Maths rules and Data source rules so later sessions follow them.
- At the end of each phase, show Nate the result and get his OK before starting the next.

## What we're building

A personal, phone-friendly NBA website that updates itself at 12:00am Melbourne time with every team's and player's 2026-27 regular-season totals.

The six stats tracked everywhere: Points, Rebounds, Assists, 3-pointers made (3PM), Blocks, Steals.

- **Teams** — all 30 teams, each shown in its team colour.
- **Team page** — games played and the six season totals with averages, plus a **Games** button and a **Players** button.
- **Games** — one row per game: Opponent, Points, Rebounds, Assists, 3PM, Blocks, Steals.
- **Players** — everyone who has played for the team, with games played and the six totals.
- **Player page** — share % and projection for each of the six stats, with a switch between *All team games* and *Games he played*.

Each night a free GitHub job pulls the new box scores from ESPN, rebuilds the totals and republishes the site. Nothing runs on Nate's computer.

&#91;embedded content: how the app works · 4 parts\]

ESPN is the only data source. The nightly job and the saved stats live free on GitHub, and Nate just opens the app.

## Decisions already made

These are settled; build to them rather than revisiting them.

| Decision | Choice | Why |
| --- | --- | --- |
| Data source | ESPN's free public JSON API, no key | Works from GitHub's servers and has every stat needed, plus team colours. |
| Not used | NBA.com stats (`stats.nba.com`, the `nba_api` package) | Blocks requests from cloud servers and CI runners ([source](https://www.rdocumentation.org/packages/hoopR/versions/3.1.0/topics/hoopR-package)). |
| Not used | balldontlie | Its free plan has no player stats or box scores ([source](https://docs.balldontlie.io)). |
| Season | 2026-27 regular season only, 20 Oct 2026 to 11 Apr 2027 (US dates) | As asked ([dates](https://www.foxsports.com/stories/nba/when-does-2026-27-nba-season-start-opening-night-schedule)). |
| Update time | 12:00am Australia/Melbourne every day, daylight saving handled | GitHub schedules accept a time zone ([source](https://github.com/github/docs/commit/1ead651)). |
| Hosting | Public GitHub repo: Actions runs the nightly job, Pages serves the site | Free, works on phone and computer, and Nate's PC can stay off. |
| Privacy | The site link is public but unlisted | NBA stats aren't sensitive. Confirm with Nate before publishing. |
| Decimals | Cut, never round, at every step: 4.5 → 4, 17.7% → 17% | Nate's choice. |
| Projections | Show both: *All team games* (Nate's formula) and *Games he played* | Nate's choice. |

## Data source: ESPN

Two kinds of call do everything: a scoreboard per date to find the games, then a summary per game for its box score.

| What | URL |
| --- | --- |
| All 30 teams | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams` |
| Games on one US date | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` |
| One game's box score | `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=<eventId>` |

**Which games count**

- Regular season only: keep events whose season type is 2 (1 is preseason, 3 is postseason). Confirm this on a real 2026-27 game first.
- Finished games only (`status.type.completed` is true). Skip postponed or live games until they are final.
- Exclude the NBA Cup Championship on 11 Dec 2026; it doesn't count toward regular-season stats. Cup group and knockout games before it do count. Find how ESPN marks the final and add a test.
- Every team plays 82 regular-season games ([source](https://www.foxsports.com/stories/nba/when-does-2026-27-nba-season-start-opening-night-schedule)), so a count above 82 means a wrong game slipped in.
- ESPN labels 2026-27 as season 2027, the year it ends.
- `dates=` takes US dates. Games on US date D are played on Melbourne date D+1.

**Fields** (checked against a real ESPN box score)

- Team colour: `boxscore.teams[].team.color` (hex without `#`), plus `alternateColor`.
- Player lines: `boxscore.players[].statistics[0]` holds a `keys` list and, for each athlete, a `stats` list in the same order. Map by `keys`, never by position.
- Keys used: `points`, `rebounds`, `assists`, `threePointFieldGoalsMade-threePointFieldGoalsAttempted` (text like `"2-6"`, so 2 made), `blocks`, `steals`, `minutes`.
- `didNotPlay: true` with an empty `stats` list means he did not play; it is not a game played.
- Each team's `totals` list (same order) equals the sum of its players.

**Quirk: rebounds.** Never use ESPN's team-level `totalRebounds`. It includes team rebounds that no player is credited with: in the 2016 Finals Game 7, ESPN's team figure for Cleveland is 59 while its players total 48 ([source](https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=400878160)). Build every team total from the player lines so player shares add up to 100%.

**Team codes.** ESPN uses some non-standard codes (`NY`, `GS`, `SA`, `NO`, `UTAH`, `WSH`). Map them to NBA codes (`NYK`, `GSW`, `SAS`, `NOP`, `UTA`, `WAS`) for display.

**Be polite.** No key is needed. Send a normal browser User-Agent, pause about half a second between calls, and retry up to 3 times with growing waits. A busy night is about 25 calls.

**Backup.** If ESPN breaks for good, the NBA's `cdn.nba.com` box-score files also work from cloud servers; `stats.nba.com` does not ([source](https://news.ycombinator.com/threads?id=gek0z)).

## Maths rules

All maths uses whole numbers and cuts the decimals at every step, so every figure on screen can be checked by hand.

**Terms**

- **Cut** = drop the decimals (round down). Never round up.
- **Team GP** = the team's finished regular-season games.
- **Team total** = one stat summed over the team's games, built from player lines.
- **Team average** = cut(team total ÷ team GP).
- **Player GP** = games where ESPN lists stats for him. Player totals count only games for this team.
- **Team total in his games** = the team's total for that stat over only the games he played.

**Formulas** (the same for all six stats)

| Mode | Share % | Projection |
| --- | --- | --- |
| *All team games* (Nate's formula, the default) | cut(100 ÷ team total × player total) | cut(team average × share %) |
| *Games he played* | cut(100 ÷ team total in his games × player total) | cut(team average × share %) |

Both modes use the full-season team average in the projection.

In code, keep to this order and whole numbers only; the logic lives in `docs/calc.js`:

```js
const cut = (a, b) => Math.floor(a / b);           // a and b are whole numbers
const teamAvg    = cut(teamTotal, teamGP);         // 226 ÷ 2 → 113
const sharePct   = cut(100 * playerTotal, base);   // base = teamTotal, or teamTotalInHisGames
const projection = cut(teamAvg * sharePct, 100);   // 113 × 17 ÷ 100 → 19
```

Never multiply decimals (for example 4.5 × 0.2222). Floating-point error can turn an exact 1 into 0.9999, which cuts to 0.

**Zero cases.** Team GP 0 → show "—" for averages, shares and projections. A base total of 0 → share 0% and projection 0. In *Games he played* mode, player GP 0 → "—".

**Tests.** `tests/calc.test.js` must pass every case before any screen is built:

| Case | Inputs | Expected |
| --- | --- | --- |
| Team average | 226 points over 2 games | 113 |
| Average is cut, not rounded | 9 blocks over 2 games | 4 |
| Share, all team games | Player 40 of team's 226 points | 17% |
| Projection, all team games | Team average 113, share 17% | 19 |
| Games he played | 40 points in his only game, which the team scored 116 in; team average 113 | 34%, projection 38 |
| Low-count stat | Player 2 of team's 9 blocks; team average 4 | 22%, projection 0 |
| No games yet | Team GP 0 | "—", no divide-by-zero error |

The 0 for blocks is intended: cutting at every step pulls small numbers down. Don't "fix" it.

## Screens

Mobile-first: everything works at 375 px wide with no sideways page scroll, and wide tables scroll inside their own box.

**1. Teams (home)**

- All 30 teams A–Z, each a full-width row in its ESPN team colour. Text is black or white, whichever reads better on that colour.
- Each row shows the team name and games played; tapping it opens the Team page.
- The header shows when the data was last checked, in Melbourne time (for example "Checked 12:04am Thu 22 Oct").
- A colour override in `config.json` lets Nate change any team's colour.

**2. Team page** — Nate's wording exactly, on the team colour:

```text
Boston Celtics
Games played 2
Total points 226 (average 113 points)
Total rebounds 82 (average 41 rebounds)
Total assists 64 (average 32 assists)
Total 3 pointers made 32 (average 16 3PM)
Total blocks made 9 (average 4 blocks)
Total steals 22 (average 11 steals)
[ Games ]   [ Players ]
```

**3. Games**

- Columns in this order: Opponent, Points, Rebounds, Assists, 3PM, Blocks, Steals.
- Opponent reads "vs NYK" for a home game and "@ NYK" for an away game, with the Melbourne date in small text beneath.
- Newest game first.

**4. Players**

- Columns: Player, GP, PTS, REB, AST, 3PM, BLK, STL, as season totals for this team only.
- Lists everyone in this team's box scores this season, including players with 0 GP.
- Sorted by points, highest first; tapping a column heading re-sorts by it. The Player column stays fixed while the table scrolls sideways.
- Tapping a player opens the Player page.

**5. Player page**

- Header: the player's name on the team colour, and "Played X of Y team games".
- A switch at the top: **All team games** (default) or **Games he played**. The phone remembers the last choice.
- One row per stat showing player total, share % and projection in large text, with the working beneath in small text:
  - All team games: `100 ÷ 226 × 40 = 17% · 113 × 17% = 19`
  - Games he played: `100 ÷ 116 × 40 = 34% · 113 × 34% = 38`

**4b. Projections** (added at Nate's request after the plan)

- A third button on the Team page. Columns Player, GP, then projections for PTS, REB, AST and 3PM only.
- Lists players with a projection of 1 or more in any of those four; projections below 1 are left blank.
- Uses the same *All team games* / *Games he played* switch as the Player page (and the remembered choice). Sorted by PTS; tapping a heading re-sorts; tapping a player opens the Player page.

**Decimals change** (Nate, 22 Oct 2026, replaces "cut at every step" in Maths rules): the projection formula keeps every decimal and only the final projection is cut to a whole number (20.56 → 20). Averages and share % are shown with 2 decimals, cut. Worked examples are now: 226 ÷ 2 → 113.00; 40 of 226 → 17.69%, projection 20; games he played 40 of 116 → 34.48%, projection 38; 2 of 9 blocks → 22.22%, projection 1. See `CLAUDE.md` and `tests/calc.test.js`.

**Everywhere**

- A back button on every page, tap targets at least 44 px, readable in light and dark mode.
- Installable on the home screen: a web app manifest with a plain basketball icon, no NBA or team logos.

## Nightly update and hosting

A GitHub Actions workflow runs at 12:00am Melbourne time, adds newly finished games, checks the numbers and republishes the site.

```yaml
on:
  schedule:
    - cron: '0 0 * * *'
      timezone: 'Australia/Melbourne'   # GitHub adjusts for daylight saving
  workflow_dispatch:                    # adds a "Run workflow" button for manual updates
```

GitHub added the `timezone` field in March 2026 ([docs change](https://github.com/github/docs/commit/1ead651), [guide](https://cronuru.com/guides/github-actions-scheduled-workflows)). Runs at the top of the hour often start 5–30 minutes late. That's fine: games end hours before midnight Melbourne time.

**Each run**

1. Work out the last 3 US dates, using the `America/New_York` time zone.
2. Fetch each date's scoreboard and keep finished regular-season games (rules in Data source).
3. Fetch the box score for every kept game not yet saved. Re-fetch games from the last 2 days to pick up ESPN stat corrections.
4. Save each game as a trimmed file, `data/games/2026-27/<eventId>.json`: date, teams, home/away, final score and every player's full stat line.
5. Rebuild `docs/data/app-data.json` from all saved games and stamp the check time.
6. Check before publishing: each team's player points add up to its final score; 30 teams are present; no team's GP went down; no GP is above 82. A failed check stops the run, so the live site keeps the last good data.
7. Commit the changed files, then deploy `docs/` with GitHub's official Pages actions.
8. Any failure fails the run, and GitHub emails Nate (check his notification settings include Actions).

The check time is committed every night, even with no games. The site always shows when it last checked, and the repo never sits idle: GitHub silently pauses schedules in public repos after 60 days without activity ([guide](https://cronuru.com/guides/github-actions-scheduled-workflows)).

The first run backfills from 20 Oct 2026. The same script with `--from YYYY-MM-DD` re-checks any date range on demand.

**Hosting**

- A public repo under Nate's account, for example `nba-stats`. GitHub Pages serves the `docs/` folder at `https://<username>.github.io/nba-stats/`.
- No secrets: ESPN needs no key. The workflow's built-in token gets only `contents: write`, `pages: write` and `id-token: write`.

## Project structure and tech stack

One language (JavaScript on Node.js), with no frameworks, no build step and no npm packages.

- **Updater**: Node.js scripts (current LTS) using the built-in `fetch`.
- **Site**: plain HTML, CSS and JavaScript in `docs/`, reading `data/app-data.json`.
- **Maths**: `docs/calc.js`, one ES module shared by the site and the tests.
- **Tests**: Node's built-in runner, `node --test`.
- **Automation and hosting**: GitHub Actions and GitHub Pages.

```text
nba-stats/
├── PLAN.md                    this plan
├── CLAUDE.md                  short rules for future Claude Code sessions
├── README.md                  plain-English guide for Nate
├── config.json                season, dates, colour overrides
├── updater/
│   ├── update.js              nightly entry point (--from YYYY-MM-DD)
│   ├── espn.js                ESPN calls, retries, parsing
│   ├── build.js               saved games → app-data.json
│   └── checks.js              checks before publishing
├── data/games/2026-27/        one trimmed JSON file per finished game
├── docs/                      the website GitHub Pages serves
│   ├── index.html  app.js  style.css  calc.js
│   ├── manifest.webmanifest  icon-192.png  icon-512.png
│   └── data/app-data.json     rebuilt nightly
├── tests/
│   ├── calc.test.js           the worked examples
│   └── build.test.js          totals from a saved sample game
└── .github/workflows/nightly.yml
```

**Shape of `app-data.json`** (illustrative values from Nate's example):

```json
{
  "season": "2026-27",
  "checked": "2026-10-22T00:04:00+11:00",
  "teams": [{
    "id": "2", "code": "BOS", "name": "Boston Celtics",
    "colour": "from ESPN", "textColour": "#ffffff", "gp": 2,
    "totals": { "pts": 226, "reb": 82, "ast": 64, "tpm": 32, "blk": 9, "stl": 22 },
    "games": [{ "date": "2026-10-21", "opp": "DET", "home": false,
                "pts": 110, "reb": 35, "ast": 20, "tpm": 14, "blk": 3, "stl": 8 }],
    "players": [{ "id": "from ESPN", "name": "Jayson Tatum", "gp": 2,
                  "totals": { "pts": 40 },
                  "teamTotalsInHisGames": { "pts": 226 } }]
  }]
}
```

Every `totals` object holds the same six keys: `pts`, `reb`, `ast`, `tpm`, `blk`, `stl`.

## Build order

Seven phases. Finish each phase's check, show Nate the result, then move on.

1. **Set up.** Install Node.js LTS, Git and the GitHub CLI if missing. Sign Nate in to GitHub, create the public repo, and add `PLAN.md` and `CLAUDE.md`.
   - Done when: the repo is on GitHub with both files.
2. **Fetch games.** Write `espn.js` and `update.js`. First inspect one real 2026-27 box score and confirm the field names in Data source, then backfill from 20 Oct 2026.
   - Done when: every finished regular-season game so far is saved, and each passes the points check.
3. **Build totals.** Write `build.js` to produce `app-data.json`.
   - Done when: two teams' totals match ESPN's box scores, checked by hand with Nate.
4. **Maths and tests.** Write `calc.js` and the tests in Maths rules.
   - Done when: `node --test` passes every case.
5. **Screens.** Build the five screens on the real data.
   - Done when: everything works at 375 px wide and on Nate's phone.
6. **Nightly job and publishing.** Add the workflow, the checks and the Pages deploy. Confirm with Nate before the site goes public.
   - Done when: a manual run succeeds, the live site shows the new check time, and the next midnight run also succeeds.
7. **Hand over.** Write `README.md` in plain English: the site link, adding it to the home screen, running an update by hand, and what a failure email means.
   - Done when: the app is on Nate's home screen.

Adding it to the home screen: on iPhone, open the link in Safari, then Share → Add to Home Screen. On Android, open it in Chrome, then the ⋮ menu → Add to Home screen.

## Edge cases and maintenance

- **Traded players**: stats stay with the team they were earned for, so a traded player appears on both teams' lists with separate totals.
- **DNP and inactive**: DNP-only players show with 0 GP. Inactive players missing from the box score appear once they play.
- **Postponed or late games**: counted once ESPN marks them final. Games played abroad can finish after midnight Melbourne time; the 3-day look-back adds them the next night.
- **Stat corrections**: the last 2 days of games are re-fetched every run.
- **NBA Cup**: group and knockout games count; the 11 Dec final doesn't. A GP above 82 fails the checks.
- **ESPN changes its format**: the run fails and Nate gets an email. Ask Claude Code to compare a fresh ESPN response with a saved game file and update `espn.js`; the saved games mean nothing is lost.
- **Off-season**: no games after 11 Apr 2027. The nightly check-time commit keeps the schedule alive; if GitHub ever pauses it, re-enable it in the repo's Actions tab.
- **Next season**: change the season settings in `config.json` (for example 2027-28 and its dates). Old seasons' game files stay as history.

## Sources

- [ESPN box score JSON, 2016 Finals Game 7](https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=400878160): field names, team colours, team vs player rebounds
- [Fox Sports: 2026-27 NBA key dates](https://www.foxsports.com/stories/nba/when-does-2026-27-nba-season-start-opening-night-schedule)
- [GitHub Docs change adding `timezone` to schedules](https://github.com/github/docs/commit/1ead651)
- [Cronuru: GitHub Actions schedules, delays and the 60-day pause](https://cronuru.com/guides/github-actions-scheduled-workflows)
- [hoopR docs: stats.nba.com blocks cloud IP ranges](https://www.rdocumentation.org/packages/hoopR/versions/3.1.0/topics/hoopR-package)
- [Hacker News: cdn.nba.com works from cloud servers](https://news.ycombinator.com/threads?id=gek0z)
- [balldontlie API account tiers](https://docs.balldontlie.io)
