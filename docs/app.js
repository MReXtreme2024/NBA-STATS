import { MODES, playerStat, show, teamAverage, working } from './calc.js';
import { allocate, lineupScores } from './claude.js';
import { MIN_SLIP_MINUTES, STAT_NAME, chanceOver, settle, slipChance, suggestSlips } from './slips.js';

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
  const mine = readSlips();
  const slips = `<a class="upcoming-link" href="#/slips"><span>My bet slips</span><span class="gp">${mine.length} saved ›</span></a>`;
  return `${bar('Upcoming games', '#/', 'Melbourne times · tap a game for projections')}${formulaTabs(formula)}${body}${slips}${results}`;
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

// Starting lineups Nate confirms before tip-off, kept on his phone: { teamId: { starters: [id], out: [id] } }.
const LINEUP_PREFIX = 'lineup:';
function readLineup(gameId) {
  try { return JSON.parse(localStorage.getItem(LINEUP_PREFIX + gameId)) ?? null; } catch { return null; }
}
function saveLineup(gameId, lineup) {
  try {
    if (lineup) localStorage.setItem(LINEUP_PREFIX + gameId, JSON.stringify(lineup));
    else localStorage.removeItem(LINEUP_PREFIX + gameId);
  } catch { /* private mode: the lineup just isn't kept */ }
}
// Forget lineups for games that are no longer upcoming.
function tidyLineups() {
  try {
    const live = new Set((data.upcoming?.games ?? []).map((g) => LINEUP_PREFIX + g.id));
    for (const k of Object.keys(localStorage)) if (k.startsWith(LINEUP_PREFIX) && !live.has(k)) localStorage.removeItem(k);
  } catch { /* nothing to tidy */ }
}

// Claude's formula for a game: the nightly figures, re-worked on the phone with Nate's confirmed lineup if he set one.
// Claude's formula for a game with a lineup: team scores moved by what the lineup changes (players'
// ratings), then each team's players re-worked to the new score. all: include every player (lineup screen).
function claudeWith(g, lineups, { all = false } = {}) {
  const scores = lineupScores(g.claude, lineups);
  const redo = (side, key) => {
    if (!side.inputs) return side;
    const score = scores?.[key] ?? side.score;
    const exp = side.inputs.expected;
    const inputs = { ...side.inputs, expected: { ...exp, pts: score, ast: side.score ? (exp.ast * score) / side.score : exp.ast } };
    return { ...side, score, lineupChange: score - side.score, ...allocate(inputs, lineups[side.teamId], { all, positionRates: g.claude.positionRates }) };
  };
  return { ...g.claude, home: redo(g.claude.home, 'home'), away: redo(g.claude.away, 'away') };
}
const claudeFor = (g) => {
  const lineup = readLineup(g.id);
  return g.claude && lineup ? claudeWith(g, lineup) : g.claude;
};

// "Confirm starting lineup" button, or a note that it's confirmed.
function lineupButton(g) {
  if (!g.claude?.home?.inputs) return '';
  const done = readLineup(g.id);
  return `<a class="lineup-link${done ? ' done' : ''}" href="#/game/${g.id}/lineup">${done
    ? '<span>✓ Lineup confirmed by you</span><span class="gp">Edit ›</span>'
    : '<span>Confirm starting lineup</span><span class="gp">Before tip-off ›</span>'}</a>`;
}

// The lineup Claude's formula expects for one team: last game's starters (unless ruled out) as projected
// starters, injured players out, nobody confirmed yet.
function predictedLineup(inputs) {
  const isOut = (c) => /^out$/i.test(c.status);
  return {
    starters: [],
    projected: inputs.candidates.filter((c) => c.starter && !isOut(c)).map((c) => c.id),
    out: inputs.candidates.filter(isOut).map((c) => c.id),
    positions: {},
  };
}

let lineupDraft = null; // { gameId, teams: { teamId: lineup }, open: playerId } while Nate is editing
let lineupFromMatchup = false; // opened with the button, so saving can step back to the matchup page

