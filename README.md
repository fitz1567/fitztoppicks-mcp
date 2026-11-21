# FitzTopPicks APIs: calendars, recipes, names, places, sizes and more

The source of FitzTopPicks' free remote MCP server, `com.fitztoppicks/calendars-ingredients` in the
[official MCP Registry](https://registry.modelcontextprotocol.io). Version 1.1.2.

- **Connect:** `https://mcp.fitztoppicks.com/mcp` (Streamable HTTP). No sign-up: a free daily allowance per network.
  Optional: your own Zyla API Hub key as `Authorization: Bearer <key>` for the tools listed on Zyla (billed by Zyla).
- **What it is:** Calendars, recipes, baby names, cities, coordinates, sizes, hazmat, per diem, tires and puzzles. Every tool is read-only.
- **More:** https://fitztoppicks.com/apis

## What's here
This repository shows the MCP layer so you can check what the server does with your requests:
`src/app.js` (routes, the per-request server, tool dispatch), `src/tools.js`, `src/defs.js` and `src/catalog.js`
(every tool's name, description and input schema), `src/allowance.js` (the free allowance: a salted hash per network,
no IP stored), `src/zyla.js` (your key goes only to Zyla's MCP endpoint and is never logged, stored or returned),
`src/usage.js` (counts per tool, with no caller data) and `src/inprocess.js`.

The data APIs the tools call run inside the same Worker and are not in this repository, so it doesn't build on its
own. Nothing logs a request, a body, a header, an IP address or a key.

Copyright FitzTopPicks. Shown for review; no license to reuse is granted.
