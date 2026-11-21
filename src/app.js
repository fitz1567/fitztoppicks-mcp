// The MCP Worker's request handling (src/index.js only exports it: workerd refuses other named exports from the entry).
//   POST /mcp     the MCP endpoint (Streamable HTTP, stateless createMcpHandler: a fresh server per request, no Durable
//                 Object, no session). Legacy clients (initialize, then tools/list and tools/call) work too.
//                 /mcp?apis=hazmat,tires lists only those APIs' tools (API_GROUPS; for clients with a tool cap).
//   GET /health   { ok, service, version, tools, allowance } (no secrets, no counts)
//   GET /         what this is and how to connect
// Auth: none needed. With the caller's own Zyla key ("Authorization: Bearer <key>" or "X-Zyla-Key"), every tool with a
// Zyla endpoint goes through Zyla (src/zyla.js, billed there). Without a key, every tool runs in process
// (src/inprocess.js) against the free allowance (src/allowance.js). Tools with no Zyla endpoint (scale_recipe and
// merge_shopping_lists: POST only; tools with a {path} argument) always use the allowance.
// Nothing logs a request, a body, a header, an IP or a key. Usage counts: the inner Workers' points (plan "MCP") and
// this Worker's refusals (service "mcp-api", plan "MCP", status 429/503) in the same rapidapi_usage dataset, and one
// point per tool call in mcp_usage (src/usage.js; Command Center's MCP usage card).
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { recordUsage, recordMonitor } from '../../shared/http.js';
import { recordError } from '../../shared/errors.js';
import { TOOLS, INSTRUCTIONS, API_GROUPS } from './tools.js';
import { APIS } from './defs.js';
import { recordToolCall } from './usage.js';
import { callInProcess } from './inprocess.js';
import { zylaKeyOf, callThroughZyla, toolError } from './zyla.js';
import { takeAllowance, refusal, rateKey, limiterOk, pruneAllowance, dailyLimit, unitsOf } from './allowance.js';

export const SERVICE = 'mcp-api';
export const VERSION = '1.1.2'; // 1.1.2 (Nov 21, 2026): solve_sudoku takes variant (classic or diagonal). 1.1.1 (Nov 17, 2026): error points only for real faults (task 1780.2); registry icon + repository
export const SERVER_INFO = { name: 'fitztoppicks-apis', title: 'FitzTopPicks APIs', version: VERSION };
const MAX_BODY = 64 * 1024;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
});
const rpcError = (status, code, message, headers) => json({ jsonrpc: '2.0', id: null, error: { code, message } }, status, headers);

/** The tool result for an in-process answer: the API's JSON as text (no structuredContent copy: half the tokens), or
 * its error; the data credit the API asks for (X-Data-Attribution) goes with it. */
function resultOf({ status, body, attribution }) {
  if (status >= 400 || !body || typeof body !== 'object') {
    const msg = body && typeof body === 'object' && body.message ? body.message : `The API answered HTTP ${status}.`;
    return toolError(String(msg));
  }
  const out = { content: [{ type: 'text', text: JSON.stringify(body) }] };
  if (attribution) out.content.push({ type: 'text', text: String(attribution).slice(0, 300) });
  return out;
}

/** One tool call: through Zyla with the caller's key (tools with a Zyla endpoint), else in process against the free
 * allowance. Every call is counted per tool in mcp_usage (src/usage.js; counts only). */
export async function runTool(tool, args, { env, request, key, keyError, fetchFn }) {
  if (keyError) return toolError(keyError);
  if (tool.defaults) args = { ...tool.defaults, ...args };
  const base = { tool: tool.name, api: tool.api };
  if (key && tool.zylaEndpoint) {
    const out = await callThroughZyla(tool, args, key, fetchFn);
    recordToolCall(env, { ...base, lane: 'key', outcome: out.isError ? 'error' : 'ok', units: Array.isArray(args?.lines) ? args.lines.length : 1 });
    return out;
  }
  const db = APIS[tool.api]?.db;
  if (db && !env[db]) {
    recordToolCall(env, { ...base, lane: 'refused', outcome: 'unavailable', units: 0 });
    return toolError('This tool is not available right now. Please try again later.');
  }
  const units = unitsOf(args, tool);
  const a = await takeAllowance(env, request, Date.now(), units);
  if (!a.ok) {
    recordUsage(env, { service: SERVICE, endpoint: tool.name, plan: 'MCP', status: a.reason === 'unavailable' ? 503 : 429 });
    recordToolCall(env, { ...base, lane: 'refused', outcome: a.reason, units, limit: a.limit });
    return toolError(refusal(a, { keyed: Boolean(key) }));
  }
  const out = resultOf(await callInProcess(tool, args, env));
  recordToolCall(env, { ...base, lane: 'free', outcome: out.isError ? 'error' : 'ok', units, used: a.used, limit: a.limit });
  const left = a.limit - a.used;
  if (!out.isError && left <= 10) out.content.push({ type: 'text', text: `Free allowance: ${left} of ${a.limit} units left today for this network (UTC; most calls use 1 unit, ingredient batches 1 a line).${key ? '' : ' Add your Zyla API Hub key for more.'}` });
  return out;
}

