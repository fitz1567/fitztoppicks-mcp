// The free allowance for callers without a key: ANON_DAILY_LIMIT tool calls a day (UTC) per network, plus a short
// burst limit. Per network means the CF-Connecting-IP address, IPv6 by its /64 (rateKey).
//   - Burst: the Workers Rate Limiting binding ANON_LIMIT (10 calls a minute), approximate and per Cloudflare location.
//   - Daily: one row per network and day in the D1 database ALLOWANCE (migrations/0001_allowance.sql), counted with one
//     atomic upsert, so the count holds across locations. The row key is a SHA-256 of ALLOWANCE_SALT (an optional
//     secret), the day and the network: no IP address is stored. The daily cron deletes rows older than today.
// Fails closed: outside dev, a missing or failing ALLOWANCE database refuses free calls (keyed calls still work).
// In dev (ENVIRONMENT=dev, wrangler dev or tests) with no database, counts are kept in memory.

/** Rate-limit key for an address: IPv4 as is, IPv6 by its /64, mapped IPv4 as IPv4 (same rule as InkrenderWorker). */
export function rateKey(ip) {
  const s = String(ip || '').trim().toLowerCase().replace(/%.*$/, '');
  if (!s) return 'unknown';
  if (!s.includes(':')) return s.slice(0, 64);
  const mapped = /^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) return mapped[1];
  const parts = s.split('::');
  if (parts.length > 2) return s.slice(0, 64);
  const groups = p => (p ? p.split(':').flatMap(g => (g.includes('.') ? ['0', '0'] : [g])) : []);
  const head = groups(parts[0]), tail = parts.length === 2 ? groups(parts[1]) : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  const all = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail];
  if (all.length !== 8 || fill < 0 || (parts.length === 2 && fill < 1) || !all.every(g => /^[0-9a-f]{1,4}$/.test(g))) return s.slice(0, 64);
  return `${all.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

export const DEFAULT_DAILY = 50;
export const dailyLimit = env => {
  const n = Number(env?.ANON_DAILY_LIMIT);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : DEFAULT_DAILY;
};
export const dayOf = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** True when a rate limiting binding lets this key through (no binding: true; a failing binding: true, it is only a
 * burst guard; the daily count below is the real fence). */
export async function limiterOk(limiter, key) {
  if (!limiter || typeof limiter.limit !== 'function') return true;
  try { return (await limiter.limit({ key })).success !== false; } catch { return true; }
}

async function rowKey(env, day, net) {
  const data = new TextEncoder().encode(`${env.ALLOWANCE_SALT || 'fitztoppicks-mcp'}|${day}|${net}`);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const memory = new Map(); // dev only: rowKey -> count
export const resetMemory = () => memory.clear();

/** Allowance units for one free call: each ingredient line counts (security review, Nov 13, 2026: one free call could
 * carry 100 lines, which through Zyla would be 100 billed calls); other tools count their `units` (by Zyla price per
 * call, scripts/catalog.mjs: puzzle 3, hazmat and per diem 2, the rest 1). */
export function unitsOf(args, tool = null) {
  if (Array.isArray(args?.lines)) return Math.max(1, args.lines.length);
  if (Array.isArray(args?.lists)) return Math.max(1, args.lists.reduce((n, l) => n + (Array.isArray(l?.lines) ? l.lines.length : 0), 0));
  const u = Number(tool?.units);
  return Number.isInteger(u) && u >= 1 ? u : 1;
}

/** Takes `units` of the free allowance for this request's network. Returns { ok: true, used, limit } or
 * { ok: false, reason: 'size' | 'minute' | 'daily' | 'unavailable', used?, limit }. */
export async function takeAllowance(env, request, now = Date.now(), units = 1) {
  const limit = dailyLimit(env);
  if (units > limit) return { ok: false, reason: 'size', units, limit };
  const net = rateKey(request.headers.get('cf-connecting-ip'));
  if (!(await limiterOk(env.ANON_LIMIT, `anon:${net}`))) return { ok: false, reason: 'minute', limit };
  const day = dayOf(now), k = await rowKey(env, day, net);
  let used;
  if (env.ALLOWANCE && typeof env.ALLOWANCE.prepare === 'function') {
    try {
      // Adds the units only when they still fit, so a refused call never uses up the rest of the day.
      const row = await env.ALLOWANCE.prepare('INSERT INTO daily (k, day, n) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET n = n + ?3 WHERE n + ?3 <= ?4 RETURNING n')
        .bind(k, day, units, limit).first();
      if (row == null) return { ok: false, reason: 'daily', used: limit, limit };
      used = Number(row?.n);
      if (!Number.isFinite(used)) return { ok: false, reason: 'unavailable', limit };
    } catch { return { ok: false, reason: 'unavailable', limit }; }
  } else if (env.ENVIRONMENT === 'dev') {
    used = (memory.get(k) || 0) + units;
    if (used > limit) return { ok: false, reason: 'daily', used: used - units, limit };
    memory.set(k, used);
  } else {
    return { ok: false, reason: 'unavailable', limit };
  }
  return used <= limit ? { ok: true, used, limit } : { ok: false, reason: 'daily', used, limit };
}

/** The daily cron: rows of earlier days are deleted (they no longer count for anything). */
export async function pruneAllowance(env, now = Date.now()) {
  if (!env.ALLOWANCE || typeof env.ALLOWANCE.prepare !== 'function') return false;
  await env.ALLOWANCE.prepare('DELETE FROM daily WHERE day < ?1').bind(dayOf(now)).run();
  return true;
}

const KEY_HINT = 'add your own Zyla API Hub key (header "Authorization: Bearer <key>"; the API\'s listing on zylalabs.com)';

/** The tool error for a refused free call. keyed: the caller sent a key but this tool has no Zyla lane yet. */
export function refusal(r, { keyed = false } = {}) {
  const tail = keyed ? ' This tool is not on Zyla API Hub yet, so it uses the free allowance even with a key.' : '';
  if (r.reason === 'size') return `The free allowance counts each ingredient line, and this call has ${r.units} (more than today's ${r.limit}). Send fewer lines, or ${KEY_HINT} for parsing and conversion.${tail}`;
  if (r.reason === 'minute') return `Too many free calls from this network in the last minute. Wait a minute, or ${KEY_HINT}.${tail}`;
  if (r.reason === 'daily') return `This network has used today's free allowance (${r.limit} units a day; most calls use 1, puzzles 3, hazmat and per diem 2; reset at 00:00 UTC). For more, ${KEY_HINT}.${tail}`;
  return `The free allowance is not available right now. Try again later, or ${KEY_HINT}.${tail}`;
}
