import { MODES, cut, hundredths, playerStat, show, teamAverage, working } from './calc.js';
import { LADDER_STATS, MIN_LADDER_MINUTES, SAFETY, pickRung, rungChances } from './ladders.js';

const app = document.getElementById('app');
const TZ = 'Australia/Melbourne';
const STATS = ['pts', 'reb', 'ast', 'tpm', 'blk', 'stl'];
const SHORT = { pts: 'PTS', reb: 'REB', ast: 'AST', tpm: '3PM', blk: 'BLK', stl: 'STL' };
const LONG = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', tpm: '3PM', blk: 'Blocks', stl: 'Steals' };
const PROJ_STATS = ['pts', 'reb', 'ast', 'tpm']; // the Projections page shows only these
const MODE_KEY = 'playerMode';
const FORMULA_KEY = 'upcomingFormula';
const D = { decimals: true };

let data;
let playerSort = 'pts';
let projectionSort = 'pts';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const colours = (team) => `background:${team.colour};color:${team.textColour}`;

// "Checked 12:04am Thu 22 Oct" in Melbourne time.
function checkedText(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short', day: 'numeric', month: 'short',
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `Checked ${p.hour}:${p.minute}${p.dayPeriod.toLowerCase()} ${p.weekday} ${p.day} ${p.month}`;
}

// "2026-10-21" (already a Melbourne date) -> "Wed 21 Oct"
function dateText(ymd) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${ymd}T00:00:00Z`)).replace(',', '');
}

// "2026-10-22T23:30Z" -> "Fri 23 Oct · 10:30am" in Melbourne time.
function startText(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short', day: 'numeric', month: 'short',
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} ${p.month} · ${p.hour}:${p.minute}${p.dayPeriod.toLowerCase()}`;
}

function bar(title, backHref, sub = '') {
  const back = backHref ? `<a class="back" href="${backHref}" aria-label="Back">‹</a>` : '';
  return `<header class="bar">${back}<h1>${esc(title)}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</h1></header>`;
}

function readMode() {
  try { return localStorage.getItem(MODE_KEY) === MODES.PLAYED ? MODES.PLAYED : MODES.ALL; } catch { return MODES.ALL; }
}
function readFormula() {
  try { return localStorage.getItem(FORMULA_KEY) === 'claude' ? 'claude' : 'nate'; } catch { return 'nate'; }
}
function saveFormula(f) {
  try { localStorage.setItem(FORMULA_KEY, f); } catch { /* private mode: just don't remember */ }
}

// The Upcoming games page: Games, Ladders (every player's ladder rung across the day's games) or Differences.
const VIEW_KEY = 'upcomingView';
const readStored = (key, allowed, fallback) => {
  try { const v = localStorage.getItem(key); return allowed.includes(v) ? v : fallback; } catch { return fallback; }
};
const store = (key, v) => { try { localStorage.setItem(key, v); } catch { /* private mode: not remembered */ } };
function viewTabs(view) {
  const btn = (v, label) => `<button data-view="${v}" aria-pressed="${view === v}">${label}</button>`;
  return `<div class="switch tabs three" role="group" aria-label="View">${btn('games', 'Games')}${btn('ladders', 'Ladders')}${btn('diffs', 'Differences')}</div>`;
}