const ROLES = [['confirmed', 'Confirmed starter'], ['projected', 'Projected starter'], ['out', 'Out']];
const ROLE_LIST = { confirmed: 'starters', projected: 'projected', out: 'out' };
const roleIn = (pick, id) => (pick.starters.includes(id) ? 'confirmed' : pick.projected.includes(id) ? 'projected' : pick.out.includes(id) ? 'out' : 'bench');
const ROLE_SHORT = { confirmed: 'Confirmed', projected: 'Projected', out: 'Out', bench: 'Bench' };

// 9. Lineup: tap a player to set Confirmed starter, Projected starter or Out (untapped = bench) and his
// position; his points, rebounds and assists update straight away.
function lineupPage(g) {
  const away = teamById(g.awayId);
  const home = teamById(g.homeId);
  const sides = [[away, g.claude.away], [home, g.claude.home]];
  if (lineupDraft?.gameId !== g.id) {
    const saved = readLineup(g.id);
    lineupDraft = {
      gameId: g.id,
      open: null,
      teams: Object.fromEntries(sides.map(([t, side]) => {
        const base = predictedLineup(side.inputs);
        const s = saved?.[t.id];
        return [t.id, s ? { starters: s.starters ?? [], projected: s.projected ?? [], out: s.out ?? [], positions: s.positions ?? {} } : base];
      })),
    };
  }
  const draft = claudeWith(g, lineupDraft.teams, { all: true });
  const scoreLine = [[away, draft.away], [home, draft.home]].map(([t, s]) => {
    const ch = changeText(s.score, s.score - (s.lineupChange ?? 0));
    return `${esc(t.code)} ${one(s.score)}${ch ? ` <small>(${ch})</small>` : ''}`;
  }).join(' · ');
  const teamBlock = ([t, side]) => {
    const pick = lineupDraft.teams[t.id];
    const result = draft[side === g.claude.home ? 'home' : 'away'];
    const projOf = (id) => result.players.find((p) => p.id === id) ?? { pts: 0, reb: 0, ast: 0 }; // out: 0P 0R 0A
    const avgMin = (c) => (c.w ? c.wMin / c.w : 0);
    const rows = [...side.inputs.candidates]
      .sort((a, b) => b.starter - a.starter || avgMin(b) - avgMin(a)) // fixed order, so rows don't jump while tapping
      .map((c) => {
        const role = roleIn(pick, c.id);
        const pos = pick.positions[c.id] ?? c.pos;
        const p = projOf(c.id);
        const nums = `<span class="pra"><b>${one(p.pts)}</b>P <b>${one(p.reb)}</b>R <b>${one(p.ast)}</b>A</span>`;
        const note = c.status ? ` <span class="tag">${esc(c.status === 'Day-To-Day' ? 'GTD' : c.status)}</span>` : '';
        const isOpen = lineupDraft.open === c.id;
        const row = `<button class="lineup-row role-${role}" data-open="${c.id}" aria-expanded="${isOpen}">
          <span class="name">${esc(c.name)}${note}<span class="mins">${pos || '—'} · ${ROLE_SHORT[role]}</span></span>${nums}</button>`;
        if (!isOpen) return `<li>${row}</li>`;
        const posBtn = (x) => `<button data-pos="${x}" data-team="${t.id}" data-player="${c.id}" aria-pressed="${pos === x}">${x}${x === c.pos ? ' <small>usual</small>' : ''}</button>`;
        const roleBtn = ([r, label]) => `<button data-role="${r}" data-team="${t.id}" data-player="${c.id}" aria-pressed="${role === r}">${label}</button>`;
        return `<li>${row}<div class="lineup-panel">
          <h4>${esc(c.name)}</h4>
          <p class="panel-label">Position</p><div class="choice">${['PG', 'SG', 'SF', 'PF', 'C'].map(posBtn).join('')}</div>
          <p class="panel-label">Status <small>(tap again for bench)</small></p><div class="choice">${ROLES.map(roleBtn).join('')}</div>
          <div class="figures"><div><b>${one(p.pts)}</b><span>Points</span></div><div><b>${one(p.reb)}</b><span>Rebounds</span></div><div><b>${one(p.ast)}</b><span>Assists</span></div></div>
        </div></li>`;
      }).join('');
    const n = pick.starters.length + pick.projected.length;
    return `<section class="stat"><h3><span class="pill" style="${colours(t)}">${esc(t.code)}</span> Starters: <b class="${n === 5 ? '' : 'warn'}">${n} of 5</b> <small>(${pick.starters.length} confirmed)</small></h3>
      <ul class="lineup">${rows}</ul></section>`;
  };
  return `${bar(`${away.code} @ ${home.code} lineup`, `#/game/${g.id}`, 'Tap a player to set his status and position')}
    <p class="out-line"><b>Projected score with this lineup:</b> ${scoreLine}</p>
    <div class="stats">${sides.map(teamBlock).join('')}</div>
    <div class="buttons lineup-actions">
      <button class="button" data-lineup="reset">Back to predicted</button>
      <button class="button primary" data-lineup="save">Save lineup</button>
    </div>
    <p class="working">Confirmed starters are certain to play their usual starter minutes. Projected starters get mostly starter minutes, with a small chance they come off the bench. Everyone you don't tap comes off the bench; players marked Out are removed and their minutes shared out. Moving a player to another position shifts his numbers halfway toward that position's league averages, and his teammates are re-balanced. Your formula leaves out players marked Out.</p>`;
}

// Saved bet slips, kept on the phone (they stay after the game, so the record builds up).
const SLIPS_KEY = 'betSlips';
function readSlips() {
  try { return JSON.parse(localStorage.getItem(SLIPS_KEY)) ?? []; } catch { return []; }
}
function writeSlips(list) {
  try { localStorage.setItem(SLIPS_KEY, JSON.stringify(list)); } catch { /* private mode: not kept */ }
}
const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`);
// Claude's chance against what the odds say (1 ÷ odds; the bookmaker's margin makes this a little high).
function valueText(chance, odds) {
  if (chance === null) return '';
  if (!(odds > 1)) return `Claude's chance all three go over: <b>${pct(chance)}</b>. Add the odds to compare.`;
  const implied = 1 / odds;
  const verdict = chance > implied * 1.05 ? 'Claude rates this <b>better</b> than the odds suggest'
    : chance < implied * 0.95 ? 'Claude rates this <b>worse</b> than the odds suggest' : 'About what the odds suggest';
  return `Claude's chance all three go over: <b>${pct(chance)}</b> · the odds imply ${pct(implied)}. ${verdict}.`;
}

