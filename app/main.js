// A make.fun frontend: the board of open bounties, a page and a leaderboard for
// each bounty, and an account's public profile — on hash routes, reading only
// make.fun's public API (see api.js).
//
//   #/                          the board
//   #/bounty/<slug>             one bounty
//   #/bounty/<slug>/leaderboard that bounty's leaderboard
//   #/u/<handle>                an account's public profile
//
// window.__shotReady is false while a page loads and true once its data is on
// screen (or its error is), so a screenshot script knows when to capture.
// Countdown pills tick in place every 30 s without a refetch; the board's
// filter re-renders only the list, never the search box.

import { getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import { timeLeft, urgency } from './format.js';
import { boardList, boardView, bountyView, errorView, leaderboardView, loadingView, profileView } from './views.js';

const app = document.getElementById('app');

const boardState = { q: '', sort: 'deadline', cat: '' };
let boardItems = null; // the board's items, held so filtering needs no refetch
let page = 1; // the current list page (leaderboard, profile); reset on route change
let renderToken = 0; // only the latest render may write to the page

/** The route the current hash names. */
function route() {
  const hash = location.hash || '#/';
  let match = hash.match(/^#\/bounty\/([^/]+)\/leaderboard\/?$/);
  if (match) return { name: 'leaderboard', slug: decodeURIComponent(match[1]) };
  match = hash.match(/^#\/bounty\/([^/]+)\/?$/);
  if (match) return { name: 'bounty', slug: decodeURIComponent(match[1]) };
  match = hash.match(/^#\/u\/([^/]+)\/?$/);
  if (match) return { name: 'profile', handle: decodeURIComponent(match[1]) };
  return { name: 'board' };
}

/** Re-render only the board's list (and its count) from the held items. */
function refreshBoardList() {
  if (!boardItems) return;
  const list = boardList(boardItems, boardState);
  const holder = document.getElementById('board-list');
  if (holder) holder.innerHTML = list.html;
  const count = document.getElementById('board-count');
  if (count) count.textContent = boardState.q || boardState.cat ? `${list.count} of ${list.total} live now` : `${list.total} live now`;
  tickCountdowns();
}

/** Update every countdown pill in place, without touching the rest of the page. */
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const iso = el.getAttribute('data-deadline');
    el.textContent = timeLeft(iso);
    el.className = `pill ${urgency(iso)}`;
  });
}

/** Render the current route. A stale render (a slow fetch overtaken by a newer
 *  route) writes nothing. Pager clicks keep the scroll position. */
async function render({ scroll = true } = {}) {
  const token = ++renderToken;
  const r = route();
  window.__shotReady = false;
  app.innerHTML = loadingView();
  try {
    let html;
    if (r.name === 'board') {
      const data = await getBounties();
      boardItems = data.items || [];
      document.title = 'make.fun bounties';
      html = boardView(boardItems, boardState);
    } else if (r.name === 'bounty') {
      const b = await getBounty(r.slug);
      document.title = `${b.title} | make.fun bounties`;
      html = bountyView(b);
    } else if (r.name === 'leaderboard') {
      const lb = await getLeaderboard(r.slug);
      document.title = `Leaderboard: ${lb.competition.title} | make.fun bounties`;
      html = leaderboardView(lb, page);
    } else {
      const p = await getProfile(r.handle);
      document.title = `@${p.handle} | make.fun bounties`;
      html = profileView(p, page);
    }
    if (token !== renderToken) return; // a newer render took over
    app.innerHTML = html;
    if (r.name === 'board') wireBoardFilters();
    if (scroll) window.scrollTo(0, 0);
  } catch (err) {
    if (token !== renderToken) return;
    document.title = 'make.fun bounties';
    app.innerHTML = errorView(err instanceof Error ? err.message : 'Something went wrong loading this page.');
  } finally {
    if (token === renderToken) window.__shotReady = true;
  }
}

/** The board's filter controls: typing re-renders only the list. */
function wireBoardFilters() {
  const q = document.getElementById('board-q');
  const cat = document.getElementById('board-cat');
  const sort = document.getElementById('board-sort');
  const form = document.getElementById('board-filters');
  if (form) form.addEventListener('submit', (event) => event.preventDefault());
  if (q) q.addEventListener('input', () => { boardState.q = q.value; refreshBoardList(); });
  if (cat) cat.addEventListener('change', () => { boardState.cat = cat.value; refreshBoardList(); });
  if (sort) sort.addEventListener('change', () => { boardState.sort = sort.value; refreshBoardList(); });
}

/** One delegated click handler for pagination and retry buttons. */
app.addEventListener('click', (event) => {
  const pageBtn = event.target.closest('[data-page]');
  if (pageBtn) {
    page = Number(pageBtn.getAttribute('data-page'));
    render({ scroll: false });
    return;
  }
  if (event.target.closest('[data-action="retry"]')) render();
});

window.addEventListener('hashchange', () => {
  page = 1;
  render();
});

setInterval(tickCountdowns, 30000);

render();