// Team averages at the top of a game page (14 Nov 2026, Nate's request, replacing the ratings box): each
// team's points, rebounds and assists a game, and what it gives up a game. In each table the better team
// in each stat (higher scored, lower allowed) is coloured by how many of the three it wins: green all 3,
// yellow 2, red 1. Whole-number maths like Nate's formula: averages cut to 2 decimals.
const WIN_CLASS = { 3: 'c3', 2: 'c2', 1: 'c1' };
// Expected tonight in hundredths: (his average + what the opponent gives up) ÷ 2, in whole numbers.
const expectedTonight = (t, o, s) => cut(100 * (t.totals[s] * o.gp + o.allowed[s] * t.gp), 2 * t.gp * o.gp);
function teamAveragesBox(away, home) {
  if (!away.gp || !home.gp) return '';
  // Two groups of three, each coloured on its own (14 Nov 2026: Nate added 3-pointers, steals and blocks).
  const groups = [[['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists']], [['tpm', '3-pointers'], ['stl', 'Steals'], ['blk', 'Blocks']]];
  const table = (title, key, lowerWins, note) => {
    const avg = (t, s) => teamAverage(t[key][s], t.gp);
    const lines = [];
    const body = groups.map((stats) => {
      const winner = Object.fromEntries(stats.map(([s]) => {
        const a = avg(away, s);
        const h = avg(home, s);
        return [s, a === h ? null : (lowerWins ? a < h : a > h) ? away : home];
      }));
      const wins = (t) => stats.filter(([s]) => winner[s] === t).length;
      const cls = { [away.id]: WIN_CLASS[wins(away)] ?? '', [home.id]: WIN_CLASS[wins(home)] ?? '' };
      const lead = [away, home].map((t) => ({ t, n: wins(t) })).sort((x, y) => y.n - x.n)[0];
      lines.push(`<b>${esc(lead.t.code)}</b> ${lowerWins ? 'gives up less' : 'is higher'} in ${lead.n} of 3 (${stats.map(([, l]) => l.toLowerCase()).join(', ')})`);
      const cell = (t, s) => `<td class="${winner[s] === t ? `best ${cls[t.id]}` : ''}">${hundredths(avg(t, s))}</td>`;
      return `<tbody>${stats.map(([s, label]) => `<tr><th scope="row">${label}</th>${cell(away, s)}${cell(home, s)}</tr>`).join('')}</tbody>`;
    }).join('');
    return `<h4 class="avg-title">${title}<span class="mins">${note}</span></h4>
      <div class="table-wrap"><table class="results team-avgs"><thead><tr><th></th><th scope="col">${pill(away)}</th><th scope="col">${pill(home)}</th></tr></thead>${body}</table></div>
      <p class="working">${lines.join('.<br>')}.</p>`;
  };
  // Expected tonight (14 Nov 2026, Nate's request): meet in the middle, (his average + what the opponent
  // gives up) ÷ 2, worked in whole numbers: cut(100 × (total × oppGP + oppAllowed × GP), 2 × GP × oppGP).
  const expected = expectedTonight;
  const tonight = `<h4 class="avg-title">Expected tonight<span class="mins">(average + opponent gives up) ÷ 2</span></h4>
      <div class="table-wrap"><table class="results team-avgs"><thead><tr><th></th><th scope="col">${pill(away)}</th><th scope="col">${pill(home)}</th></tr></thead><tbody>${[['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['tpm', '3-pointers']].map(([s, label]) => `<tr><th scope="row">${label}</th><td>${hundredths(expected(away, home, s))}</td><td>${hundredths(expected(home, away, s))}</td></tr>`).join('')}</tbody></table></div>
      <p class="working">e.g. ${esc(away.code)} points: (${hundredths(teamAverage(away.totals.pts, away.gp))} + ${hundredths(teamAverage(home.allowed.pts, home.gp))}) ÷ 2. Tested on this season's games, this beat a team's own average for points, rebounds and assists.</p>`;
  return `<section class="stat team-box"><h3>Team averages</h3>
    ${tonight}
    ${table('Per game', 'totals', false, 'higher is better')}
    ${table('Given up per game', 'allowed', true, 'lower is better')}
    <p class="legend"><span class="chip c3">3 of 3</span><span class="chip c2">2 of 3</span><span class="chip c1">1 of 3</span> how many of the three in each group (points, rebounds, assists / 3-pointers, steals, blocks) the team is better in. Given up = what opponents average against them. Season averages over ${away.gp} (${esc(away.code)}) and ${home.gp} (${esc(home.code)}) games, cut to 2 decimals.</p></section>`;
}

// The Your formula / Claude's formula tabs on the results page.
function formulaTabs(formula) {
  const btn = (f, label) => `<button data-formula="${f}" aria-pressed="${formula === f}">${label}</button>`;
  return `<div class="switch tabs" role="group" aria-label="Formula">${btn('nate', 'Your formula')}${btn('claude', "Claude's formula")}</div>`;
}

// Claude's formula figures are decimals, shown cut to one decimal: 24.19 -> "24.1".
const one = (x) => (Math.floor(x * 10 + 1e-9) / 10).toFixed(1);
// The change between two shown figures, as shown: 118.67 -> 118.43 is "−0.2" (blank if none).
const changeText = (now, was) => {
  const d = Math.round((Number(one(now)) - Number(one(was))) * 10) / 10;
  return d ? `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}` : '';
};

function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private mode: just don't remember */ }
}

// 1. Teams (home)
function teamsPage() {
  const rows = data.teams.map((t) => `
    <li><a class="row" href="#/team/${t.id}" style="${colours(t)}">
      <span>${esc(t.name)}</span><span class="gp">${t.gp} played</span>
    </a></li>`).join('');
  const count = data.upcoming?.games.length ?? 0;
  const upcoming = `<a class="upcoming-link" href="#/upcoming"><span>Upcoming games</span><span class="gp">${count} ${count === 1 ? 'game' : 'games'} ›</span></a>`;
  return `${bar('NBA 2026-27', null, checkedText(data.checked))}${upcoming}<ul class="teams">${rows}</ul>`;
}

// 2. Team page, in Nate's wording
function teamPage(t) {
  const avg = (s) => show(teamAverage(t.totals[s], t.gp), D);
  const lines = [
    `Total points ${t.totals.pts} (average ${avg('pts')} points)`,
    `Total rebounds ${t.totals.reb} (average ${avg('reb')} rebounds)`,
    `Total assists ${t.totals.ast} (average ${avg('ast')} assists)`,
    `Total 3 pointers made ${t.totals.tpm} (average ${avg('tpm')} 3PM)`,
    `Total blocks made ${t.totals.blk} (average ${avg('blk')} blocks)`,
    `Total steals ${t.totals.stl} (average ${avg('stl')} steals)`,
  ];
  return `${bar('', '#/')}
    <section class="panel" style="${colours(t)}">
      <h2>${esc(t.name)}</h2>
      <p>Games played ${t.gp}</p>
      <div class="lines">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      <div class="buttons">
        <a class="button" href="#/team/${t.id}/games">Games</a>
        <a class="button" href="#/team/${t.id}/players">Players</a>
        <a class="button wide" href="#/team/${t.id}/projections">Projections</a>
      </div>
    </section>`;
}

