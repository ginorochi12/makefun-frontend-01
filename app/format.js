// Presentation helpers: every value the views print passes through here, so
// numbers, dates and countdowns look the same on every surface. All of them
// are pure functions of their input and never touch the network.

/** Make text safe to drop into HTML. */
export function escapeHtml(value) {
  const text = String(value ?? '');
  let out = '';
  for (const ch of text) {
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&#39;';
    else out += ch;
  }
  return out;
}

/** A dollar figure ('1250.5', 0.5, null) as '$1,251', '$0.50' or '—'. */
export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const fraction = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fraction,
    maximumFractionDigits: 2,
  });
}

/** An integer with grouping separators ('12345' -> '12,345'). */
export function formatInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString('en-US') : '—';
}

/** An ISO timestamp as a short UTC date, e.g. 'Nov 17, 2026, 12:30 PM UTC'. */
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
}

/** How long until a deadline: '3d 5h left', '42m left', 'closing soon', 'ended'. */
export function formatCountdown(iso) {
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return 'ended';
  const minute = 60000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const days = Math.floor(remaining / day);
  const hours = Math.floor((remaining % day) / hour);
  const minutes = Math.floor((remaining % hour) / minute);
  if (days >= 1) return `${days}d ${hours}h left`;
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  if (minutes >= 1) return `${minutes}m left`;
  return 'closing soon';
}

/** The tone of a deadline pill: 'urgent' under 6h, 'closing' under 2d, else 'live'. */
export function countdownTone(iso) {
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return 'ended';
  if (remaining < 6 * 3600000) return 'urgent';
  if (remaining < 2 * 86400000) return 'closing';
  return 'live';
}

/** A win rate stored in micro units (0..1,000,000) as '87.4%'. */
export function formatRate(micro) {
  const n = Number(micro);
  if (!Number.isFinite(n)) return '—';
  return `${(n / 10000).toFixed(1)}%`;
}

/** A byte count as '812 B', '94 KB' or '2.4 MB'. */
export function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${(v / 1024).toFixed(v < 10240 ? 1 : 0)} KB`;
  return `${(v / 1048576).toFixed(1)} MB`;
}

/** A build cost in micro-USD as '$3.27'. */
export function formatMicroUsd(micro) {
  const n = Number(micro);
  if (!Number.isFinite(n)) return '—';
  return formatMoney(n / 1000000);
}

/** How long ago an ISO timestamp was: 'just now', '5m ago', '3h ago', '2d ago'. */
export function formatAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const elapsed = Date.now() - then;
  if (elapsed < 60000) return 'just now';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h ago`;
  const days = Math.floor(elapsed / 86400000);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/** '1 entry' / '4 entries': the count plus the right singular or plural. */
export function pluralize(count, singular, plural) {
  return `${formatInt(count)} ${Number(count) === 1 ? singular : plural}`;
}
