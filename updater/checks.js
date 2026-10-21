// Checks before saving or publishing. Any failure throws, which stops the run.

// Each team's player points must add up to its final score.
export function checkGame(game) {
  if (game.teams.length !== 2) throw new Error(`Game ${game.id}: expected 2 teams, got ${game.teams.length}`);
  for (const team of game.teams) {
    const pts = team.players.filter((p) => p.played).reduce((sum, p) => sum + Number(p.stats.points), 0);
    if (pts !== team.score) {
      throw new Error(`Game ${game.id}: ${team.code} players total ${pts} points but final score is ${team.score}`);
    }
  }
}