// 3. Games, newest first
function gamesPage(t) {
  const heads = ['Opponent', 'Points', 'Rebounds', 'Assists', '3PM', 'Blocks', 'Steals'];
  const rows = t.games.map((g) => `
    <tr><td><span class="opp">${g.home ? 'vs' : '@'} ${esc(g.opp)}</span><span class="date">${dateText(g.date)}</span></td>
    ${STATS.map((s) => `<td>${g[s]}</td>`).join('')}</tr>`).join('');
  const body = t.games.length
    ? `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>
       <tbody>${rows}</tbody></table></div>`
    : '<p class="message">No games yet.</p>';
  return `${bar(`${t.name} games`, `#/team/${t.id}`)}${body}`;
}

// 4. Players, sortable, Player column stays put
function playersPage(t) {
  const players = [...t.players].sort((a, b) => {
    if (playerSort === 'name') return a.name.localeCompare(b.name);
    const av = playerSort === 'gp' ? a.gp : a.totals[playerSort];
    const bv = playerSort === 'gp' ? b.gp : b.totals[playerSort];
    return bv - av || b.totals.pts - a.totals.pts || a.name.localeCompare(b.name);
  });
  const cols = [['name', 'Player'], ['gp', 'GP'], ...STATS.map((s) => [s, SHORT[s]])];
  const head = cols.map(([key, label]) =>
    `<th scope="col"${key === playerSort ? ' aria-sort="descending"' : ''}><button data-sort="${key}">${label}</button></th>`).join('');
  const rows = players.map((p) => {
    const href = `#/team/${t.id}/player/${p.id}`;
    return `<tr data-href="${href}"><td><a href="${href}">${esc(p.name)}</a></td><td>${p.gp}</td>
      ${STATS.map((s) => `<td>${p.totals[s]}</td>`).join('')}</tr>`;
  }).join('');
  const body = t.players.length
    ? `<div class="table-wrap sticky"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="message">No players yet.</p>';
  return `${bar(`${t.name} players`, `#/team/${t.id}`)}${body}`;
}

// The All team games / Games he played switch, shared by the Projections and Player pages.
function modeSwitch(mode) {
  const btn = (m, label) => `<button data-mode="${m}" aria-pressed="${mode === m}">${label}</button>`;
  return `<div class="switch" role="group" aria-label="Share based on">
      ${btn(MODES.ALL, 'All team games')}${btn(MODES.PLAYED, 'Games he played')}
    </div>`;
}

const statFor = (t, p, s, mode) => playerStat({
  teamTotal: t.totals[s], teamGP: t.gp, playerTotal: p.totals[s],
  teamTotalInHisGames: p.teamTotalsInHisGames[s], playerGP: p.gp,
}, mode);

// 4b. Projections: players with a projection of 1 or more in Points, Rebounds, Assists or 3PM.
// Projections below 1 are left blank.
function projectionsPage(t) {
  const mode = readMode();
  const rows = t.players
    .map((p) => ({ p, proj: Object.fromEntries(PROJ_STATS.map((s) => [s, statFor(t, p, s, mode).projection ?? 0])) }))
    .filter(({ proj }) => PROJ_STATS.some((s) => proj[s] >= 1))
    .sort((a, b) => {
      if (projectionSort === 'name') return a.p.name.localeCompare(b.p.name);
      if (projectionSort === 'gp') return b.p.gp - a.p.gp || a.p.name.localeCompare(b.p.name);
      return b.proj[projectionSort] - a.proj[projectionSort] || b.proj.pts - a.proj.pts || a.p.name.localeCompare(b.p.name);
    });
  const cols = [['name', 'Player'], ['gp', 'GP'], ...PROJ_STATS.map((s) => [s, SHORT[s]])];
  const head = cols.map(([key, label]) =>
    `<th scope="col"${key === projectionSort ? ' aria-sort="descending"' : ''}><button data-psort="${key}">${label}</button></th>`).join('');
  const body = rows.map(({ p, proj }) => {
    const href = `#/team/${t.id}/player/${p.id}`;
    return `<tr data-href="${href}"><td><a href="${href}">${esc(p.name)}</a></td><td>${p.gp}</td>
      ${PROJ_STATS.map((s) => `<td>${proj[s] >= 1 ? proj[s] : ''}</td>`).join('')}</tr>`;
  }).join('');
  const table = rows.length
    ? `<div class="table-wrap sticky"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
    : '<p class="message">No projections yet.</p>';
  return `${bar(`${t.name} projections`, `#/team/${t.id}`)}${modeSwitch(mode)}${table}`;
}

const teamById = (id) => data.teams.find((t) => t.id === id);
// Games that started in the last 30 hours (kept with their pre-game ladders, 22 Nov 2026), then those still to come.
const todaysGames = () => [...(data.upcoming?.earlier ?? []), ...(data.upcoming?.games ?? [])];
const pill = (t) => `<span class="pill" style="${colours(t)}">${esc(t.code)}</span>`;

// 6. Upcoming games: today's (US date) games not yet started, from the nightly update.
function upcomingPage() {
  const view = readStored(VIEW_KEY, ['games', 'ladders', 'diffs'], 'games');
  const games = data.upcoming?.games ?? [];
  const rows = games.map((g) => {
    const away = teamById(g.awayId);
    const home = teamById(g.homeId);
    const note = g.note ? `<span class="note">${esc(g.note)}</span>` : '';
    const score = g.claude
      ? `<span class="proj-score">${one(g.claude.away.score)} – ${one(g.claude.home.score)}</span>` : '';
    return `<li><a class="game-row" href="#/game/${g.id}">
      <span class="teams-line">${pill(away)}<span class="at">@</span>${pill(home)}</span>
      <span class="when">${score}${startText(g.start)}${note}</span></a></li>`;
  }).join('');
  const earlier = (data.upcoming?.earlier ?? []).map((g) => {
    const away = teamById(g.awayId);
    const home = teamById(g.homeId);
    const status = g.final ? `<span class="proj-score">Final ${g.final.score[g.awayId]} – ${g.final.score[g.homeId]}</span>` : '<span class="proj-score">Started</span>';
    return `<li><a class="game-row" href="#/game/${g.id}">
      <span class="teams-line">${pill(away)}<span class="at">@</span>${pill(home)}</span>
      <span class="when">${status}${startText(g.start)}</span></a></li>`;
  }).join('');
  const earlierList = earlier ? `<h2 class="group">Earlier games <small>pre-game ladders${data.upcoming.earlier.some((g) => g.final) ? ', checked' : ''}</small></h2><ul class="games-list">${earlier}</ul>` : '';
  const body = !games.length && !earlier ? null : view === 'ladders' ? (games.length ? ladderRankings(games) : '<p class="message">No games still to start.</p>') : view === 'diffs' ? differences(games) : `${games.length ? `<ul class="games-list">${rows}</ul>` : ''}${earlierList}`;
  const shown = body !== null
    ? body
    : '<p class="message">No upcoming games right now. The list refreshes with each nightly update.</p>';
  const results = data.results?.games
    ? `<a class="upcoming-link" href="#/results"><span>How did the projections go?</span><span class="gp">${data.results.games} games scored ›</span></a>` : '';
  return `${bar('Upcoming games', '#/', 'Melbourne times · tap a game for ladders')}${viewTabs(view)}${shown}${results}`;
}

// Player prop ladders (20 Nov 2026, Nate's request: "your goal is for players to never go under the ladder you
// choose"). Each player projected 15+ minutes gets, for each stat, the highest rung he clears at least 90%, 80%
// and 70% of the time (docs/ladders.js), from Claude's projection and what results have taught it.
const LADDER_KEY = 'ladderStat';
const LEVEL_KEY = 'ladderLevel';
const LADDER_NAMES = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', tpm: '3PM' };
const LADDER_UNITS = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: '3-pointers' };
const pct = (x) => `${Math.floor(x * 100)}%`;
const ladderRows = (side, stat) => side.players
  .filter((p) => p.min >= MIN_LADDER_MINUTES)
  .map((p) => {
    const chances = rungChances(p[stat], stat, data.calibration);
    return { p, chances, picks: SAFETY.map((lv) => pickRung(chances, lv)) };
  });
const ladderStatButtons = (stat) => `<div class="switch four" role="group" aria-label="Stat">${LADDER_STATS.map((k) => `<button data-ladder="${k}" aria-pressed="${stat === k}">${LADDER_NAMES[k]}</button>`).join('')}</div>`;

// Upcoming games → Ladders: every player in the day's games, ranked by his rung at the chosen safety.
function ladderRankings(games) {
  const stat = readStored(LADDER_KEY, LADDER_STATS, 'pts');
  const level = Number(readStored(LEVEL_KEY, SAFETY.map(String), '0.9'));
  const li = SAFETY.indexOf(level);
  if (!data.calibration?.tpm) return '<p class="message">The ladders appear after the next nightly update.</p>';
  const all = games.filter((g) => g.claude).flatMap((g) => [[g.claude.away, g.homeId, false], [g.claude.home, g.awayId, true]]
    .flatMap(([side, oppId, home]) => ladderRows(side, stat).map((r) => ({ ...r, g, team: teamById(side.teamId), opp: teamById(oppId), home }))));
  const picked = all.filter((r) => r.picks[li]).sort((a, b) => b.picks[li].n - a.picks[li].n || b.picks[li].chance - a.picks[li].chance || a.p.name.localeCompare(b.p.name));
  const items = picked.map(({ p, g, team, opp, home, picks }, i) => {
    const tag = p.status ? ` <span class="tag">${esc(p.status === 'Day-To-Day' ? 'GTD' : p.status)}</span>` : '';
    return `<li><a href="#/game/${g.id}"><span class="rank">${i + 1}</span><span class="name">${pill(team)} ${esc(p.name)}${tag}<span class="mins">${home ? 'vs' : '@'} ${esc(opp.code)} · ${startText(g.start)} · ${Math.floor(p.min)} min · projected ${one(p[stat])}</span></span><span class="rung"><b>${picks[li].n}+</b><small>${pct(picks[li].chance)}</small></span></a></li>`;
  }).join('');
  const levelBtns = `<div class="switch three" role="group" aria-label="Safety">${SAFETY.map((lv) => `<button data-level="${lv}" aria-pressed="${lv === level}">${lv * 100}% safe</button>`).join('')}</div>`;
  return `${ladderStatButtons(stat)}${levelBtns}
    <section class="stat"><h3>${LADDER_NAMES[stat]} · ${Math.round(level * 100)}% rung · ${picked.length} of ${all.length} players</h3>${items ? `<ul class="ranking">${items}</ul>` : '<p class="none">No player has a rung that safe today</p>'}</section>
    ${ladderRecordBox()}
    <p class="working">Each player's highest ${LADDER_UNITS[stat]} rung that Claude expects him to clear at least ${Math.round(level * 100)}% of the time (the small % is Claude's chance for that rung). No pick is certain. Players projected under ${MIN_LADDER_MINUTES} minutes, and anyone ruled out, are left off; players with no rung that safe aren't listed. Tap a player for his game.</p>`;
}

