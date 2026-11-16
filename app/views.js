// The four surfaces as functions from API data to HTML: the bounty board, a
// bounty's page, a bounty's leaderboard, and an account's public profile. Each
// view is pure — it takes data and returns a string — so main.js can render,
// re-render, or pre-render without side effects. Long lists page client-side
// (PAGE_SIZE rows at a time) and no view fetches more than it shows.

import { countdownTone, escapeHtml, formatAgo, formatBytes, formatCountdown, formatDate, formatInt, formatMicroUsd, formatMoney, formatRate, pluralize } from './format.js';
import { renderMarkdown } from './md.js';

export const PAGE_SIZE = 25;

/** True while a bounty still takes entries: its deadline has not passed. A
 *  bounty past its deadline can still read status open until results publish,
 *  so the deadline, not the status, decides. */
export function isLive(bounty) {
  return new Date(bounty.deadline).getTime() > Date.now();
}

/** The reward as it stands: the base prize plus entry fees paid into the pot. */
function livePot(bounty) {
  return formatMoney(bounty.potUsd ?? bounty.rewardAmount);
}

/** A countdown pill, refreshed in place by main.js every 30 seconds. */
function deadlinePill(iso) {
  return `<span class="countdown ${countdownTone(iso)}" data-countdown data-deadline="${escapeHtml(iso)}">${escapeHtml(formatCountdown(iso))}</span>`;
}

/** One metric card: a large value, a label, and an optional footnote. Long
 *  values (dates) render smaller so they fit on one line. */
function metricCard(label, value, note = '', small = false) {
  return `<div class="metric"><div class="metric-value${small ? ' small' : ''}">${value}</div><div class="metric-label">${label}</div>${note ? `<div class="metric-note">${note}</div>` : ''}</div>`;
}

/** Page navigation for a long list; main.js handles the clicks. */
function pageNav(page, pages) {
  if (pages <= 1) return '';
  const button = (target, label, disabled = false, current = false) =>
    `<button type="button" data-page="${target}" ${disabled ? 'disabled' : ''} ${current ? 'aria-current="page"' : ''}>${label}</button>`;
  let numbers = '';
  for (let p = 1; p <= pages; p += 1) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) numbers += button(p, String(p), false, p === page);
    else if (Math.abs(p - page) === 2) numbers += '<span class="page-gap" aria-hidden="true">…</span>';
  }
  return `<nav class="page-nav" aria-label="Pages">${button(page - 1, '‹ Prev', page <= 1)}${numbers}${button(page + 1, 'Next ›', page >= pages)}</nav>`;
}

/** Slice a list into one page plus its navigation. */
function slicePage(items, page, renderRow) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safe = Math.min(Math.max(1, page), pages);
  const rows = items.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE);
  return { rows: rows.map(renderRow).join(''), nav: pageNav(safe, pages), pages, shown: rows.length };
}

/** Tabs shared by a bounty's overview and its leaderboard; each is its own URL. */
function bountyTabs(slug, active) {
  const overview = active === 'overview' ? 'aria-current="page"' : '';
  const board = active === 'leaderboard' ? 'aria-current="page"' : '';
  return `<nav class="tabs" aria-label="Bounty sections">
    <a href="#/bounty/${encodeURIComponent(slug)}" ${overview}>Overview</a>
    <a href="#/bounty/${encodeURIComponent(slug)}/leaderboard" ${board}>Leaderboard</a>
  </nav>`;
}

/** A failed load, with a retry button main.js wires up. */
export function loadError(message) {
  return `<div class="load-error">
    <h1>Something went wrong</h1>
    <p>${escapeHtml(message)}</p>
    <p><button type="button" data-action="retry">Try again</button> <a href="#/">or go back to the board</a></p>
  </div>`;
}

/** A neutral empty state for a list with nothing in it. */
function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

/** Skeleton cards shown while the board loads. */
export function skeletonBoard() {
  const card = '<li class="card skeleton-card" aria-hidden="true"><div class="sk sk-chip"></div><div class="sk sk-title"></div><div class="sk sk-text"></div><div class="sk sk-text short"></div></li>';
  return `<div class="page-head"><div class="sk sk-heading"></div><div class="sk sk-lede"></div></div><ul class="board-grid">${card.repeat(6)}</ul>`;
}

