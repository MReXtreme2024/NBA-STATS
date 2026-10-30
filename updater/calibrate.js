// Learning from every result, for bet-slip chances. For each finished game, each player's Claude's-formula
// projection and what he actually did are kept in data/calibration/<season>-results.json (the real pre-game
// projection when one was saved, otherwise one made from only the games before it). Each night the record
// is re-learned: how far results land from projections (a lean, and the spread), and the real shape of the
// misses, so a leg's chance of going over is "how often a result that far above the projection has happened".

import fs from 'node:fs';
import path from 'node:path';
import { projectGame, lineOf } from './model.js';

export const SLIP_STATS = ['pts', 'reb', 'ast'];
const MIN_MINUTES = 15; // only players projected a real role are learned from (slips use rotation players)

// One finished game's records: [{ id, stat, mu, x }] for players who played.
export function gameRecords(game, projection) {
  const out = [];
  for (const actual of game.teams) {
    const side = projection.home.teamId === actual.id ? projection.home : projection.away;
    for (const p of actual.players) {
      const m = side.players.find((x) => x.id === p.id);
      if (!p.played || !m || m.min < MIN_MINUTES) continue;
      const a = lineOf(p.stats);
      for (const s of SLIP_STATS) out.push({ id: p.id, stat: s, mu: Math.round(m[s] * 100) / 100, x: a[s] });
    }
  }
  return out;
}

// Learn the lean, spread and shape of misses for each stat from all records.
export function learn(records) {
  const out = {};
  for (const s of SLIP_STATS) {
    const rs = records.filter((r) => r.stat === s);
    if (rs.length < 30) { out[s] = null; continue; }
    const bias = rs.reduce((t, r) => t + r.x, 0) / rs.reduce((t, r) => t + r.mu, 0);
    const k = rs.reduce((t, r) => t + (r.x - bias * r.mu) ** 2 / Math.max(r.mu, 1), 0) / rs.length;
    const z = rs.map((r) => (r.x - bias * r.mu) / Math.sqrt(k * Math.max(r.mu, 1))).sort((a, b) => a - b);
    // 101 points of the shape (every percent), enough for the phone to work out any line's chance
    const shape = Array.from({ length: 101 }, (_, i) => Math.round(z[Math.min(z.length - 1, Math.floor((i / 100) * (z.length - 1)))] * 1000) / 1000);
    out[s] = { n: rs.length, bias: Math.round(bias * 10000) / 10000, k: Math.round(k * 1000) / 1000, shape };
  }
  return out;
}

// Bring the record up to date (new finished games only) and re-learn. Returns { calibration, added }.
//   games: saved finished games; snapshots: saved pre-game projections; context for projecting: { prior, positions }.
export function updateCalibration(dataDir, season, games, snapshots, { prior = {}, positions = {}, lines = {} } = {}) {
  const file = path.join(dataDir, 'calibration', `${season}-results.json`);
  const store = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const bySnapshot = new Map(snapshots.map((s) => [s.id, s]));
  const sorted = [...games].sort((a, b) => a.start.localeCompare(b.start));
  let added = 0;
  for (const g of sorted) {
    if (store[g.id]) continue;
    const prev = sorted.filter((x) => x.start < g.start);
    const home = g.teams.find((t) => t.homeAway === 'home');
    const away = g.teams.find((t) => t.homeAway === 'away');
    if (!prev.some((x) => x.teams.some((t) => t.id === home.id)) || !prev.some((x) => x.teams.some((t) => t.id === away.id))) continue;
    const snap = bySnapshot.get(g.id);
    let projection;
    let source;
    if (snap) {
      // the real pre-game projection (saved before tip-off with that day's injury report)
      const side = (id) => ({ teamId: id, players: Object.entries(snap.teams[id]?.players ?? {}).map(([pid, p]) => ({ id: pid, min: p.min ?? 99, ...p.claude })) });
      projection = { home: side(home.id), away: side(away.id) };
      source = 'real';
    } else {
      // projected from only the earlier games; players who had been playing but missed it count as ruled out
      const injuries = {};
      for (const side of [home, away]) {
        const now = new Set(side.players.filter((p) => p.played).map((p) => p.id));
        injuries[side.id] = {};
        for (const x of prev) for (const t of x.teams) if (t.id === side.id) for (const p of t.players) if (p.played && !now.has(p.id)) injuries[side.id][p.id] = 'Out';
      }
      projection = projectGame(prev, { homeId: home.id, awayId: away.id, start: g.start }, { extras: { line: lines[g.id] ?? null, injuries }, prior, positions });
      source = 'replay';
    }
    store[g.id] = { start: g.start, source, records: gameRecords(g, projection) };
    added++;
  }
  if (added) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(store) + '\n');
  }
  const records = Object.values(store).flatMap((e) => e.records);
  return { calibration: { ...learn(records), games: Object.keys(store).length }, added };
}