// How the ladder picks have done once games finished (recorded each night before tip-off).
function ladderRecordBox() {
  const rec = data.ladderRecord;
  if (!rec?.games) return `<section class="stat"><h3>Ladder record</h3><p class="working">Every night's picks are saved before tip-off and checked after the game. The record starts with today's games. In testing on this season's games so far, rungs picked at 90% were cleared 90–96% of the time, at 80% 85–90%, and at 70% 76–83%.</p></section>`;
  const row = (r) => `<tr><th scope="row">${LADDER_NAMES[r[0]]}</th>${SAFETY.map((lv) => { const x = r[1][lv]; return `<td>${x.picks ? `<b>${pct(x.hits / x.picks)}</b><span class="proj">${x.hits} of ${x.picks}</span>` : '—'}</td>`; }).join('')}</tr>`;
  const table = (record) => `<div class="table-wrap"><table class="results"><thead><tr><th></th>${SAFETY.map((lv) => `<th scope="col">${lv * 100}%</th>`).join('')}</tr></thead><tbody>${Object.entries(record).map(row).join('')}</tbody></table></div>`;
  return `<section class="stat"><h3>Ladder record · how often picks were cleared</h3>
    <p class="working">Season so far (${rec.games} games):</p>${table(rec.season)}
    ${rec.lastDay ? `<p class="working">Last day, ${dateText(rec.lastDate)} (${rec.lastDay.games} games):</p>${table(rec.lastDay.record)}` : ''}</section>`;
}

