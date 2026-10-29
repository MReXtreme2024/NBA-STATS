import { MODES, playerStat, show, teamAverage, working } from './calc.js';

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

// The Your formula / Claude's formula tabs on the Upcoming games and matchup pages.
function formulaTabs(formula) {
  const btn = (f, label) => `<button data-formula="${f}" aria-pressed="${formula === f}">${label}</button>`;
  return `<div class="switch tabs" role="group" aria-label="Formula">${btn('nate', 'Your formula')}${btn('claude', "Claude's formula")}</div>`;
}

// Claude's formula figures are decimals, shown cut to one decimal: 24.19 -> "24.1".
const one = (x) => (Math.floor(x * 10 + 1e-9) / 10).toFixed(1);

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
const pill = (t) => `<span class="pill" style="${colours(t)}">${esc(t.code)}</span>`;

// 6. Upcoming games: today's (US date) games not yet started, from the nightly update.
function upcomingPage() {
  const formula = readFormula();
  const games = data.upcoming?.games ?? [];
  const rows = games.map((g) => {
    const away = teamById(g.awayId);
    const home = teamById(g.homeId);
    const note = g.note ? `<span class="note">${esc(g.note)}</span>` : '';
    const score = formula === 'claude' && g.claude
      ? `<span class="proj-score">${one(g.claude.away.score)} – ${one(g.claude.home.score)}</span>` : '';
    return `<li><a class="game-row" href="#/game/${g.id}">
      <span class="teams-line">${pill(away)}<span class="at">@</span>${pill(home)}</span>
      <span class="when">${score}${startText(g.start)}${note}</span></a></li>`;
  }).join('');
  const body = games.length
    ? `<ul class="games-list">${rows}</ul>`
    : '<p class="message">No upcoming games right now. The list refreshes with each nightly update.</p>';
  const results = data.results?.games
    ? `<a class="upcoming-link" href="#/results"><span>How did the projections go?</span><span class="gp">${data.results.games} games scored ›</span></a>` : '';
  return `${bar('Upcoming games', '#/', 'Melbourne times · tap a game for projections')}${formulaTabs(formula)}${body}${results}`;
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

// Claude's formula for one game: projected team scores, then every stat side by side.
const CLAUDE_STATS = [
  ['Points', (p) => p.pts], ['Rebounds', (p) => p.reb], ['Assists', (p) => p.ast],
  ['Points + Rebounds', (p) => p.pts + p.reb], ['Points + Assists', (p) => p.pts + p.ast],
  ['Rebounds + Assists', (p) => p.reb + p.ast], ['Points + Rebounds + Assists', (p) => p.pts + p.reb + p.ast],
  ['3PM', (p) => p.tpm],
];

function claudeMatchup(g, away, home) {
  const c = g.claude;
  if (!c) return '<p class="message">Claude\'s formula isn\'t ready for this game yet. It appears after the next nightly update.</p>';
  const scoreBox = (t, side) => {
    const parts = [`Stats model ${one(side.model)}`];
    if (side.market !== null) parts.push(`Betting market ${one(side.market)}`);
    return `<div class="panel" style="${colours(t)}"><p>${esc(t.code)} projected</p><h2 class="big">${one(side.score)}</h2><p class="small">${parts.join(' · ')}</p></div>`;
  };
  const outLine = (t, side) => (side.out.length ? `<p class="out-line"><b>${esc(t.code)} out:</b> ${side.out.map((o) => esc(o.name)).join(', ')}</p>` : '');
  const column = (t, side, value) => {
    const items = [...side.players]
      .sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name))
      .map((p) => {
        const tag = p.status ? ` <span class="tag">${esc(p.status === 'Day-To-Day' ? 'GTD' : p.status)}</span>` : '';
        return `<li><a href="#/team/${t.id}/player/${p.id}"><span class="name">${esc(p.name)}${tag}<span class="mins">${Math.floor(p.min)} min</span></span><b>${one(value(p))}</b></a></li>`;
      }).join('');
    return `<div class="side"><div class="side-head" style="${colours(t)}">${esc(t.code)}</div>
      ${items ? `<ul>${items}</ul>` : '<p class="none">No projections</p>'}</div>`;
  };
  const sections = CLAUDE_STATS.map(([label, value]) => `<section class="stat"><h3>${label}</h3>
      <div class="sides">${column(away, c.away, value)}${column(home, c.home, value)}</div></section>`).join('');
  return `<section class="matchup">${scoreBox(away, c.away)}${scoreBox(home, c.home)}</section>
    ${outLine(away, c.away)}${outLine(home, c.home)}
    <div class="stats">${sections}</div>
    <p class="working">How Claude's formula works: team scores blend a pace-and-efficiency model (10%) with the betting market's implied score (90%). Player figures are expected minutes × per-minute production (this season blended with last season), scaled to the team's projected totals for this matchup. Players ruled out are removed and their minutes shared out; GTD = game-time decision. Figures are cut to one decimal.</p>`;
}

// Players to project for an upcoming game: those on the current roster (when known) who have played for this team.
const projectable = (t) => t.players.filter((p) => (t.roster?.length ? t.roster.includes(p.id) : p.gp > 0));

// 7. Matchup: for each projection stat, the two teams' players side by side, highest first, 1 or more only.
// The upcoming game before or after this one (wrapping round), for swiping and the ‹ › arrows.
function neighbourGame(id, step) {
  const games = data.upcoming?.games ?? [];
  const i = games.findIndex((g) => g.id === id);
  return i === -1 || games.length < 2 ? null : games[(i + step + games.length) % games.length];
}

// "‹  3 of 9  ›" under the title of a matchup page.
function gameNav(g) {
  const games = data.upcoming?.games ?? [];
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
  const formula = readFormula();
  const away = teamById(g.awayId);
  const home = teamById(g.homeId);
  if (formula === 'claude') {
    const note = g.note ? ` · ${g.note}` : '';
    return `${bar(`${away.code} @ ${home.code}`, '#/upcoming', `${startText(g.start)}${note}`)}${gameNav(g)}${formulaTabs(formula)}${claudeMatchup(g, away, home)}`;
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
    ${formulaTabs(formula)}
    <section class="matchup">
      <div class="panel" style="${colours(away)}"><h2>${esc(away.name)}</h2><p>Away · ${away.gp} played</p></div>
      <div class="panel" style="${colours(home)}"><h2>${esc(home.name)}</h2><p>Home · ${home.gp} played</p></div>
    </section>
    ${modeSwitch(mode)}
    <div class="stats">${sections}</div>`;
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
    ${modeSwitch(mode)}
    <div class="stats">${cards}</div>`;
}

function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let html;
  let title = 'NBA Team Stats';
  const team = parts[0] === 'team' ? data.teams.find((t) => t.id === parts[1]) : null;
  const game = parts[0] === 'game' ? data.upcoming?.games.find((g) => g.id === parts[1]) : null;
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
