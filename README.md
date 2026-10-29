# NBA Team Stats

Your personal NBA stats app for the 2026-27 regular season: every team's and player's totals for points, rebounds, assists, 3-pointers made, blocks and steals.

## Your app

**https://mrextreme2024.github.io/NBA-STATS/**

Only people you give this link to will find it. It updates itself every night at about **12:07am Melbourne time** (GitHub sometimes starts it later), and nothing runs on your computer. The top of the home screen shows when it last checked, for example "Checked 12:11am Thu 22 Oct".

## Add it to your home screen

- **iPhone:** open the link in **Safari**, tap the **Share** button (the square with an arrow), then **Add to Home Screen** → **Add**.
- **Android:** open the link in **Chrome**, tap the **⋮** menu (top right), then **Add to Home screen** → **Add**.

It appears as a basketball icon called "NBA Stats".

## Run an update by hand

You don't normally need to: it runs every night. If you want fresh numbers sooner:

1. Go to **https://github.com/MReXtreme2024/NBA-STATS/actions/workflows/nightly.yml**
2. Click **Run workflow** on the right, leave the date box blank, then click the green **Run workflow**.
3. After about a minute a green tick means it's done. Refresh the app.

**To re-check older games** (for example if you think a game is missing), type a US date in the box, such as `2026-11-01`, before clicking the green button. It re-checks every game from that date until today.

## If GitHub emails you about a failure

An email titled something like **"Run failed: Nightly update"** means that night's update stopped. **Your app keeps showing the last good numbers**, and nothing is lost. The "Checked" time on the home screen just won't move forward.

What to do:

1. **Wait for the next night.** Most failures are ESPN being briefly unavailable, and the next run fixes itself.
2. **If it fails two nights in a row**, open Claude Code on this project and say: *"The nightly update is failing. Please read the latest failed run's log and fix it."*

Failures are deliberate when the numbers don't add up. The update refuses to publish if:
- a team's player points don't add up to its final score
- a team is missing
- a team's games played goes down or goes above 82

## Change a team's colour

1. Open **https://github.com/MReXtreme2024/NBA-STATS/edit/main/config.json**
2. Change the `"colourOverrides": {}` line to include the team's code and a colour, for example:
   `"colourOverrides": { "BOS": "#007a33", "LAL": "#fdb927" }`
3. Click **Commit changes** (twice). The new colour shows after the next update.

Team codes are the usual NBA ones (BOS, NYK, GSW, LAL…).

## How the numbers work

- **Average** = total ÷ games, shown with 2 decimals (4.50 blocks). Decimals are cut, never rounded up.
- **Share %** = the player's part of the team's total, shown with 2 decimals (33.62%).
  - **All team games:** out of the team's total for the whole season.
  - **Games he played:** out of the team's total in only the games he played.
- **Projection** = team average × share %, worked out with **every decimal kept**, then cut to a whole number (20.56 becomes 20).

Each Player page shows the working under every number. Because the projection uses the full decimals, it can come out a touch higher than multiplying the two shown 2-decimal figures by hand.

**Projections button** (on each Team page): every player's projection for Points, Rebounds, Assists and 3PM. Only players with a projection of 1 or more are listed, and anything below 1 is left blank. The *All team games / Games he played* switch works here too. Tap a heading to re-sort, or a player to see their working.

## Upcoming games

Tap **Upcoming games** at the top of the home screen to see the day's games that haven't started yet, with Melbourne start times. The list refreshes with each nightly update.

On a game, **swipe left** for the next upcoming game and **swipe right** to go back one, or tap the **‹ ›** arrows under the title. Back always returns to the games list.

Tap a game to see the two teams **side by side** for Points, Rebounds, Assists and 3PM. Each player's projection is listed highest first, and anything below 1 is left out. Only players on each team's current roster are included, so a traded player shows for his new team only once he has played for it. The *All team games / Games he played* switch works here too. Tap a player to see their working.

**Confirm starting lineup.** Each game has a **Confirm starting lineup** button. NBA lineups are announced about 30 minutes before tip-off, hours after the nightly update. The screen lists every player with his points, rebounds and assists. Last game's starters begin as **Projected** starters, and players on the injury report as **Out**. Tap a player to open him and choose:

- **Position:** PG, SG, SF, PF or C ("usual" marks his normal one). ESPN only lists guard, forward or centre, so Claude's formula works out the rest from how each player plays: the guards who pass most are PGs, the forwards who rebound most are PFs. Moving a player (say Tatum from PF to SF) shifts his numbers halfway toward what that position typically produces, and his teammates are re-balanced.
- **Status:** **Confirmed starter** (certain to play his starter minutes), **Projected starter** (mostly starter minutes, with a small chance he comes off the bench) or **Out** (0P 0R 0A, his minutes shared among teammates). Tap the chosen status again to put him back on the bench. A player starting for the first time gets a step up from his bench minutes toward a starter's.

His numbers update as you tap. Tap **Save lineup** and the game's projections use it. Your formula just leaves out players marked Out. The lineup is kept on your phone until the game is over; **Back to predicted** undoes it. In the season's first 23 games, 1 in 15 projected players didn't play after all, so it's worth a quick check before you use a projection. (Position moves can't be tested on past games, because ESPN doesn't record which position a player actually played in each game.)

### Claude's formula

The Upcoming games page and every matchup have two tabs: **Your formula** and **Claude's formula**. The app remembers which one you used last.

Claude's formula is a separate projection that Claude designed using everything ESPN offers:

- **Team scores** mostly follow the betting market's expected score, which reflects injuries, rest and form. They're fine-tuned with a stats model of each team's pace and scoring, plus home-court advantage.
- **Players** get expected minutes (recent games count more, players ruled out are removed and their minutes shared among teammates) × how much they produce per minute (this season blended with last season), adjusted for the opponent.
- You see both teams' projected scores, then the players side by side for Points, Rebounds, Assists, Points + Rebounds, Points + Assists, Rebounds + Assists, Points + Rebounds + Assists, and 3PM. Figures are cut to one decimal. "GTD" means a game-time decision.

**Player offensive and defensive ratings.** From ESPN's play-by-play, the app tracks who was on the court for every second, and works out each player's ratings: how many points per 100 possessions his team scores (offence) and allows (defence) while he plays, compared with his team's usual. Claude's formula uses these for team scores: when good players are out or play fewer minutes, the stats model's team scores move to match who is actually playing. Early in the season each player's ratings are pulled toward his team's average until he has played enough. (They mostly sharpen the stats-model part of team scores; the betting market already prices in injuries, and player points, rebounds and assists barely change.)

**How did the projections go?** At the bottom of the Upcoming games page, this page scores both formulas' real projections (made before tip-off, with that day's injury report) against what actually happened: a season scoreboard for points, rebounds and assists, then the last day's games player by player, with the actual number in bold and the projection below it. As of 29 Oct, over 23 games, Claude's formula missed points by 4.56 on average against yours 4.94, rebounds by 2.01 against 2.16, and assists by 1.35 against 1.50. These are still projections, not certainties.

## Off-season and next season

- After the season ends (11 Apr 2027) the app simply stops changing. The nightly check still runs, which keeps GitHub's schedule switched on.
- If GitHub ever pauses the schedule, go to the **Actions** tab of the repo and click **Enable workflow**.
- **For 2027-28:** ask Claude Code to *"set this app up for the 2027-28 season"*. Only the settings in `config.json` change, and this season's games stay saved as history.

## Behind the scenes

The full build plan is in [`PLAN.md`](PLAN.md), and rules for future Claude Code sessions are in [`CLAUDE.md`](CLAUDE.md). All data comes from ESPN's free public data.