let slipDraft = null; // { gameId, slips, odds: { i: text }, saved: { i: true } } on a game's slips page

// 10. A game's two suggested bet slips (from Claude's formula with Nate's lineup): edit lines, add odds, save.
function slipsPage(g) {
  const away = teamById(g.awayId);
  const home = teamById(g.homeId);
  if (slipDraft?.gameId !== g.id) {
    const c = claudeFor(g);
    const averages = (teamId, id) => {
      const p = teamById(teamId)?.players.find((x) => x.id === id);
      return p?.gp ? { pts: p.totals.pts / p.gp, reb: p.totals.reb / p.gp, ast: p.totals.ast / p.gp } : null;
    };
    slipDraft = { gameId: g.id, slips: suggestSlips([c.away, c.home], averages, data.calibration), odds: {}, saved: {} };
  }
  const lineupNote = readLineup(g.id) ? '' : `<p class="out-line">You haven't confirmed this game's lineup, so these use the injury report. <a href="#/game/${g.id}/lineup">Confirm lineup ›</a></p>`;
  const cards = slipDraft.slips.map((slip, i) => {
    const legs = slip.legs.map((l, j) => `<li class="leg">
      <span class="name">${pill(teamById(l.teamId))} ${esc(l.name)}<span class="mins">Claude projects ${one(l.mu)} · chance over ${pct(l.chance)}</span></span>
      <span class="line-edit"><button data-step="-1" data-slip="${i}" data-leg="${j}" aria-label="Lower line">−</button>
        <b>Over ${l.line.toFixed(1)}</b><small>${STAT_NAME[l.stat]}</small>
        <button data-step="1" data-slip="${i}" data-leg="${j}" aria-label="Raise line">+</button></span></li>`).join('');
    const odds = slipDraft.odds[i] ?? '';
    return `<section class="stat slip"><h3>${slip.title}</h3>
      <ul class="legs">${legs}</ul>
      <label class="odds">Odds for this slip <input data-odds="${i}" inputmode="decimal" placeholder="e.g. 5.50" value="${esc(odds)}"></label>
      <p class="working" data-value="${i}">${valueText(slipChance(slip.legs), Number(odds))}</p>
      <button class="button primary" data-save-slip="${i}">${slipDraft.saved[i] ? '✓ Saved — save again to update' : 'Save slip'}</button></section>`;
  }).join('');
  return `${bar(`${away.code} @ ${home.code} bet slips`, `#/game/${g.id}`, 'Goal: all three go over')}
    ${lineupNote}<div class="stats">${cards}</div>
    <p class="working"><b>Safest overs</b> picks, for each stat, the player most likely to go over a line set at his season average (to the .5 below). <b>Biggest projections</b> picks the top projected player for each stat. Three different players each time, from players expected to play ${MIN_SLIP_MINUTES}+ minutes, with lines of at least 9.5 points, 3.5 rebounds and 2.5 assists. Change a line with − and + to match your bookmaker's; the chance updates. Chances come from how far real results have landed from Claude's projections, re-learned every night. They treat the three legs as separate, though in one game they can move together. Points chances have run a few % high so far. These are estimates, not certainties — bet only what you're comfortable losing.</p>
    <a class="upcoming-link" href="#/slips"><span>My bet slips</span><span class="gp">${readSlips().length} saved ›</span></a>`;
}

// 11. Saved slips, settled from each night's results, with Claude's record and what it has learned.
function mySlipsPage() {
  const slips = readSlips().sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  const settled = slips.map((s) => ({ s, r: settle(s, data.recent) }));
  const count = (st) => settled.filter((x) => x.r.status === st).length;
  const legs = settled.flatMap((x) => x.s.legs.map((l, i) => ({ l, r: x.r.legs[i] }))).filter((x) => x.r.result === 'hit' || x.r.result === 'miss');
  const saidAvg = legs.length ? legs.reduce((t, x) => t + (x.l.chance ?? 0), 0) / legs.length : null;
  const hitRate = legs.length ? legs.filter((x) => x.r.result === 'hit').length / legs.length : null;
  const record = `<section class="stat"><h3>Your record</h3>
    <div class="figures"><div><b>${count('won')}</b><span>Won</span></div><div><b>${count('lost')}</b><span>Lost</span></div><div><b>${count('pending')}</b><span>Waiting</span></div></div>
    <p class="working">Each slip is one bet: it wins only if all three legs go over, and one leg missing makes it one loss.</p>
    <p class="working">${legs.length ? `How Claude's chances are tracking (single legs, not your bets): ${legs.length} legs settled; Claude gave them ${pct(saidAvg)} on average and ${pct(hitRate)} went over.` : 'No settled legs yet. Slips settle after each game, once the nightly update has the results.'}${count('void') ? ` ${count('void')} slip(s) void (players didn't play).` : ''}</p></section>`;
  const cal = data.calibration;
  const hist = (cal?.history ?? []).slice(-6).map((h) => `<tr><td>${dateText(h.date)}</td><td>${h.games}</td><td>×${h.pts?.lean ?? '—'}</td><td>×${h.reb?.lean ?? '—'}</td><td>×${h.ast?.lean ?? '—'}</td></tr>`).join('');
  const learning = cal?.pts ? `<section class="stat"><h3>What Claude has learned</h3>
    <p class="working">Every night Claude compares its projections with what players actually did and re-learns its chances. So far: ${cal.games} games, ${cal.pts.n} player results. "Lean" is how results compare with projections (×1.00 = spot on, ×0.97 = results 3% lower).</p>
    <div class="table-wrap"><table class="results"><thead><tr><th>Night</th><th>Games</th><th>Points</th><th>Rebounds</th><th>Assists</th></tr></thead><tbody>${hist}</tbody></table></div></section>` : '';
  const badge = { won: '✓ Won', lost: '✗ Lost', void: 'Void', pending: 'Waiting' };
  const cards = settled.map(({ s, r }) => `<section class="stat slip ${r.status}"><h3>${esc(s.game)} · ${esc(s.title)} <span class="badge ${r.status}">${badge[r.status]}</span></h3>
    <ul class="legs">${s.legs.map((l, i) => {
    const res = r.legs[i];
    const mark = res.result === 'hit' ? '✓' : res.result === 'miss' ? '✗' : res.result === 'void' ? 'void' : '';
    return `<li class="leg"><span class="name">${esc(l.name)} over ${l.line.toFixed(1)} ${STAT_NAME[l.stat]}<span class="mins">Claude: ${one(l.mu)} projected, ${pct(l.chance)} chance</span></span><b>${res.actual ?? ''} ${mark}</b></li>`;
  }).join('')}</ul>
    <p class="working">${s.start ? startText(s.start) : ''}${s.odds ? ` · odds ${s.odds.toFixed(2)}` : ''} · Claude's chance ${pct(s.chance)}</p>
    <button class="button" data-delete-slip="${esc(s.id)}">Delete</button></section>`).join('');
  return `${bar('My bet slips', '#/upcoming', 'Settled automatically after each game')}${record}${cards || '<p class="message">No saved slips yet. Confirm a game\'s lineup to get its slips.</p>'}${learning}`;
}

function claudeMatchup(g, away, home) {
  const c = claudeFor(g);
  if (!c) return '<p class="message">Claude\'s formula isn\'t ready for this game yet. It appears after the next nightly update.</p>';
  const scoreBox = (t, side) => {
    const parts = [`Stats model ${one(side.model)}`];
    if (side.market !== null) parts.push(`Betting market ${one(side.market)}`);
    const ch = changeText(side.score, side.score - (side.lineupChange ?? 0));
    if (ch) parts.push(`Your lineup ${ch}`);
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
  const slipLink = g.claude?.home?.inputs && data.calibration?.pts
    ? `<a class="lineup-link done" href="#/game/${g.id}/slips"><span>Bet slips for this game</span><span class="gp">${readLineup(g.id) ? 'With your lineup' : 'Confirm lineup first'} ›</span></a>` : '';
  return `${slipLink}<section class="matchup">${scoreBox(away, c.away)}${scoreBox(home, c.home)}</section>
    ${outLine(away, c.away)}${outLine(home, c.home)}
    <div class="stats">${sections}</div>
    <p class="working">How Claude's formula works: team scores blend a pace-and-efficiency model (10%) with the betting market's implied score (90%). Player figures are expected minutes × per-minute production (this season blended with last season), scaled to the team's projected totals for this matchup. Players ruled out are removed and their minutes shared out; GTD = game-time decision. Figures are cut to one decimal.</p>`;
}