// 8. Results: both formulas' real pre-game projections against what happened.
function resultsPage() {
  const r = data.results;
  const back = '#/upcoming';
  if (!r?.games) return `${bar('How did the projections go?', back)}<p class="message">No finished games with saved projections yet.</p>`;
  const formula = readFormula();
  const fig = (v) => (v === null ? '—' : v.toFixed(2));
  const row = (label, k) => {
    const c = r.claude[k];
    const n = r.nate[k];
    return `<tr><th scope="row">${label}</th><td class="${c <= n ? 'win' : ''}">${fig(c)}</td><td class="${n < c ? 'win' : ''}">${fig(n)}</td></tr>`;
  };
  const summary = `<section class="stat"><h3>Season so far · average miss (lower is better)</h3>
    <div class="table-wrap"><table class="results"><thead><tr><th></th><th scope="col">Claude</th><th scope="col">Yours</th></tr></thead>
    <tbody>${row('Points', 'pts')}${row('Rebounds', 'reb')}${row('Assists', 'ast')}${row('P+R+A', 'pra')}</tbody></table></div>
    <p class="working">${r.games} games, ${r.players} player performances. Projections were made before tip-off with that day's injury report.</p></section>`;
  const shown = (v) => (formula === 'claude' ? one(v) : String(v));
  const cell = (proj, actual) => `<td><b>${actual}</b><span class="proj">${shown(proj)}</span></td>`;
  const games = r.lastDay.map((g) => {
    const away = teamById(g.away.id);
    const home = teamById(g.home.id);
    const proj = (t) => (formula === 'claude' && t.projected !== null ? ` <span class="proj">(${one(t.projected)})</span>` : '');
    const rows = g.players.map((p) => {
      const f = p[formula];
      return `<tr><td><a href="#/team/${p.teamId}/player/${p.id}">${esc(p.name)}</a><span class="date">${esc(teamById(p.teamId).code)}</span></td>
        ${cell(f.pts, p.actual.pts)}${cell(f.reb, p.actual.reb)}${cell(f.ast, p.actual.ast)}</tr>`;
    }).join('');
    return `<section class="stat"><h3>${pill(away)} ${g.away.actual}${proj(g.away)} @ ${pill(home)} ${g.home.actual}${proj(g.home)}</h3>
      <div class="table-wrap sticky"><table class="results"><thead><tr><th scope="col">Player</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th></tr></thead>
      <tbody>${rows}</tbody></table></div></section>`;
  }).join('');
  return `${bar('How did the projections go?', back, `Last day: ${dateText(r.lastDate)} · actual in bold, projection below`)}
    ${summary}${formulaTabs(formula)}<div class="stats">${games}</div>`;
}

const claudeFor = (g) => g.claude;

