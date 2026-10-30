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

**Player offensive and defensive ratings.** From ESPN's play-by-play, the app tracks who was on the court for every second, and works out each player's ratings: how many points per 100 possessions his team scores (offence) and allows (defence) while he plays, compared with his team's usual. Each Player page shows them (offence, defence and net; for defence, minus is good). Claude's formula uses them for team scores: when good players are out or play fewer minutes, the stats model's team scores move to match who is actually playing. When you confirm a lineup that differs from the injury report, the team scores move by what the change is worth through those ratings (shown as "Your lineup +0.5"), and each team's players are re-worked to the new score. Early in the season each player's ratings are pulled toward his team's average until he has played enough. (They mostly sharpen the stats-model part of team scores; the betting market already prices in injuries, and player points, rebounds and assists barely change.)

**How did the projections go?** At the bottom of the Upcoming games page, this page scores both formulas' real projections (made before tip-off, with that day's injury report) against what actually happened: a season scoreboard for points, rebounds and assists, then the last day's games player by player, with the actual number in bold and the projection below it. As of 29 Oct, over 23 games, Claude's formula missed points by 4.56 on average against yours 4.94, rebounds by 2.01 against 2.16, and assists by 1.35 against 1.50. These are still projections, not certainties.

**Bet slips.** When you confirm a starting lineup and save it, the app opens **Bet slips for this game** (also linked at the top of every Claude's formula matchup). It suggests two 3-leg slips, each with one player over on points, one on rebounds and one on assists (three different players, all projected 20+ minutes):

- **Safest overs**: the three legs Claude rates most likely to go over.
- **Biggest projections**: the players with the biggest projected numbers.

Each line starts at the player's season average, to the .5 below (like a bookmaker's line), and never below 9.5 points, 3.5 rebounds or 2.5 assists. Use − / + to match the line your bookmaker offers, then type the slip's odds. The app shows Claude's chance of each leg and of the whole slip, and compares it with the chance the odds imply. Tap **Save slip** to keep it.

**Claude's slips (locked).** Under your two slips, the page shows two more that you can't change: Claude's own picks. Claude chooses the players and the lines, using common bookmaker lines (10+, 15+, 20+ points; 4+, 6+, 8+ rebounds; 3+, 5+, 7+ assists). It looks for value: players whose projection (with your lineup, injuries and the matchup) is above their season average, since bookmakers' prices roughly follow the average.

- **Claude's banker:** every leg at least 80% likely in Claude's view.
- **Claude's bigger payout:** every leg at least 55%, for higher odds.

The nightly update records Claude's slips for every game, so Claude builds up its own record. If you save a lineup before tip-off, Claude re-picks them for your lineup, and that version counts on your phone. In a test on the season's first 48 games, the banker won 41 (Claude had said about 72%) and the bigger payout won 18 (Claude had said about 32%).

**What percentages to look for:** Claude's chance for a slip against the chance the odds imply (1 ÷ the odds; 4.00 odds means 25%). A slip is worth it in Claude's view only when Claude's chance is higher than the odds' chance, for example Claude 30% at odds of 4.00. Claude's slips show "fair odds": any odds above those are value in Claude's view.

**My bet slips** (link on the Upcoming games page) lists saved slips. After each nightly update they settle by themselves: won if all three go over, lost if any doesn't. Each slip counts as one bet in your record (one leg missing = one loss, not three). A leg is void if the player doesn't play. It also shows your record, Claude's record (its locked slips, every game) and how Claude's chances have compared with what actually hit. A settled result is kept on the phone even after the game's results stop being published. Slips are saved on your phone only, so they stay on that phone and browser. Results are kept for two weeks.

How Claude learns: every night, every finished game's projections are compared with what happened. From that the update re-learns how far results tend to land above or below Claude's projections (and how spread out they are) for points, rebounds and assists, and the chances on the slips come from that. The "What Claude has learned" table on My bet slips shows it changing night by night. The three legs are treated as separate events, and in testing the points chances ran a few percent high at the top end. These are estimates, not certainties; only bet what you can afford to lose.

## Off-season and next season

- After the season ends (11 Apr 2027) the app simply stops changing. The nightly check still runs, which keeps GitHub's schedule switched on.
- If GitHub ever pauses the schedule, go to the **Actions** tab of the repo and click **Enable workflow**.
- **For 2027-28:** ask Claude Code to *"set this app up for the 2027-28 season"*. Only the settings in `config.json` change, and this season's games stay saved as history.

## Behind the scenes

The full build plan is in [`PLAN.md`](PLAN.md), and rules for future Claude Code sessions are in [`CLAUDE.md`](CLAUDE.md). All data comes from ESPN's free public data.