// Players to project for an upcoming game: those on the current roster (when known) who have played for this team.
const projectable = (t, out = []) => t.players.filter((p) => (t.roster?.length ? t.roster.includes(p.id) : p.gp > 0) && !out.includes(p.id));

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
    return `${bar(`${away.code} @ ${home.code}`, '#/upcoming', `${startText(g.start)}${note}`)}${gameNav(g)}${lineupButton(g)}${formulaTabs(formula)}${claudeMatchup(g, away, home)}`;
  }
  const outFor = (t) => readLineup(g.id)?.[t.id]?.out ?? [];
  const column = (t, s) => {
    const items = projectable(t, outFor(t))
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
  return `${bar(`${away.code} @ ${home.code}`, '#/upcoming', `${startText(g.start)}${note}`)}${gameNav(g)}${lineupButton(g)}
    ${formulaTabs(formula)}
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
  const game = parts[0] === 'game' ? data.upcoming?.games.find((g) => g.id === parts[1]) : null;
  if (parts.length === 0) {
    html = teamsPage();
  } else if (parts[0] === 'results') {
    html = resultsPage(); title = 'How did the projections go?';
  } else if (parts[0] === 'upcoming') {
    html = upcomingPage(); title = 'Upcoming games';
  } else if (parts[0] === 'slips') {
    html = mySlipsPage(); title = 'My bet slips';
  } else if (game && parts[2] === 'slips' && game.claude?.home?.inputs) {
    html = slipsPage(game); title = `${teamById(game.awayId).code} @ ${teamById(game.homeId).code} bet slips`;
  } else if (game && parts[2] === 'lineup' && game.claude?.home?.inputs) {
    html = lineupPage(game); title = `${teamById(game.awayId).code} @ ${teamById(game.homeId).code} lineup`;
  } else if (game) {
    lineupDraft = null;
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
  if (e.target.closest('.lineup-link')) lineupFromMatchup = true;
  const openBtn = e.target.closest('[data-open]');
  if (openBtn && lineupDraft) {
    lineupDraft.open = lineupDraft.open === openBtn.dataset.open ? null : openBtn.dataset.open;
    const y = window.scrollY; render(); window.scrollTo(0, y); return;
  }
  const roleBtn = e.target.closest('[data-role]');
  if (roleBtn && lineupDraft) {
    const pick = lineupDraft.teams[roleBtn.dataset.team];
    const id = roleBtn.dataset.player;
    const was = roleIn(pick, id);
    for (const list of Object.values(ROLE_LIST)) pick[list] = pick[list].filter((x) => x !== id);
    if (was !== roleBtn.dataset.role) pick[ROLE_LIST[roleBtn.dataset.role]].push(id); // tapping his current status again = bench
    const y = window.scrollY; render(); window.scrollTo(0, y); return;
  }
  const posBtn = e.target.closest('[data-pos]');
  if (posBtn && lineupDraft) {
    lineupDraft.teams[posBtn.dataset.team].positions[posBtn.dataset.player] = posBtn.dataset.pos;
    const y = window.scrollY; render(); window.scrollTo(0, y); return;
  }
  const lineupBtn = e.target.closest('[data-lineup]');
  if (lineupBtn && lineupDraft) {
    const gameId = lineupDraft.gameId;
    const saving = lineupBtn.dataset.lineup === 'save';
    saveLineup(gameId, saving ? lineupDraft.teams : null);
    lineupDraft = null;
    slipDraft = null; // new lineup, new suggested slips
    lineupFromMatchup = false;
    // Saving a lineup opens this game's bet slips (Back returns to the matchup); resetting returns to the matchup.
    location.replace(saving && data.calibration?.pts ? `#/game/${gameId}/slips` : `#/game/${gameId}`);
    return;
  }
  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn && slipDraft) {
    const l = slipDraft.slips[stepBtn.dataset.slip].legs[stepBtn.dataset.leg];
    l.line = Math.max(0.5, l.line + Number(stepBtn.dataset.step));
    l.chance = chanceOver(l.mu, l.line, data.calibration?.[l.stat]);
    const y = window.scrollY; render(); window.scrollTo(0, y); return;
  }
  const saveSlipBtn = e.target.closest('[data-save-slip]');
  if (saveSlipBtn && slipDraft) {
    const i = Number(saveSlipBtn.dataset.saveSlip);
    const slip = slipDraft.slips[i];
    const odds = Number(document.querySelector(`[data-odds="${i}"]`)?.value) || null;
    const g = data.upcoming?.games.find((x) => x.id === slipDraft.gameId);
    const all = readSlips().filter((x) => !(x.gameId === slipDraft.gameId && x.type === slip.type));
    all.push({
      id: `${slipDraft.gameId}-${slip.type}`, gameId: slipDraft.gameId, start: g?.start ?? null,
      game: g ? `${teamById(g.awayId).code} @ ${teamById(g.homeId).code}` : '', type: slip.type, title: slip.title,
      legs: slip.legs.map((l) => ({ ...l })), odds: odds && odds > 1 ? odds : null, chance: slipChance(slip.legs), saved: new Date().toISOString(),
    });
    writeSlips(all);
    slipDraft.saved[i] = true;
    const y = window.scrollY; render(); window.scrollTo(0, y); return;
  }
  const delSlip = e.target.closest('[data-delete-slip]');
  if (delSlip) {
    writeSlips(readSlips().filter((x) => x.id !== delSlip.dataset.deleteSlip));
    const y = window.scrollY; render(); window.scrollTo(0, y); return;
  }
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
app.addEventListener('input', (e) => {
  const box = e.target.closest('[data-odds]');
  if (!box || !slipDraft) return;
  slipDraft.odds[box.dataset.odds] = box.value;
  const slip = slipDraft.slips[box.dataset.odds];
  const out = document.querySelector(`[data-value="${box.dataset.odds}"]`);
  if (out) out.innerHTML = valueText(slipChance(slip.legs), Number(box.value));
});

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
  tidyLineups();
  render();
} catch {
  app.innerHTML = `<p class="message">Couldn't load the stats. Check your connection and try again.</p>`;
}