// Upcoming games → Differences (14 Nov 2026, Nate's request): each game's gap between the two teams'
// Expected tonight figures (e.g. NYK 112.13 v IND 107.51 points = NYK +4.62), ranked biggest first, per stat.
const DIFF_KEY = 'diffStat';
const DIFF_STATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['tpm', '3PM']];
function differences(games) {
  const stat = readStored(DIFF_KEY, DIFF_STATS.map(([k]) => k), 'pts');
  const rows = games.map((g) => {
    const away = teamById(g.awayId);
    const home = teamById(g.homeId);
    if (!away.gp || !home.gp) return null;
    const a = expectedTonight(away, home, stat);
    const h = expectedTonight(home, away, stat);
    const [top, other, topV, otherV] = a >= h ? [away, home, a, h] : [home, away, h, a];
    return { g, top, other, topV, otherV, gap: topV - otherV };
  }).filter(Boolean).sort((x, y) => y.gap - x.gap);
  const items = rows.map(({ g, top, other, topV, otherV, gap }, i) => `<li><a href="#/game/${g.id}"><span class="rank">${i + 1}</span><span class="name">${pill(top)} over ${esc(other.code)}<span class="mins">${esc(top.code)} ${hundredths(topV)} – ${esc(other.code)} ${hundredths(otherV)} · ${top.id === g.homeId ? 'home' : 'away'} · ${startText(g.start)}</span></span><b>+${hundredths(gap)}</b></a></li>`).join('');
  const name = Object.fromEntries(DIFF_STATS)[stat];
  return `<div class="switch four" role="group" aria-label="Stat">${DIFF_STATS.map(([k, label]) => `<button data-diff="${k}" aria-pressed="${stat === k}">${label}</button>`).join('')}</div>
    <section class="stat"><h3>${name} · biggest Expected tonight gap first · ${rows.length} games</h3>${items ? `<ul class="ranking">${items}</ul>` : '<p class="none">No games yet</p>'}</section>
    <p class="working">For each game: both teams' Expected tonight ${name === '3PM' ? '3-pointers' : name.toLowerCase()} ((team's average + what the opponent gives up) ÷ 2), and how far ahead the higher team is. Tap a game to open it. Whole-number maths, cut to 2 decimals.</p>`;
}

