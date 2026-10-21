# NBA Team Stats

Your personal NBA stats app for the 2026-27 regular season: every team's and player's totals for points, rebounds, assists, 3-pointers made, blocks and steals.

## Your app

**https://mrextreme2024.github.io/NBA-STATS/**

Only people you give this link to will find it. It updates itself every night at about **12:00am Melbourne time**, and nothing runs on your computer. The top of the home screen shows when it last checked, for example "Checked 12:04am Thu 22 Oct".

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

- **Average** = total ÷ games, with the decimals cut off (4.5 becomes 4). Nothing is ever rounded up.
- **Share %** = the player's part of the team's total, decimals cut off.
  - **All team games:** out of the team's total for the whole season.
  - **Games he played:** out of the team's total in only the games he played.
- **Projection** = team average × share %, decimals cut off.

Each Player page shows the working under every number, so you can check it by hand. Small stats like blocks often project to 0. That's expected, because cutting decimals at every step pulls small numbers down.

## Off-season and next season

- After the season ends (11 Apr 2027) the app simply stops changing. The nightly check still runs, which keeps GitHub's schedule switched on.
- If GitHub ever pauses the schedule, go to the **Actions** tab of the repo and click **Enable workflow**.
- **For 2027-28:** ask Claude Code to *"set this app up for the 2027-28 season"*. Only the settings in `config.json` change, and this season's games stay saved as history.

## Behind the scenes

The full build plan is in [`PLAN.md`](PLAN.md), and rules for future Claude Code sessions are in [`CLAUDE.md`](CLAUDE.md). All data comes from ESPN's free public data.
