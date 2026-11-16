// The app shell: hash routing, rendering, the board's filters, the theme
// toggle, and the countdown ticker. The four surfaces live in views.js; this
// file only decides which one to show and keeps it fresh.
//
//   #/                              the board
//   #/bounty/<slug>                 one bounty
//   #/bounty/<slug>/leaderboard     that bounty's leaderboard
//   #/u/<handle>                    an account's public profile
//
// window.__shotReady is false while a route loads and true once its data (or
// its error) is on screen, so a screenshot script knows when to capture.
// Countdown pills tick in place every 30 s without a refetch, and typing in
// the board's search re-renders only the card list, never the search box.

import { api } from './api.js';
import { countdownTone, formatCountdown } from './format.js';
import { boardCards, boardView, bountyView, leaderboardView, loadError, profileView, skeletonBoard, skeletonDetail, skeletonTable } from './views.js';

const root = document.getElementById('app');
const THEME_KEY = 'mf-theme';

const filters = { q: '', sort: 'deadline', cat: '', freeOnly: false };
let boardItems = null; // the board's items, held so filtering needs no refetch
let listPage = 1; // the current list page (leaderboard, profile); reset per route
let renderId = 0; // only the newest render may write to the page

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const ROUTES = [
  {
    name: 'leaderboard',
    match: /^#\/bounty\/([^/]+)\/leaderboard\/?$/,
    params: (m) => ({ slug: decodeURIComponent(m[1]) }),
    skeleton: skeletonTable,
    load: ({ slug }) => api.leaderboard(slug),
    title: (data) => `Leaderboard: ${data.competition.title} | make.fun bounties`,
    view: (data) => leaderboardView(data, listPage),
  },
  {
    name: 'bounty',
    match: /^#\/bounty\/([^/]+)\/?$/,
    params: (m) => ({ slug: decodeURIComponent(m[1]) }),
    skeleton: skeletonDetail,
    load: ({ slug }) => api.bounty(slug),
    title: (data) => `${data.title} | make.fun bounties`,
    view: (data) => bountyView(data),
  },
  {
    name: 'profile',
    match: /^#\/u\/([^/]+)\/?$/,
    params: (m) => ({ handle: decodeURIComponent(m[1]) }),
    skeleton: skeletonDetail,
    load: ({ handle }) => api.profile(handle),
    title: (data) => `@${data.handle} | make.fun bounties`,
    view: (data) => profileView(data, listPage),
  },
  {
    name: 'board',
    match: /^#\/?.*$/,
    params: () => ({}),
    skeleton: skeletonBoard,
    load: () => api.bounties(),
    title: () => 'make.fun bounties — open board',
    view: (data) => {
      boardItems = data.items || [];
      return boardView(boardItems, filters);
    },
  },
];

/** The route the current hash names, with its parameters. */
function currentRoute() {
  const hash = location.hash || '#/';
  for (const route of ROUTES) {
    const m = hash.match(route.match);
    if (m) return { route, params: route.params(m) };
  }
  return { route: ROUTES[ROUTES.length - 1], params: {} };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Re-render only the board's card list (and its count) from the held items. */
function refreshBoardCards() {
  if (!boardItems) return;
  const list = boardCards(boardItems, filters);
  const holder = document.getElementById('board-list');
  if (holder) holder.innerHTML = list.html;
  const count = document.getElementById('board-count');
  if (count) {
    const filtered = filters.q || filters.cat || filters.freeOnly;
    count.textContent = filtered ? `${list.count} of ${list.total} live now` : `${list.total} live now`;
  }
  tickCountdowns();
}

/** Update every countdown pill in place, without touching the rest. */
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const iso = el.getAttribute('data-deadline');
    el.textContent = formatCountdown(iso);
    el.className = `countdown ${countdownTone(iso)}`;
  });
}

/** Render the current route. A stale render — a slow fetch overtaken by a
 *  newer route — writes nothing. Pager clicks keep the scroll position. */
async function render({ scroll = true } = {}) {
  const token = ++renderId;
  const { route, params } = currentRoute();
  window.__shotReady = false;
  root.innerHTML = route.skeleton();
  try {
    const data = await route.load(params);
    if (token !== renderId) return;
    document.title = route.title(data);
    root.innerHTML = route.view(data);
    if (route.name === 'board') wireBoard();
    if (scroll) window.scrollTo(0, 0);
  } catch (err) {
    if (token !== renderId) return;
    document.title = 'make.fun bounties';
    root.innerHTML = loadError(err instanceof Error ? err.message : 'Something went wrong loading this page.');
  } finally {
    if (token === renderId) window.__shotReady = true;
  }
}

// ---------------------------------------------------------------------------
// Board filters
// ---------------------------------------------------------------------------

/** Wire the board's controls after a board render. Typing re-renders only the
 *  list; category chips and the free-only toggle do the same. */
function wireBoard() {
  const form = document.getElementById('board-filters');
  const search = document.getElementById('board-q');
  const sort = document.getElementById('board-sort');
  const free = document.getElementById('board-free');
  if (form) form.addEventListener('submit', (event) => event.preventDefault());
  if (search) search.addEventListener('input', () => { filters.q = search.value; refreshBoardCards(); });
  if (sort) sort.addEventListener('change', () => { filters.sort = sort.value; refreshBoardCards(); });
  if (free) free.addEventListener('change', () => { filters.freeOnly = free.checked; refreshBoardCards(); });
  document.querySelectorAll('[data-cat]').forEach((chip) => {
    chip.addEventListener('click', () => {
      filters.cat = chip.getAttribute('data-cat') || '';
      document.querySelectorAll('[data-cat]').forEach((other) => {
        other.setAttribute('aria-pressed', other === chip ? 'true' : 'false');
      });
      refreshBoardCards();
    });
  });
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Apply the saved theme (or the system one) and wire the header toggle. The
 *  inline script in index.html already set it before first paint; this keeps
 *  the button in sync and persists changes. */
function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  const apply = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  };
  toggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the theme still changes for this visit.
    }
    apply(next);
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** One delegated click handler for pagination, retry, and prefetch targets. */
root.addEventListener('click', (event) => {
  const pager = event.target.closest('[data-page]');
  if (pager) {
    listPage = Number(pager.getAttribute('data-page'));
    render({ scroll: false });
    return;
  }
  if (event.target.closest('[data-action="retry"]')) render();
});

/** Hovering a bounty card warms its page in the cache, so opening it feels instant. */
root.addEventListener('mouseover', (event) => {
  const link = event.target.closest('[data-prefetch]');
  if (link) api.prefetch(`/competitions/${link.getAttribute('data-prefetch')}`);
});

/** '/' focuses the board's search from anywhere on the page. */
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  const search = document.getElementById('board-q');
  if (search) {
    event.preventDefault();
    search.focus();
  }
});

window.addEventListener('hashchange', () => {
  listPage = 1;
  render();
});

setInterval(tickCountdowns, 30000);

initTheme();
render();