// A game's ladders: team averages, projected scores, then each team's players with their 90%, 80% and 70%
// rungs for the chosen stat; tap a player for his full ladder (every rung's chance).
let openLadder = null; // player id whose full ladder is showing
function ladderMatchup(g, away, home) {
  const c = g.claude;
  if (!c) return '<p class="message">Claude\'s ladders aren\'t ready for this game yet. They appear after the next nightly update.</p>';
  const stat = readStored(LADDER_KEY, LADDER_STATS, 'pts');
  const scoreBox = (t, side) => {
    const parts = [`Stats model ${one(side.model)}`];
    if (side.market !== null) parts.push(`Betting market ${one(side.market)}`);
    return `<div class="panel" style="${colours(t)}"><p>${esc(t.code)} projected</p><h2 class="big">${one(side.score)}</h2><p class="small">${parts.join(' · ')}</p></div>`;
  };
  const outLine = (t, side) => (side.out.length ? `<p class="out-line"><b>${esc(t.code)} out:</b> ${side.out.map((o) => esc(o.name)).join(', ')}</p>` : '');
  const k = LADDER_STATS.indexOf(stat);
  // Finished games: each rung ticked (cleared) or crossed, with what he actually got.
  const actualOf = (id) => (g.final ? g.final.actual[id]?.[k] ?? null : null);
  const cell = (pick, actual) => (pick
    ? `<td class="${actual === null ? '' : actual >= pick.n ? 'hit' : 'miss'}"><b>${pick.n}+${actual === null ? '' : actual >= pick.n ? ' ✓' : ' ✗'}</b><span class="proj">${pct(pick.chance)}</span></td>`
    : '<td class="none">—</td>');
  const block = (t, side) => {
    // players with no rung even 70% likely are left off (21 Nov 2026, Nate: "a lot of space taken up for nothing")
    const rows = ladderRows(side, stat).filter((r) => r.picks.some(Boolean)).sort((a, b) => b.p[stat] - a.p[stat] || a.p.name.localeCompare(b.p.name)).map(({ p, chances, picks }) => {
      const tag = p.status ? ` <span class="tag">${esc(p.status === 'Day-To-Day' ? 'GTD' : p.status)}</span>` : '';
      const full = openLadder === p.id && chances
        ? `<tr class="full-ladder"><td colspan="4"><div class="chips">${chances.map((r) => `<span class="chip${r.chance >= SAFETY[0] ? ' c3' : r.chance >= SAFETY[1] ? ' c2' : r.chance >= SAFETY[2] ? ' c1' : ''}">${r.n}+ ${pct(r.chance)}</span>`).join('')}</div></td></tr>` : '';
      const actual = actualOf(p.id);
      const got = !g.final ? '' : actual === null ? ' · didn\'t play' : ` · <b>got ${actual}</b>`;
      return `<tr data-ladder-open="${p.id}"><th scope="row">${esc(p.name)}${tag}<span class="mins">${Math.floor(p.min)} min · proj ${one(p[stat])}${got}</span></th>${picks.map((pk) => cell(pk, actual)).join('')}</tr>${full}`;
    }).join('');
    return `<section class="stat"><h3>${pill(t)} ${esc(t.name)}</h3>
      ${rows ? `<div class="table-wrap"><table class="results ladders"><thead><tr><th scope="col">${LADDER_NAMES[stat]}</th>${SAFETY.map((lv) => `<th scope="col">${lv * 100}%</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="none">No player has a ${LADDER_UNITS[stat]} rung 70%+ likely</p>`}</section>`;
  };
  const startedNote = !g.started ? '' : g.final
    ? `<p class="out-line"><b>Final: ${esc(away.code)} ${g.final.score[g.awayId]} – ${esc(home.code)} ${g.final.score[g.homeId]}.</b> These are Claude's ladders from before tip-off: ✓ = he cleared the rung, ✗ = he didn't.</p>`
    : '<p class="out-line"><b>This game has started.</b> These are Claude\'s ladders from before tip-off; each rung is ticked or crossed once the result is in (after the next update).</p>';
  return `${startedNote}${teamAveragesBox(away, home)}<section class="matchup">${scoreBox(away, c.away)}${scoreBox(home, c.home)}</section>
    ${outLine(away, c.away)}${outLine(home, c.home)}
    ${ladderStatButtons(stat)}
    ${data.calibration?.tpm ? `${block(away, c.away)}${block(home, c.home)}` : '<p class="message">The ladders appear after the next nightly update.</p>'}
    <p class="working">Ladders: for each player, the highest ${LADDER_UNITS[stat]} rung Claude expects him to clear at least 90%, 80% and 70% of the time (the % under it is Claude's chance). Tap a player to see every rung (green 90%+, yellow 80%+, red 70%+). Built from Claude's projection, not just season averages: each team's score comes from its offensive rating against the opponent's defensive rating (points per 100 possessions) and both teams' pace, blended with the betting market; players' on-court offensive and defensive ratings shift that for who is playing or out; team rebounds, assists and 3-pointers are adjusted for what the opponent gives up; then each player gets his expected minutes × production per minute, scaled to his team's total. The chances then allow for how far real results have landed from these projections this season, re-learned every night. No pick is ever certain. Players projected under ${MIN_LADDER_MINUTES} minutes, anyone ruled out, and players with no rung at least 70% likely are left off.</p>`;
}

// Players to project for an upcoming game: those on the current roster (when known) who have played for this team.
const projectable = (t, out = []) => t.players.filter((p) => (t.roster?.length ? t.roster.includes(p.id) : p.gp > 0) && !out.includes(p.id));

// 7. Matchup: for each projection stat, the two teams' players side by side, highest first, 1 or more only.
// The upcoming game before or after this one (wrapping round), for swiping and the ‹ › arrows.
function neighbourGame(id, step) {
  const games = todaysGames();
  const i = games.findIndex((g) => g.id === id);
  return i === -1 || games.length < 2 ? null : games[(i + step + games.length) % games.length];
}

// "‹  3 of 9  ›" under the title of a matchup page.
function gameNav(g) {
  const games = todaysGames();
  if (games.length < 2) return '';
  const i = games.findIndex((x) => x.id === g.id);
  const prev = neighbourGame(g.id, -1);
  const next = neighbourGame(g.id, 1);
  return `<nav class="game-nav" aria-label="Other upcoming games">
    <a href="#/game/${prev.id}" data-replace aria-label="Previous game">‹</a>
    <span>Game ${i + 1} of ${games.length} · swipe for more</span>
    <a href="#/game/${next.id}" data-replace aria-label="Next game">›</a></nav>`;
}

function matchupPage(g) {
  const mode = readMode();
  const away = teamById(g.awayId);
  const home = teamById(g.homeId);
  if (g.claude) {
    const note = g.note ? ` · ${g.note}` : '';
    return `${bar(`${away.code} @ ${home.code}`, '#/upcoming', `${startText(g.start)}${note}`)}${gameNav(g)}${ladderMatchup(g, away, home)}`;
  }
  const column = (t, s) => {
    const items = projectable(t)
      .map((p) => ({ p, v: statFor(t, p, s, mode).projection }))
      .filter(({ v }) => v !== null && v >= 1)
      .sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name))
      .map(({ p, v }) => `<li><a href="#/team/${t.id}/player/${p.id}"><span class="name">${esc(p.name)}</span><b>${v}</b></a></li>`)
      .join('');
    return `<div class="side"><div class="side-head" style="${colours(t)}">${esc(t.code)}</div>
      ${items ? `<ul>${items}</ul>` : '<p class="none">No projections</p>'}</div>`;
  };
  const sections = PROJ_STATS.map((s) => `<section class="stat"><h3>${LONG[s]}</h3>
      <div class="sides">${column(away, s)}${column(home, s)}</div></section>`).join('');
  const note = g.note ? ` · ${g.note}` : '';
  return `${bar(`${away.code} @ ${home.code}`, '#/upcoming', `${startText(g.start)}${note}`)}${gameNav(g)}
    <p class="out-line">Claude's formula isn't ready for this game yet (it appears after the next nightly update), so this shows your formula.</p>
    <section class="matchup">
      <div class="panel" style="${colours(away)}"><h2>${esc(away.name)}</h2><p>Away · ${away.gp} played</p></div>
      <div class="panel" style="${colours(home)}"><h2>${esc(home.name)}</h2><p>Home · ${home.gp} played</p></div>
    </section>
    ${modeSwitch(mode)}
    <div class="stats">${sections}</div>`;
}

// On-court ratings from the play-by-play: points per 100 possessions his team scores and allows with him
// on the court, against its usual (pulled toward 0 until he has played enough).
function ratingsCard(p) {
  const r = p.rating;
  if (!r) return '';
  const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
  const net = r.off - r.def;
  return `<section class="stat"><h3>On-court ratings · points per 100 possessions vs his team</h3>
    <div class="figures">
      <div><b>${signed(r.off)}</b><span>Offence (scored)</span></div>
      <div><b>${signed(r.def)}</b><span>Defence (allowed)</span></div>
      <div><b>${signed(net)}</b><span>Net</span></div>
    </div>
    <p class="working">With him on the court, his team scores ${signed(r.off)} and allows ${signed(r.def)} points per 100 possessions compared with its usual (for defence, minus is good). Based on about ${r.poss} possessions; early in the season these are pulled toward 0 until he has played enough.</p></section>`;
}

// 5. Player page: share % and projection per stat, two modes
function playerPage(t, p) {
  const mode = readMode();
  const cards = STATS.map((s) => {
    const r = statFor(t, p, s, mode);
    return `<div class="stat"><h3>${LONG[s]}</h3>
      <div class="figures">
        <div><b>${p.totals[s]}</b><span>Total</span></div>
        <div><b>${show(r.share, { ...D, suffix: '%' })}</b><span>Share</span></div>
        <div><b>${show(r.projection)}</b><span>Projection</span></div>
      </div>
      <p class="working">${working(p.totals[s], r)}</p></div>`;
  }).join('');
  return `${bar('', `#/team/${t.id}/players`)}
    <section class="panel" style="${colours(t)}">
      <h2>${esc(p.name)}</h2><p>Played ${p.gp} of ${t.gp} team games</p>
    </section>
    ${ratingsCard(p)}
    ${modeSwitch(mode)}
    <div class="stats">${cards}</div>`;
}

function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let html;
  let title = 'NBA Team Stats';
  const team = parts[0] === 'team' ? data.teams.find((t) => t.id === parts[1]) : null;
  const game = parts[0] === 'game' ? todaysGames().find((g) => g.id === parts[1]) : null;
  if (parts.length === 0) {
    html = teamsPage();
  } else if (parts[0] === 'results') {
    html = resultsPage(); title = 'How did the projections go?';
  } else if (parts[0] === 'upcoming') {
    html = upcomingPage(); title = 'Upcoming games';
  } else if (game) {
    html = matchupPage(game); title = `${teamById(game.awayId).code} @ ${teamById(game.homeId).code}`;
  } else if (team && parts.length === 2) {
    html = teamPage(team); title = team.name;
  } else if (team && parts[2] === 'games') {
    html = gamesPage(team); title = `${team.name} games`;
  } else if (team && parts[2] === 'players') {
    html = playersPage(team); title = `${team.name} players`;
  } else if (team && parts[2] === 'projections') {
    html = projectionsPage(team); title = `${team.name} projections`;
  } else if (team && parts[2] === 'player' && team.players.some((p) => p.id === parts[3])) {
    const player = team.players.find((p) => p.id === parts[3]);
    html = playerPage(team, player); title = player.name;
  } else {
    html = `${bar('Not found', '#/')}<p class="message">That page doesn't exist.</p>`;
  }
  document.title = title;
  app.innerHTML = html;
}

