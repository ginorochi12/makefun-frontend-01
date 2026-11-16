// A small client for make.fun's public API (read-only GET, open to any origin;
// the full surface is described at https://make.fun/api/openapi.json).
//
// Answers are cached in two layers: a memory map for the session, and
// sessionStorage so a view revisited later still renders instantly. Entries
// older than the TTL are revalidated with If-None-Match — the API's ETags are
// bound to the minute, so a 304 answer means the stored data is still fresh.
// Identical requests in flight share one fetch, and `prefetch` warms the cache
// for pages the reader is about to open (hovering a bounty card).

const BASE = 'https://make.fun/api';
const FRESH_MS = 60000;

class ApiClient {
  constructor() {
    this.memory = new Map(); // path -> { at, etag, data }
    this.pending = new Map(); // path -> Promise
  }

  loadStored(path) {
    try {
      const raw = sessionStorage.getItem(`makefun:${path}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  saveStored(path, entry) {
    try {
      sessionStorage.setItem(`makefun:${path}`, JSON.stringify(entry));
    } catch {
      // Quota full or storage blocked: the memory cache still serves.
    }
  }

  remember(path, entry) {
    this.memory.set(path, entry);
    this.saveStored(path, entry);
  }

  /** GET one path, cached and de-duplicated. Rejects on a non-2xx answer. */
  async request(path) {
    const now = Date.now();
    const fresh = this.memory.get(path);
    if (fresh && now - fresh.at < FRESH_MS) return fresh.data;
    const shared = this.pending.get(path);
    if (shared) return shared;
    const job = this.fetchFresh(path, fresh || this.loadStored(path), now);
    this.pending.set(path, job);
    try {
      return await job;
    } finally {
      this.pending.delete(path);
    }
  }

  async fetchFresh(path, cached, now) {
    const headers = {};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    const response = await fetch(BASE + path, { headers });
    if (response.status === 304 && cached) {
      const entry = { at: now, etag: cached.etag, data: cached.data };
      this.remember(path, entry);
      return cached.data;
    }
    if (!response.ok) {
      throw new Error(`make.fun API answered ${response.status} for ${path}`);
    }
    const data = await response.json();
    this.remember(path, { at: now, etag: response.headers.get('etag'), data });
    return data;
  }

  /** Warm the cache for a path without waiting for it. Failures are silent:
   *  the real navigation will fetch it again. */
  prefetch(path) {
    const fresh = this.memory.get(path);
    if ((fresh && Date.now() - fresh.at < FRESH_MS) || this.pending.has(path)) return;
    this.request(path).catch(() => {});
  }

  /** The bounties still listed as open. `activity=times` drops the per-entry
   *  activity a board never shows, keeping the answer small. */
  bounties() {
    return this.request('/competitions?status=open&activity=times');
  }

  /** One bounty in full, by slug. */
  bounty(slug) {
    return this.request(`/competitions/${encodeURIComponent(slug)}`);
  }

  /** One bounty's leaderboard, by slug. */
  leaderboard(slug) {
    return this.request(`/competitions/${encodeURIComponent(slug)}/leaderboard`);
  }

  /** One account's public profile, by handle. */
  profile(handle) {
    return this.request(`/profiles/${encodeURIComponent(handle)}`);
  }
}

export const api = new ApiClient();