/** The tools for /mcp?apis=a,b: { tools } or { error } naming the groups that exist. No apis parameter: every tool. */
export function toolsFor(url) {
  const raw = url.searchParams.get('apis');
  if (raw == null || !raw.trim()) return { tools: TOOLS };
  const want = [...new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
  const unknown = want.filter(a => !Object.hasOwn(API_GROUPS, a));
  if (unknown.length || want.length > 20) return { error: `Unknown API group${unknown.length === 1 ? '' : 's'} in "apis": ${unknown.slice(0, 5).join(', ').slice(0, 120)}. Use any of: ${Object.keys(API_GROUPS).join(', ')}.` };
  return { tools: TOOLS.filter(t => want.includes(t.api)) };
}

/** A fresh MCP server for one request (the handler calls this per request). */
export function buildServer(call, tools = TOOLS) {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  for (const tool of tools) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.schema, annotations: tool.annotations },
      async args => {
        try { return await runTool(tool, args, call); } catch {
          // Recorded here, not after the handler: a tools/call answer streams (SSE), so the Response is already back
          // in handle() before the tool runs.
          if (!call.fault) recordError(call.env, { worker: SERVICE, route: 'POST /mcp', status: 500, errorClass: 'Error' });
          call.fault = true;
          return toolError('Something went wrong on our side. Please try again.');
        }
      });
  }
  return server;
}

function info(url) {
  return json({
    name: SERVER_INFO.title, version: VERSION, mcp: `${url.origin}/mcp`, transport: 'streamable-http',
    tools: TOOLS.map(t => t.name),
    apis: Object.fromEntries(Object.entries(API_GROUPS).map(([k, title]) => [k, { title, tools: TOOLS.filter(t => t.api === k).length, mcp: `${url.origin}/mcp?apis=${k}` }])),
    auth: 'None needed for the free allowance. Optional: your own Zyla API Hub key as "Authorization: Bearer <key>" for every tool listed on Zyla (billed by Zyla).',
    more: 'https://fitztoppicks.com/apis?utm_source=mcp-api&utm_medium=mcp&utm_campaign=more-apis',
  });
}

export async function handle(request, env = {}, ctx = {}, { fetchFn = fetch } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'; // "//health" is /health (task 1780.2)
  if (path === '/health' && (request.method === 'GET' || request.method === 'HEAD')) {
    recordMonitor(env, { service: SERVICE, headers: request.headers });   // X-FTP-Monitor: 1 from our own checks (task 1867)
    return json({ ok: true, service: SERVICE, version: VERSION, tools: TOOLS.length, allowance: { daily: dailyLimit(env), configured: Boolean(env.ALLOWANCE) } });
  }
  if (path === '/' && request.method === 'GET') return info(url);
  if (path !== '/mcp') return json({ error: 'not_found', message: 'The MCP endpoint is /mcp.' }, 404);

  // Every /mcp request (listing included) counts against MCP_LIMIT per network, so floods stop before any work.
  if (request.method !== 'OPTIONS' && !(await limiterOk(env.MCP_LIMIT, `mcp:${rateKey(request.headers.get('cf-connecting-ip'))}`))) {
    return rpcError(429, -32000, 'Too many requests from this network. Wait a minute and try again.', { 'retry-after': '60' });
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY) return rpcError(413, -32600, `The request body is larger than ${MAX_BODY} bytes.`);

  const picked = toolsFor(url);
  if (picked.error) return rpcError(400, -32602, picked.error);
  const { key = null, error: keyError = null } = zylaKeyOf(request);
  const call = { env, request, key, keyError, fetchFn, fault: false, protocolError: false };
  const hosts = String(env.MCP_HOSTNAMES || '').split(',').map(s => s.trim()).filter(Boolean);
  const handler = createMcpHandler(() => buildServer(call, picked.tools), {
    route: '/mcp',
    ...(hosts.length ? { allowedHostnames: hosts } : {}),
    // The transport calls onerror for the caller's mistakes too (a body that isn't JSON-RPC, a wrong Content-Type),
    // which it answers 4xx. Until Nov 17, 2026 those were counted as server errors (status 500 points, about 180-360 a
    // day from directory checkers, while Cloudflare showed every request a success): now only a tool that threw or a
    // 5xx answer is an error point (task 1780.2; a tool's throw is recorded in buildServer).
    onerror: () => { call.protocolError = true; },
  });
  const res = await handler(request, env, ctx);
  if (res.status >= 500 && !call.fault) recordError(env, { worker: SERVICE, route: 'POST /mcp', status: res.status, errorClass: '(response)' });
  return res;
}

export async function scheduled(event, env) {
  await pruneAllowance(env).catch(() => { /* next run tries again */ });
}
