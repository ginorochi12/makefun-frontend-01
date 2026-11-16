// make.fun's public API: read-only GET requests, open to any origin (CORS).
// The full API is described at https://make.fun/api/openapi.json.
//
// Every answer is cached twice: in memory for the session, and in sessionStorage
// so going back to a view is instant. A cached answer older than TTL_MS is
// revalidated with If-None-Match (the API's ETags are bound to the minute, so a
// 304 means the data is still good). Identical requests in flight share one
// fetch, so a view never asks for the same thing twice.

const API = 'https://make.fun/api';
const TTL_MS = 60000;

const mem = new Map(); // path -> { at, etag, data }
const inflight = new Map(); // path -> Promise

function readStore(path) {
  try {
    const raw = sessionStorage.getItem(`mf:${path}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStore(path, entry) {
  try {
    sessionStorage.setItem(`mf:${path}`, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable: the memory cache still works.
  }
}

/** GET one API path, cached and de-duplicated. Throws on a non-2xx answer. */
export async function get(path) {
  const now = Date.now();
  const hit = mem.get(path);
  if (hit && now - hit.at < TTL_MS) return hit.data;
  const pending = inflight.get(path);
  if (pending) return pending;
  const run = (async () => {
    const cached = hit || readStore(path);
    const headers = {};
    if (cached && cached.etag) headers['If-None-Match'] = cached.etag;
    const res = await fetch(API + path, { headers });
    if (res.status === 304 && cached) {
      const entry = { at: now, etag: cached.etag, data: cached.data };
      mem.set(path, entry);
      writeStore(path, entry);
      return cached.data;
    }
    if (!res.ok) throw new Error(`make.fun API answered ${res.status} for ${path}`);
    const data = await res.json();
    const entry = { at: now, etag: res.headers.get('etag'), data };
    mem.set(path, entry);
    writeStore(path, entry);
    return data;
  })();
  inflight.set(path, run);
  try {
    return await run;
  } finally {
    inflight.delete(path);
  }
}

/** The open bounties: { items: [...] } (activity=times leaves out the activity a board does not show). */
export const getBounties = () => get('/competitions?status=open&activity=times');

/** One bounty, by its slug. */
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);

/** One bounty's leaderboard, by its slug. */
export const getLeaderboard = (slug) => get(`/competitions/${encodeURIComponent(slug)}/leaderboard`);

/** One account's public profile, by its handle. */
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);