app.addEventListener('click', (e) => {
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) { playerSort = sortBtn.dataset.sort; render(); return; }
  const projSortBtn = e.target.closest('[data-psort]');
  if (projSortBtn) { projectionSort = projSortBtn.dataset.psort; render(); return; }
  const ladderBtn = e.target.closest('[data-ladder]');
  if (ladderBtn) { store(LADDER_KEY, ladderBtn.dataset.ladder); openLadder = null; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const levelBtn = e.target.closest('[data-level]');
  if (levelBtn) { store(LEVEL_KEY, levelBtn.dataset.level); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const ladderRow = e.target.closest('[data-ladder-open]');
  if (ladderRow) { openLadder = openLadder === ladderRow.dataset.ladderOpen ? null : ladderRow.dataset.ladderOpen; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const diffBtn = e.target.closest('[data-diff]');
  if (diffBtn) { store(DIFF_KEY, diffBtn.dataset.diff); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) { store(VIEW_KEY, viewBtn.dataset.view); render(); return; }
  const formulaBtn = e.target.closest('[data-formula]');
  if (formulaBtn) { saveFormula(formulaBtn.dataset.formula); render(); return; }
  const modeBtn = e.target.closest('[data-mode]');
  if (modeBtn) { saveMode(modeBtn.dataset.mode); render(); return; }
  const replaceLink = e.target.closest('a[data-replace]');
  if (replaceLink) { e.preventDefault(); location.replace(replaceLink.getAttribute('href')); return; }
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a')) location.hash = row.dataset.href;
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
// Matchup pages: swipe left for the next upcoming game, right for the previous one.
// Moving between games replaces the page in history, so Back still returns to the games list.
const openGame = (g) => { if (g) location.replace(`#/game/${g.id}`); };
let touch = null;
app.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  // ignore two-finger gestures, tables that scroll sideways, and the screen edge (the phone's own back swipe)
  touch = e.touches.length === 1 && !e.target.closest('.table-wrap') && t.clientX > 24 && t.clientX < innerWidth - 24
    ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
app.addEventListener('touchend', (e) => {
  const m = /^#\/game\/([^/]+)$/.exec(location.hash);
  if (!touch || !m) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return; // not a clear sideways swipe
  openGame(neighbourGame(m[1], dx < 0 ? 1 : -1));
}, { passive: true });

try {
  const res = await fetch('data/app-data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
  render();
} catch {
  app.innerHTML = `<p class="message">Couldn't load the stats. Check your connection and try again.</p>`;
}
