// mcp-api: FitzTopPicks' free remote MCP server for the World Calendars and Ingredient Parser APIs (task 1742.2,
// market check market-checks/2026-11-13-agent-storefront-mcp.md). Not deployed; deploying needs Kevin's OK (README).
// Only the handlers are exported here (workerd refuses other named exports from the entry module); see src/app.js.
import { handle, scheduled } from './app.js';

export default {
  async fetch(request, env, ctx) {
    try { return await handle(request, env, ctx); } catch {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Something went wrong on our side. Please try again.' } }),
        { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduled(event, env));
  },
};
