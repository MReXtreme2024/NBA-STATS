// Checks before saving or publishing. Any failure throws, which stops the run,
// so the live site keeps the last good data.

const TEAM_COUNT = 30;
const MAX_GP = 82;

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

// Checks on the rebuilt app data, against the last published data (if any).
export function checkAppData(data, previous) {
  if (data.teams.length !== TEAM_COUNT) throw new Error(`Expected ${TEAM_COUNT} teams, got ${data.teams.length}`);
  const before = new Map((previous?.teams ?? []).map((t) => [t.id, t.gp]));
  for (const t of data.teams) {
    if (t.gp > MAX_GP) throw new Error(`${t.name} has ${t.gp} games played, more than ${MAX_GP}: a wrong game slipped in`);
    if (before.has(t.id) && t.gp < before.get(t.id)) {
      throw new Error(`${t.name} games played went down from ${before.get(t.id)} to ${t.gp}`);
    }
  }
}
