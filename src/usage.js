// Per-tool usage counts for Command Center's "MCP server usage" card (task 1763, Kevin, Nov 14, 2026: "Build ... 8").
// One Workers Analytics Engine point per tool call in its own dataset, mcp_usage (binding MCP_USAGE), so the App
// Dashboard's rapidapi_usage counts stay as they were:
//   blob1 tool name, blob2 lane ('free' = in process on the free allowance, 'key' = through Zyla with the caller's key,
//   'refused' = the free allowance said no), blob3 outcome ('ok' | 'error', or the refusal: 'daily' | 'minute' | 'size' |
//   'unavailable'), blob4 the API; double1 units (free-allowance units, or Zyla calls for a keyed call), double2 1 when
//   this call took its network past 80% of the day's allowance, double3 1 when it used the last unit, double4 the
//   daily limit; index the tool.
// Nothing about the caller is in a point: no IP, network hash, key, argument or answer. A network that crosses 80% (or
// uses the last unit) does so once a day, so summing double2/double3 per day counts networks without naming any.
export const NEAR_SHARE = 0.8;

/** Writes one point; never throws and never changes the answer. Returns true when written. */
export function recordToolCall(env, { tool, api = '', lane, outcome, units = 1, used = null, limit = null }) {
  const ds = env && env.MCP_USAGE;
  if (!ds || typeof ds.writeDataPoint !== 'function') return false;
  const lim = Number(limit), u = Number(used), n = Math.max(0, Number(units) || 0);
  const near = lim > 0 && Number.isFinite(u) ? Math.ceil(lim * NEAR_SHARE) : null;
  const crossed = near !== null && u >= near && u - n < near ? 1 : 0;
  const capped = lim > 0 && Number.isFinite(u) && u >= lim ? 1 : 0;
  try {
    ds.writeDataPoint({ blobs: [String(tool).slice(0, 64), lane, outcome, String(api).slice(0, 32)], doubles: [n, crossed, capped, lim > 0 ? lim : 0], indexes: [String(tool).slice(0, 64)] });
    return true;
  } catch { return false; }
}
