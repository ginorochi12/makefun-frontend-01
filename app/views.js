// The four surfaces, each a function from API data to HTML:
// the bounty board, a bounty's page, a bounty's leaderboard, an account's profile.
// Long lists are paginated client-side; no view fetches more than it shows.

import { bytes, date, esc, microUsd, money, num, pct, timeLeft, urgency } from './format.js';
import { md } from './md.js';

export const PAGE_SIZE = 25;

/** The reward as it stands now: the prize plus any entry fees paid into it. */
const pot = (b) => money(b.potUsd ?? b.rewardAmount);

/** A live countdown pill, refreshed in place by main.js without a refetch. */
const countdown = (iso) => `<span class="pill ${urgency(iso)}" data-countdown data-deadline="${esc(iso)}">${esc(timeLeft(iso))}</span>`;

/** A stat card: a big value, a label, and an optional sub-line. */
const stat = (label, value, sub = '') => `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${label}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;

/** Pagination controls; main.js handles the clicks and re-renders in place. */
function pager(page, pages) {
  if (pages <= 1) return '';
  const btn = (p, label, disabled = false, current = false) =>
    `<button type="button" data-page="${p}" ${disabled ? 'disabled' : ''} ${current ? 'aria-current="page"' : ''}>${label}</button>`;
  let nums = '';
  for (let p = 1; p <= pages; p += 1) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums += btn(p, p, false, p === page);
    else if (Math.abs(p - page) === 2) nums += '<span class="ellipsis">…</span>';
  }
  return `<nav class="pager" aria-label="Pages">${btn(page - 1, '‹ Prev', page <= 1)}${nums}${btn(page + 1, 'Next ›', page >= pages)}</nav>`;
}

/** A page of a list, with its pager. */
function paged(items, page, renderRow) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safe = Math.min(Math.max(1, page), pages);
  const slice = items.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE);
  return { html: slice.map(renderRow).join(''), pager: pager(safe, pages), pages, showing: slice.length };
}

/** The board's cards, filtered and sorted from the live items: main.js re-renders
 *  only this list as the user types, so the search box never loses focus. */
export function boardList(items, state) {
  const open = items.filter((b) => new Date(b.deadline).getTime() > Date.now());
  const q = state.q.trim().toLowerCase();
  let shown = open.filter((b) => {
    if (state.cat && b.category !== state.cat) return false;
    if (!q) return true;
    return `${b.title} ${b.category} ${(b.skills || []).join(' ')}`.toLowerCase().includes(q);
  });
  const sorters = {
    deadline: (a, b) => new Date(a.deadline) - new Date(b.deadline),
    pot: (a, b) => Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount),
    entries: (a, b) => b.submissionCount - a.submissionCount,
  };
  shown = [...shown].sort(sorters[state.sort] || sorters.deadline);
  if (!shown.length) return { html: '<p class="empty">No open bounties match that filter.</p>', count: 0, total: open.length };
  const cards = shown
    .map(
      (b) => `
      <li class="card">
        <div class="card-top"><span class="chip">${esc(b.category || 'Bounty')}</span>${countdown(b.deadline)}</div>
        <h2><a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h2>
        <p class="card-sub">${esc(b.summary || b.description || '')}</p>
        <div class="card-stats">
          <span><strong>${pot(b)}</strong> pot</span>
          ${b.entryFeeUsd ? `<span><strong>${money(b.entryFeeUsd)}</strong> entry fee</span>` : '<span><strong>Free</strong> to enter</span>'}
          <span><strong>${num(b.submissionCount)}</strong> ${b.submissionCount === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div class="card-foot"><span>Ends ${esc(date(b.deadline))}</span><a href="#/bounty/${encodeURIComponent(b.slug)}">View bounty →</a></div>
      </li>`,
    )
    .join('');
  return { html: `<ul class="board">${cards}</ul>`, count: shown.length, total: open.length };
}

/** The board: every bounty still taking entries, filterable and sortable in place. */
export function boardView(items, state) {
  const open = items.filter((b) => new Date(b.deadline).getTime() > Date.now());
  const categories = [...new Set(open.map((b) => b.category).filter(Boolean))].sort();
  const list = boardList(items, state);
  return `
    <div class="page-head">
      <h1>Open bounties</h1>
      <p class="lede"><span id="board-count">${num(list.total)} live now</span> · rewards paid in USDC on Solana · every entry scored in the open</p>
    </div>
    <form class="filters" id="board-filters">
      <label class="sr-only" for="board-q">Filter bounties</label>
      <input id="board-q" name="q" type="search" placeholder="Filter by title, category or skill…" value="${esc(state.q)}" autocomplete="off">
      <label class="sr-only" for="board-cat">Category</label>
      <select id="board-cat" name="cat">
        <option value="">All categories</option>
        ${categories.map((c) => `<option value="${esc(c)}" ${state.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <label class="sr-only" for="board-sort">Sort</label>
      <select id="board-sort" name="sort">
        <option value="deadline" ${state.sort === 'deadline' ? 'selected' : ''}>Ending soonest</option>
        <option value="pot" ${state.sort === 'pot' ? 'selected' : ''}>Biggest pot</option>
        <option value="entries" ${state.sort === 'entries' ? 'selected' : ''}>Most entries</option>
      </select>
    </form>
    <div id="board-list">${list.html}</div>`;
}

const REWARD_ROWS = (b) => {
  if (Array.isArray(b.rewardsNow) && b.rewardsNow.length) {
    return b.rewardsNow
      .map(
        (r) => `<tr><td>${r.place}</td><td class="num"><strong>${money(r.amountUsd)}</strong></td><td class="num">${money(r.baseUsd)}</td><td class="num">${money(r.feeShareUsd)}</td></tr>`,
      )
      .join('');
  }
  return Object.entries(b.rewards || {})
    .sort((a, b2) => Number(a[0]) - Number(b2[0]))
    .map(([place, amount]) => `<tr><td>${place}</td><td class="num"><strong>${money(amount)}</strong></td><td class="num">—</td><td class="num">—</td></tr>`)
    .join('');
};

/** Tabs shared by a bounty's page and its leaderboard: each is its own URL. */
function bountyTabs(slug, active) {
  return `<nav class="tabs" aria-label="Bounty sections">
    <a href="#/bounty/${encodeURIComponent(slug)}" ${active === 'overview' ? 'aria-current="page"' : ''}>Overview</a>
    <a href="#/bounty/${encodeURIComponent(slug)}/leaderboard" ${active === 'leaderboard' ? 'aria-current="page"' : ''}>Leaderboard</a>
  </nav>`;
}

/** A bounty's page: summary, live pot, rewards table, dates, description, rules, recent entries. */
export function bountyView(b) {
  const live = b.acceptingSubmissions !== false && new Date(b.deadline).getTime() > Date.now();
  const recent = (b.submissions || []).slice(0, 8);
  return `
    <p class="crumbs"><a href="#/">← All bounties</a></p>
    <div class="page-head">
      <div class="card-top"><span class="chip">${esc(b.category || 'Bounty')}</span>${live ? countdown(b.deadline) : '<span class="pill ended">closed</span>'}</div>
      <h1>${esc(b.title)}</h1>
      <p class="lede">${esc(b.summary || '')}</p>
      <p class="meta">by ${esc(b.sponsor?.name || 'make.fun')}${b.sponsor?.isVerified ? ' ✓' : ''} · ${esc((b.skills || []).join(' · '))}</p>
    </div>
    <div class="stats">
      ${stat('Live pot', pot(b), `${num(b.entryFeePayers || 0)} entry fees paid in`)}
      ${stat('Entry fee', b.entryFeeUsd ? money(b.entryFeeUsd) : 'Free', b.entryFeeUsd ? `${money(b.entryFeesUsd || 0)} collected` : 'no fee to enter')}
      ${stat('Entries', num(b.submissionCount), `opened ${esc(date(b.opensAt || b.publishedAt))}`)}
      ${stat('Deadline', esc(date(b.deadline)), live ? 'still taking entries' : 'entries closed')}
    </div>
    ${bountyTabs(b.slug, 'overview')}
    <section aria-labelledby="rewards-h"><h2 id="rewards-h">Rewards</h2>
      <div class="table-wrap"><table class="rewards">
        <thead><tr><th>Place</th><th class="num">Prize now</th><th class="num">Base</th><th class="num">Fee share</th></tr></thead>
        <tbody>${REWARD_ROWS(b)}</tbody>
      </table></div>
      <p class="note">Prizes grow as entry fees join the pot; the table shows the live amounts.</p>
    </section>
    <section aria-labelledby="about-h"><h2 id="about-h">About this bounty</h2><div class="prose">${md(b.description)}</div></section>
    ${b.rules ? `<section aria-labelledby="rules-h"><details class="rules"><summary><h2 id="rules-h">Rules</h2></summary><div class="prose">${md(b.rules)}</div></details></section>` : ''}
    ${recent.length ? `<section aria-labelledby="recent-h"><h2 id="recent-h">Recent entries</h2><ul class="entries">
      ${recent
        .map(
          (s) => `<li><a class="entry-title" href="#/u/${encodeURIComponent(s.hunter)}">${esc(s.title || 'Untitled entry')}</a>
          <span>by <a href="#/u/${encodeURIComponent(s.hunter)}">@${esc(s.hunter)}</a> · ${esc(date(s.createdAt))} · ${esc(s.status || '')}</span></li>`,
        )
        .join('')}
    </ul><p><a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">See the full leaderboard →</a></p></section>` : ''}`;
}

/** One leaderboard row: rank, entry, win rate with its interval, size and build cost. */
function leaderboardRow(e, columns) {
  const judge = e.values?.judge;
  const rate = judge != null ? pct(judge) : '—';
  const interval = e.values?.judge_low != null && e.values?.judge_high != null ? `${pct(e.values.judge_low)}–${pct(e.values.judge_high)}` : '';
  const bar = judge != null ? `<span class="bar"><span style="width:${Math.min(100, Math.max(0, Number(judge) / 10000))}%"></span></span>` : '';
  const games = e.judge ? `${num(e.judge.wins)}W–${num(e.judge.losses)}L` : '';
  return `<tr>
    <td class="num rank">${e.rank}${e.values?.valid === 0 ? ' <span class="badge bad" title="Failed the gate">invalid</span>' : ''}</td>
    <td><a class="entry-title" href="#/u/${encodeURIComponent(e.handle)}">${esc(e.title || 'Untitled entry')}</a>
      <span class="handle">by <a href="#/u/${encodeURIComponent(e.handle)}">@${esc(e.handle)}</a>${e.house ? ' · house' : ''}</span></td>
    <td class="num"><strong>${rate}</strong>${bar}<span class="sub">${interval}${games ? ` · ${games}` : ''}</span></td>
    <td class="num">${bytes(e.values?.bytes)}</td>
    <td class="num">${e.cost ? microUsd(e.cost.micro_usd) : '—'}</td>
    <td class="num">${esc(date(e.received_at))}</td>
  </tr>`;
}

/** A bounty's leaderboard: every entry ranked, paginated, with win rates and intervals. */
export function leaderboardView(lb, page) {
  const entries = lb.entries || [];
  const { html, pager: pg } = paged(entries, page, (e) => leaderboardRow(e, lb.columns));
  return `
    <p class="crumbs"><a href="#/">← All bounties</a> · <a href="#/bounty/${encodeURIComponent(lb.competition.slug)}">${esc(lb.competition.title)}</a></p>
    <div class="page-head">
      <h1>Leaderboard</h1>
      <p class="lede">${esc(lb.competition.title)} · ${esc(lb.phase?.title || '')} phase · ${num(entries.length)} ${entries.length === 1 ? 'entry' : 'entries'} ranked by ${esc(lb.title || 'score')}</p>
    </div>
    ${bountyTabs(lb.competition.slug, 'leaderboard')}
    ${entries.length ? `<div class="table-wrap"><table class="leaderboard">
      <thead><tr><th class="num">#</th><th>Entry</th><th class="num">Win rate</th><th class="num">Size</th><th class="num">Build cost</th><th class="num">Entered</th></tr></thead>
      <tbody>${html}</tbody>
    </table></div>${pg}` : '<p class="empty">No entries yet — this board fills as entries are judged.</p>'}`;
}

/** An account's public profile: avatar, record, links and every entry it made. */
export function profileView(p, page) {
  const r = p.record || {};
  const solutions = p.solutions || [];
  const { html, pager: pg } = paged(
    solutions,
    page,
    (s) => `<li class="solution">
      <a class="entry-title" href="#/bounty/${encodeURIComponent(s.competition.slug)}">${esc(s.title || 'Untitled entry')}</a>
      <span>in <a href="#/bounty/${encodeURIComponent(s.competition.slug)}">${esc(s.competition.title)}</a> · ${esc(date(s.entered_at))}</span>
      <span class="solution-stats">${s.placement ? `<strong>#${s.placement}</strong>` : 'unplaced'}${s.prize_usd ? ` · <strong>${money(s.prize_usd)}</strong> won` : ''}${s.score ? ` · ${esc(s.score.column?.title || 'score')} ${esc(s.score.display ?? s.score.value)}` : ''}</span>
    </li>`,
  );
  const avatar = p.avatar?.url_small || p.avatar?.url || p.image;
  const links = [
    p.github_login ? `<a href="https://github.com/${encodeURIComponent(p.github_login)}" rel="noopener">GitHub: ${esc(p.github_login)}</a>` : '',
    p.x ? `<a href="https://x.com/${encodeURIComponent(p.x)}" rel="noopener">X: @${esc(p.x)}</a>` : '',
    p.discord ? `<span>Discord: ${esc(p.discord)}</span>` : '',
    p.wallet?.address ? `<a href="${esc(p.wallet.explorer_url || `https://solscan.io/account/${p.wallet.address}`)}" rel="noopener">Wallet ${esc(p.wallet.address.slice(0, 8))}…${esc(p.wallet.address.slice(-4))}</a>` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `
    <p class="crumbs"><a href="#/">← All bounties</a></p>
    <div class="profile-head">
      ${avatar ? `<img class="avatar" crossorigin="anonymous" src="https://make.fun${esc(avatar)}" alt="" width="96" height="96">` : '<span class="avatar fallback" aria-hidden="true"></span>'}
      <div>
        <h1>@${esc(p.handle)}</h1>
        ${p.display_name ? `<p class="lede">${esc(p.display_name)}</p>` : ''}
        ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
        <p class="meta">Joined ${esc(date(p.joined_at))}${p.house ? ' · house account' : ''}</p>
        ${links ? `<p class="links">${links}</p>` : ''}
      </div>
    </div>
    <div class="stats">
      ${stat('Entered', num(r.competitions_entered))}
      ${stat('Placed', num(r.competitions_placed))}
      ${stat('Won', num(r.competitions_won))}
      ${stat('Prize money', money(r.prize_usd), r.best_placement ? `best place #${r.best_placement}` : '')}
    </div>
    <section aria-labelledby="solutions-h"><h2 id="solutions-h">Entries <span class="count">${num(solutions.length)}</span></h2>
    ${solutions.length ? `<ul class="entries">${html}</ul>${pg}` : '<p class="empty">No entries yet.</p>'}</section>`;
}

/** A failed load, with a retry button main.js wires up. */
export function errorView(message) {
  return `<div class="error"><h1>Could not load this page</h1><p>${esc(message)}</p><p><button type="button" data-action="retry">Try again</button> or <a href="#/">go back to the board</a>.</p></div>`;
}

/** A loading skeleton, shown while a view fetches. */
export function loadingView() {
  return '<div class="skeleton" aria-label="Loading"><div class="sk-line wide"></div><div class="sk-line"></div><div class="sk-block"></div><div class="sk-block"></div><div class="sk-block"></div></div>';
}