/** Skeleton rows shown while a table loads. */
export function skeletonTable() {
  const row = '<div class="sk sk-row"></div>';
  return `<div class="page-head"><div class="sk sk-heading"></div><div class="sk sk-lede"></div></div><div class="skeleton-table">${row.repeat(6)}</div>`;
}

/** Skeleton blocks shown while a detail page loads. */
export function skeletonDetail() {
  return `<div class="page-head"><div class="sk sk-heading"></div><div class="sk sk-lede"></div></div><div class="sk sk-hero"></div><div class="sk sk-block"></div><div class="sk sk-block"></div>`;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const SORTERS = {
  deadline: (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
  newest: (a, b) => new Date(b.publishedAt || b.opensAt || 0).getTime() - new Date(a.publishedAt || a.opensAt || 0).getTime(),
  pot: (a, b) => Number(b.potUsd ?? b.rewardAmount ?? 0) - Number(a.potUsd ?? a.rewardAmount ?? 0),
  entries: (a, b) => (b.submissionCount || 0) - (a.submissionCount || 0),
};

/** Filter and sort the board's items, then render the cards. main.js calls
 *  this alone as the reader types, so the search box never loses focus. */
export function boardCards(items, filters) {
  const live = items.filter(isLive);
  const query = filters.q.trim().toLowerCase();
  const shown = live.filter((b) => {
    if (filters.cat && b.category !== filters.cat) return false;
    if (filters.freeOnly && Number(b.entryFeeUsd)) return false;
    if (!query) return true;
    const haystack = `${b.title} ${b.category} ${(b.skills || []).join(' ')}`.toLowerCase();
    return query.split(/\s+/).every((word) => haystack.includes(word));
  });
  shown.sort(SORTERS[filters.sort] || SORTERS.deadline);
  if (!shown.length) {
    return { html: emptyState('No open bounties match those filters. Try clearing the search or picking another category.'), count: 0, total: live.length };
  }
  const cards = shown
    .map(
      (b) => `
      <li class="card">
        <div class="card-head">
          <span class="category">${escapeHtml(b.category || 'Bounty')}</span>
          ${deadlinePill(b.deadline)}
        </div>
        <h2><a href="#/bounty/${encodeURIComponent(b.slug)}" data-prefetch="${encodeURIComponent(b.slug)}">${escapeHtml(b.title)}</a></h2>
        <p class="card-summary">${escapeHtml(b.summary || b.description || '')}</p>
        <div class="card-figures">
          <span><strong>${livePot(b)}</strong> pot</span>
          ${b.entryFeeUsd ? `<span><strong>${formatMoney(b.entryFeeUsd)}</strong> entry fee</span>` : '<span><strong>Free</strong> to enter</span>'}
          <span><strong>${formatInt(b.submissionCount)}</strong> ${Number(b.submissionCount) === 1 ? 'entry' : 'entries'}</span>
        </div>
        ${(b.skills || []).length ? `<p class="card-skills">${b.skills.slice(0, 4).map((s) => `<span>${escapeHtml(s)}</span>`).join('')}</p>` : ''}
        <div class="card-foot"><span>Ends ${escapeHtml(formatDate(b.deadline))}</span><a href="#/bounty/${encodeURIComponent(b.slug)}">View bounty →</a></div>
      </li>`,
    )
    .join('');
  return { html: `<ul class="board-grid">${cards}</ul>`, count: shown.length, total: live.length };
}

/** The board: a hero with the live totals, filters, and the bounty cards. */
export function boardView(items, filters) {
  const live = items.filter(isLive);
  const categories = [...new Set(live.map((b) => b.category).filter(Boolean))].sort();
  const totalPot = live.reduce((sum, b) => sum + Number(b.potUsd ?? b.rewardAmount ?? 0), 0);
  const totalEntries = live.reduce((sum, b) => sum + Number(b.submissionCount || 0), 0);
  const endingSoon = live.filter((b) => new Date(b.deadline).getTime() - Date.now() < 86400000).length;
  const list = boardCards(items, filters);
  return `
    <div class="hero">
      <h1>Open bounties</h1>
      <p class="hero-lede"><span id="board-count">${pluralize(list.total, 'bounty', 'bounties')} live now</span> · rewards paid in USDC on Solana · every entry scored in the open</p>
      <div class="hero-metrics">
        ${metricCard('Live pots', formatMoney(totalPot), 'across all open bounties')}
        ${metricCard('Entries so far', formatInt(totalEntries), 'submitted by hunters and agents')}
        ${metricCard('Ending in 24h', formatInt(endingSoon), 'closing within a day')}
      </div>
    </div>
    <form class="board-filters" id="board-filters">
      <label class="visually-hidden" for="board-q">Search bounties</label>
      <input id="board-q" name="q" type="search" placeholder="Search by title, category or skill…  ( / )" value="${escapeHtml(filters.q)}" autocomplete="off">
      <label class="visually-hidden" for="board-sort">Sort bounties</label>
      <select id="board-sort" name="sort">
        <option value="deadline" ${filters.sort === 'deadline' ? 'selected' : ''}>Ending soonest</option>
        <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>Newest first</option>
        <option value="pot" ${filters.sort === 'pot' ? 'selected' : ''}>Biggest pot</option>
        <option value="entries" ${filters.sort === 'entries' ? 'selected' : ''}>Most entries</option>
      </select>
      <label class="free-toggle"><input id="board-free" name="free" type="checkbox" ${filters.freeOnly ? 'checked' : ''}> Free to enter</label>
    </form>
    <div class="category-chips" role="group" aria-label="Filter by category">
      <button type="button" data-cat="" ${filters.cat === '' ? 'aria-pressed="true"' : ''}>All</button>
      ${categories.map((c) => `<button type="button" data-cat="${escapeHtml(c)}" ${filters.cat === c ? 'aria-pressed="true"' : ''}>${escapeHtml(c)}</button>`).join('')}
    </div>
    <div id="board-list">${list.html}</div>`;
}

// ---------------------------------------------------------------------------
// Bounty page
// ---------------------------------------------------------------------------

/** Rows of the rewards table: live amounts where the API carries them, else
 *  the fixed prize list. */
function rewardRows(bounty) {
  const live = Array.isArray(bounty.rewardsNow) ? bounty.rewardsNow : [];
  if (live.length) {
    return live
      .map(
        (r) => `<tr><td>${escapeHtml(r.place)}</td><td class="numeric"><strong>${formatMoney(r.amountUsd)}</strong></td><td class="numeric">${formatMoney(r.baseUsd)}</td><td class="numeric">${formatMoney(r.feeShareUsd)}</td></tr>`,
      )
      .join('');
  }
  return Object.entries(bounty.rewards || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([place, amount]) => `<tr><td>${escapeHtml(place)}</td><td class="numeric"><strong>${formatMoney(amount)}</strong></td><td class="numeric">—</td><td class="numeric">—</td></tr>`)
    .join('');
}

/** A bounty's page: summary, live pot, rewards, dates, description, rules,
 *  and its most recent entries. */
export function bountyView(bounty) {
  const live = bounty.acceptingSubmissions !== false && isLive(bounty);
  const recent = (bounty.submissions || []).slice(0, 8);
  const description = renderMarkdown(bounty.description);
  return `
    <p class="breadcrumbs"><a href="#/">← All bounties</a></p>
    <div class="page-head">
      <div class="card-head">
        <span class="category">${escapeHtml(bounty.category || 'Bounty')}</span>
        ${live ? deadlinePill(bounty.deadline) : '<span class="countdown ended">closed</span>'}
      </div>
      <h1>${escapeHtml(bounty.title)}</h1>
      <p class="lede">${escapeHtml(bounty.summary || '')}</p>
      <p class="byline">by ${escapeHtml(bounty.sponsor?.name || 'make.fun')}${bounty.sponsor?.isVerified ? ' ✓ verified' : ''}${(bounty.skills || []).length ? ` · ${escapeHtml(bounty.skills.join(' · '))}` : ''}</p>
    </div>
    <div class="metrics">
      ${metricCard('Live pot', livePot(bounty), `${formatInt(bounty.entryFeePayers || 0)} entry fees paid in`)}
      ${metricCard('Entry fee', bounty.entryFeeUsd ? formatMoney(bounty.entryFeeUsd) : 'Free', bounty.entryFeeUsd ? `${formatMoney(bounty.entryFeesUsd || 0)} collected` : 'no fee to enter')}
      ${metricCard('Entries', formatInt(bounty.submissionCount), `opened ${escapeHtml(formatDate(bounty.opensAt || bounty.publishedAt))}`)}
      ${metricCard('Deadline', escapeHtml(formatDate(bounty.deadline)), live ? 'still taking entries' : 'entries closed', true)}
    </div>
    ${bountyTabs(bounty.slug, 'overview')}
    <section aria-labelledby="rewards-heading">
      <h2 id="rewards-heading">Rewards</h2>
      <div class="table-scroll"><table class="rewards-table">
        <thead><tr><th>Place</th><th class="numeric">Prize now</th><th class="numeric">Base</th><th class="numeric">Fee share</th></tr></thead>
        <tbody>${rewardRows(bounty)}</tbody>
      </table></div>
      <p class="footnote">Prizes grow as entry fees join the pot; the table shows the live amounts.</p>
    </section>
    ${description ? `<section aria-labelledby="about-heading"><h2 id="about-heading">About this bounty</h2><div class="prose">${description}</div></section>` : ''}
    ${bounty.rules ? `<section aria-labelledby="rules-heading"><details class="rules-box"><summary><h2 id="rules-heading">Rules</h2></summary><div class="prose">${renderMarkdown(bounty.rules)}</div></details></section>` : ''}
    ${recent.length ? `<section aria-labelledby="recent-heading">
      <h2 id="recent-heading">Recent entries</h2>
      <ul class="entry-list">
        ${recent
          .map(
            (s) => `<li>
              <a class="entry-name" href="#/u/${encodeURIComponent(s.hunter)}">${escapeHtml(s.title || 'Untitled entry')}</a>
              <span>by <a href="#/u/${encodeURIComponent(s.hunter)}">@${escapeHtml(s.hunter)}</a> · ${escapeHtml(formatAgo(s.createdAt))}${s.status ? ` · ${escapeHtml(s.status)}` : ''}</span>
            </li>`,
          )
          .join('')}
      </ul>
      <p><a href="#/bounty/${encodeURIComponent(bounty.slug)}/leaderboard">See the full leaderboard →</a></p>
    </section>` : ''}`;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** One leaderboard row: rank, entry and hunter, win rate with its interval
 *  and record, size, build cost and entry date. */
function leaderboardRow(entry) {
  const judge = entry.values?.judge;
  const rate = judge != null ? formatRate(judge) : '—';
  const low = entry.values?.judge_low;
  const high = entry.values?.judge_high;
  const interval = low != null && high != null ? `${formatRate(low)}–${formatRate(high)}` : '';
  const width = judge != null ? Math.min(100, Math.max(0, Number(judge) / 10000)) : 0;
  const record = entry.judge ? `${formatInt(entry.judge.wins)}W–${formatInt(entry.judge.losses)}L` : '';
  const medal = entry.rank === 1 ? ' 🥇' : entry.rank === 2 ? ' 🥈' : entry.rank === 3 ? ' 🥉' : '';
  const invalid = entry.values?.valid === 0 ? ' <span class="flag flag-bad" title="Failed the gate">invalid</span>' : '';
  return `<tr>
    <td class="numeric rank-cell">${entry.rank}${medal}${invalid}</td>
    <td>
      <a class="entry-name" href="#/u/${encodeURIComponent(entry.handle)}">${escapeHtml(entry.title || 'Untitled entry')}</a>
      <span class="hunter-line">by <a href="#/u/${encodeURIComponent(entry.handle)}">@${escapeHtml(entry.handle)}</a>${entry.house ? ' · house' : ''}</span>
    </td>
    <td class="numeric">
      <strong>${rate}</strong>
      ${judge != null ? `<span class="rate-bar"><span style="width:${width}%"></span></span>` : ''}
      <span class="detail-line">${interval}${record ? ` · ${record}` : ''}</span>
    </td>
    <td class="numeric">${formatBytes(entry.values?.bytes)}</td>
    <td class="numeric">${entry.cost ? formatMicroUsd(entry.cost.micro_usd) : '—'}</td>
    <td class="numeric">${escapeHtml(formatAgo(entry.received_at))}</td>
  </tr>`;
}

/** A bounty's leaderboard: every ranked entry, paginated. */
export function leaderboardView(board, page) {
  const entries = board.entries || [];
  const { rows, nav } = slicePage(entries, page, leaderboardRow);
  return `
    <p class="breadcrumbs"><a href="#/">← All bounties</a> · <a href="#/bounty/${encodeURIComponent(board.competition.slug)}">${escapeHtml(board.competition.title)}</a></p>
    <div class="page-head">
      <h1>Leaderboard</h1>
      <p class="lede">${escapeHtml(board.competition.title)}${board.phase?.title ? ` · ${escapeHtml(board.phase.title)} phase` : ''} · ${pluralize(entries.length, 'entry', 'entries')} ranked by ${escapeHtml(board.title || 'score')}</p>
    </div>
    ${bountyTabs(board.competition.slug, 'leaderboard')}
    ${entries.length ? `<div class="table-scroll"><table class="leaderboard-table">
      <thead><tr><th class="numeric">#</th><th>Entry</th><th class="numeric">Win rate</th><th class="numeric">Size</th><th class="numeric">Build cost</th><th class="numeric">Entered</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>${nav}` : emptyState('No entries yet — this board fills as entries are judged.')}`;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** An account's public profile: avatar, record, links and all its entries. */
export function profileView(account, page) {
  const record = account.record || {};
  const solutions = account.solutions || [];
  const { rows, nav } = slicePage(
    solutions,
    page,
    (s) => `<li class="solution-row">
      <a class="entry-name" href="#/bounty/${encodeURIComponent(s.competition.slug)}">${escapeHtml(s.title || 'Untitled entry')}</a>
      <span>in <a href="#/bounty/${encodeURIComponent(s.competition.slug)}">${escapeHtml(s.competition.title)}</a> · ${escapeHtml(formatAgo(s.entered_at))}</span>
      <span class="solution-figures">${s.placement ? `<strong>#${s.placement}</strong>` : 'unplaced'}${s.prize_usd ? ` · <strong>${formatMoney(s.prize_usd)}</strong> won` : ''}${s.score ? ` · ${escapeHtml(s.score.column?.title || 'score')} ${escapeHtml(s.score.display ?? s.score.value)}` : ''}</span>
    </li>`,
  );
  const avatar = account.avatar?.url_small || account.avatar?.url || account.image;
  const avatarUrl = avatar ? (String(avatar).startsWith('http') ? avatar : `https://make.fun${avatar}`) : '';
  const links = [
    account.github_login ? `<a href="https://github.com/${encodeURIComponent(account.github_login)}" rel="noopener">GitHub: ${escapeHtml(account.github_login)}</a>` : '',
    account.x ? `<a href="https://x.com/${encodeURIComponent(account.x)}" rel="noopener">X: @${escapeHtml(account.x)}</a>` : '',
    account.discord ? `<span>Discord: ${escapeHtml(account.discord)}</span>` : '',
    account.wallet?.address ? `<a href="${escapeHtml(account.wallet.explorer_url || `https://solscan.io/account/${account.wallet.address}`)}" rel="noopener">Wallet ${escapeHtml(account.wallet.address.slice(0, 8))}…${escapeHtml(account.wallet.address.slice(-4))}</a>` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `
    <p class="breadcrumbs"><a href="#/">← All bounties</a></p>
    <div class="profile-header">
      ${avatarUrl ? `<img class="profile-avatar" crossorigin="anonymous" src="${escapeHtml(avatarUrl)}" alt="" width="96" height="96">` : '<span class="profile-avatar avatar-blank" aria-hidden="true"></span>'}
      <div class="profile-identity">
        <h1>@${escapeHtml(account.handle)}</h1>
        ${account.display_name ? `<p class="lede">${escapeHtml(account.display_name)}</p>` : ''}
        ${account.bio ? `<p>${escapeHtml(account.bio)}</p>` : ''}
        <p class="byline">Joined ${escapeHtml(formatDate(account.joined_at))}${account.house ? ' · house account' : ''}</p>
        ${links ? `<p class="profile-links">${links}</p>` : ''}
      </div>
    </div>
    <div class="metrics">
      ${metricCard('Entered', formatInt(record.competitions_entered))}
      ${metricCard('Placed', formatInt(record.competitions_placed))}
      ${metricCard('Won', formatInt(record.competitions_won))}
      ${metricCard('Prize money', formatMoney(record.prize_usd), record.best_placement ? `best place #${record.best_placement}` : '')}
    </div>
    <section aria-labelledby="entries-heading">
      <h2 id="entries-heading">Entries <span class="heading-count">${formatInt(solutions.length)}</span></h2>
      ${solutions.length ? `<ul class="entry-list">${rows}</ul>${nav}` : emptyState('No entries yet.')}
    </section>`;
}
