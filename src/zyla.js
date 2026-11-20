// Key pass-through: a caller who sends their own Zyla API Hub key gets every tool whose endpoint is on Zyla (the calendar
// tools, parse_ingredients and convert_ingredient since Nov 13, 2026, and since Nov 14 the query-only tools of every
// other Zyla-listed API; tools.js zylaEndpoint) through Zyla, so Zyla
// authenticates the key, bills the caller's Zyla account (pay per successful call) and pays us as the provider, exactly
// as for any other Zyla customer. The call goes to Zyla's official MCP endpoint (https://mcp.zylalabs.com/mcp, header
// "Authorization: Bearer KEY", tool call_api with the API and endpoint ids; https://zylalabs.com/llms.txt), and Zyla
// calls our calendars-api Worker with its X-Zyla-Secret as usual. This Worker never holds ZYLA_SECRET or RAPIDAPI_SECRET.
// The key goes only to that fixed Zyla URL; it is never logged, stored, returned or put in an error message.
import { ZYLA_CALENDARS_API } from './tools.js';
import { queryOf } from './inprocess.js';

export const ZYLA_MCP_URL = 'https://mcp.zylalabs.com/mcp';
export const ZYLA_TIMEOUT_MS = 15000;
const MAX_TEXT = 200_000;

/** The caller's Zyla key from "Authorization: Bearer <key>" or "X-Zyla-Key: <key>".
 * Returns { key } (null when none was sent) or { error } when one was sent but can't be a key. */
export function zylaKeyOf(request) {
  const auth = request.headers.get('authorization');
  const raw = auth != null ? (/^Bearer\s+(.+)$/i.exec(auth.trim()) || [])[1] : request.headers.get('x-zyla-key');
  if (auth != null && raw === undefined) return { error: 'The Authorization header must be "Bearer <your Zyla API key>".' };
  if (raw == null) return { key: null };
  const key = String(raw).trim();
  if (!key) return { key: null };
  // Zyla keys are printable ASCII without spaces (e.g. "1234|AbCd..."); anything else is refused before it is sent.
  if (!/^[\x21-\x7e]{16,512}$/.test(key)) return { error: 'That does not look like a Zyla API key (16-512 printable characters, no spaces).' };
  return { key };
}

const scrub = (s, key) => (key ? String(s).split(key).join('[key]') : String(s));
const rpcBody = text => {
  try { return JSON.parse(text); } catch { /* SSE */ }
  const m = String(text).match(/^data: (.*)$/m);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

/** Calls one tool through Zyla with the caller's key. Zyla only calls GET endpoints, so a per-line tool (parse,
 * convert) sent "lines" makes one Zyla call per line (each billed by Zyla), up to 100, 4 at a time. */
export async function callThroughZyla(tool, args, key, fetchFn = fetch) {
  if (tool.zylaPerLine && Array.isArray(args?.lines)) {
    const { lines, ...rest } = args;
    const out = new Array(lines.length);
    for (let i = 0; i < lines.length; i += 4) {
      const part = await Promise.all(lines.slice(i, i + 4).map(line => callThroughZyla(tool, { ...rest, line }, key, fetchFn)));
      part.forEach((r, j) => { out[i + j] = r; });
      if (part.some(r => r.isError && /refused this API key|payment method|rate limit/.test(r.content?.[0]?.text || ''))) return part.find(r => r.isError);
    }
    const content = out.flatMap(r => r.content);
    return { content, isError: out.every(r => r.isError) };
  }
  // Zyla forwards only the parameters its listing declares; an argument the listing lacks would be dropped silently.
  const extra = tool.zylaParams ? Object.keys(args || {}).filter(k => args[k] !== undefined && !tool.zylaParams.includes(k)) : [];
  if (extra.length) return toolError(`${extra.map(k => `"${k}"`).join(', ')} ${extra.length === 1 ? 'is' : 'are'} not available through Zyla API Hub for ${tool.name} yet. Leave ${extra.length === 1 ? 'it' : 'them'} out, or call without a key to use the free allowance.`);
  const params = Object.fromEntries(queryOf(args));
  const payload = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'call_api', arguments: { api_id: tool.zylaApi ?? ZYLA_CALENDARS_API, endpoint_id: tool.zylaEndpoint, method: 'GET', params } } };
  let res, text;
  try {
    res = await fetchFn(ZYLA_MCP_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ZYLA_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (e) {
    return toolError(`Could not reach Zyla API Hub (${e?.name === 'TimeoutError' ? 'timed out' : 'network error'}). Try again, or call without a key to use the free allowance.`);
  }
  if (res.status === 401 || res.status === 403) return toolError('Zyla API Hub refused this API key. Check the key at https://zylalabs.com (your account page), or call without a key to use the free daily allowance.');
  if (res.status === 402) return toolError('Zyla API Hub needs a payment method on your account before it runs paid calls. Add a card in your Zyla account, then try again.');
  if (res.status === 429) return toolError('Your Zyla API Hub rate limit was reached. Wait a moment and try again.');
  const msg = rpcBody(text);
  if (!res.ok || !msg) return toolError(`Zyla API Hub answered HTTP ${res.status}. Try again later.`);
  if (msg.error) return toolError(scrub(`Zyla API Hub: ${String(msg.error.message || 'error').slice(0, 300)}`, key));
  const r = msg.result || {};
  const out = (Array.isArray(r.content) ? r.content : []).filter(c => c && c.type === 'text').map(c => scrub(String(c.text).slice(0, MAX_TEXT), key));
  if (!out.length) return toolError('Zyla API Hub sent an empty answer. Try again later.');
  return { content: out.map(t => ({ type: 'text', text: t })), isError: Boolean(r.isError) };
}

export const toolError = text => ({ content: [{ type: 'text', text }], isError: true });
