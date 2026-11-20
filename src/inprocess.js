// Runs a tool in this isolate: the API Workers' own fetch handlers (makeWorker in ../../shared/http.js) are imported and
// called with a Request built here, never over the network. Their secret check still runs: this module makes a random
// secret per isolate (never a marketplace secret, never leaves memory) and hands it to both sides, so every validation,
// error and answer is exactly the deployed API's. The API Workers themselves are not changed and still refuse every
// call without Rapid's or Zyla's secret.
// Each Worker is imported on first use (import() with a fixed path: the bundler keeps it in this bundle but runs its
// module code only when a tool of that API is first called), so a cold start never loads all sixteen APIs' data.
// D1-backed APIs (baby names, cities, thesaurus) get their own database under the name this Worker binds it to
// (APIS[...].db in defs.js, wrangler.toml), handed to them as the DB binding they expect.
import { APIS } from './defs.js';

const LOADERS = Object.assign(Object.create(null), {
  calendars: () => import('../../calendars-api/src/index.js'),
  ingredients: () => import('../../ingredients-api/src/index.js'),
  babynames: () => import('../../babynames-api/src/index.js'),
  cities: () => import('../../cities-api/src/index.js'),
  coords: () => import('../../coords-api/src/index.js'),
  coverfacts: () => import('../../coverfacts-api/src/index.js'),
  hazmat: () => import('../../hazmat-api/src/index.js'),
  lumberfacts: () => import('../../lumberfacts-api/src/index.js'),
  perdiem: () => import('../../perdiem-api/src/index.js'),
  plugfacts: () => import('../../plugfacts-api/src/index.js'),
  puzzle: () => import('../../puzzle-api/src/index.js'),
  sizes: () => import('../../sizes-api/src/index.js'),
  thesaurus: () => import('../../thesaurus-api/src/index.js'),
  threadfacts: () => import('../../threadfacts-api/src/index.js'),
  tipfacts: () => import('../../tipfacts-api/src/index.js'),
  tires: () => import('../../tires-api/src/index.js'),
});
export const IN_PROCESS_APIS = Object.freeze(Object.keys(LOADERS));
const loaded = new Map();
async function workerOf(api) {
  if (!LOADERS[api]) throw new Error(`no in-process worker for ${api}`);
  if (!loaded.has(api)) loaded.set(api, LOADERS[api]().then(m => m.default));
  return loaded.get(api);
}

let secret = null;
const inprocSecret = () => (secret ||= `mcp-inproc-${crypto.randomUUID()}`);

/** Query string for a GET tool: every argument as text (true/false, numbers as written). */
export function queryOf(args, skip = []) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(args || {})) if (!skip.includes(k) && v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  return qs;
}

/** The route with its {segments} filled from the arguments (URL-encoded; "/" in a value is encoded too). */
export function pathOf(tool, args = {}) {
  return tool.path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(args[k] ?? '')));
}

/** Calls the tool's API in process. Returns { status, body, attribution } (body parsed JSON, or null). Usage points
 * from the inner Worker go to the same USAGE dataset with the plan "MCP", so the App Dashboard counts these calls per
 * API. attribution: the API's X-Data-Attribution header (GeoNames' CC BY credit), shown with the answer. */
export async function callInProcess(tool, args, env = {}) {
  const worker = await workerOf(tool.api);
  const s = inprocSecret();
  const headers = { 'x-rapidapi-proxy-secret': s, 'x-rapidapi-subscription': 'MCP', accept: 'application/json' };
  const pathArgs = tool.pathArgs || [];
  let url = `https://${tool.api}-api.internal${pathOf(tool, args)}`, init = { method: tool.method, headers };
  if (tool.method === 'GET') {
    const qs = queryOf(args, pathArgs);
    if (qs.size) url += `?${qs}`;
  } else {
    headers['content-type'] = 'application/json';
    init = { ...init, body: JSON.stringify(args || {}) };
  }
  const inner = { RAPIDAPI_SECRET: s, USAGE: env.USAGE };
  const db = APIS[tool.api]?.db;
  if (db && env[db]) inner.DB = env[db];
  const res = await worker.fetch(new Request(url, init), inner);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body, attribution: res.headers.get('x-data-attribution') };
}
