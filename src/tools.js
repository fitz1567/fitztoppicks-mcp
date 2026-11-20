// The MCP tools: the six World Calendars tools (names, descriptions and arguments taken from the local MCP server in
// ../../calendars-api/mcp/server.mjs; test/tools.test.mjs fails if the two drift apart), four Ingredient Parser
// tools, and (task 1761, Nov 14, 2026) the tools of every other API live on Zyla API Hub, from src/catalog.js (written
// by scripts/catalog.mjs from src/defs.js, each API's openapi.json and data/zyla.json). Each tool names the Worker that
// answers it in process (`api` + `method` + `path`) and, when that endpoint is on Zyla API Hub, its Zyla ids, so a
// caller's own Zyla key can be passed through to Zyla (billing stays there). `units`: free-allowance units per call.
// Zod schemas are strict: an unknown argument is refused before anything runs.
import { z } from 'zod';
import { CATALOG } from './catalog.js';
import { APIS } from './defs.js';

export const CALENDARS = ['gregorian', 'hebrew', 'islamic', 'chinese', 'persian', 'indian', 'ethiopian', 'coptic'];
// Zyla API Hub: World Calendars Converter API (published Oct 2026). Ingredients is not on Zyla yet, so its tools
// always use the free allowance.
export const ZYLA_CALENDARS_API = 14563;
// Recipe Ingredient Parser API on Zyla (listed Nov 13, 2026, Kevin: "List the Ingredients tool on zyla so its not just free").
// Zyla calls GET only, so parse and convert go through it one line per call; scale and merge stay on the free allowance.
export const ZYLA_INGREDIENTS_API = 14910;

const MORE = ' More APIs from FitzTopPicks: https://fitztoppicks.com/apis?utm_source=mcp-api&utm_medium=mcp&utm_campaign=more-apis';
const str = d => z.string().max(200).describe(d);
const int = d => z.number().int().describe(d);
const bool = d => z.boolean().describe(d);
const TO = str('Calendars to return, comma-separated (gregorian, hebrew, islamic, chinese, persian, indian, ethiopian, coptic) or "all". Default: gregorian,hebrew,islamic,chinese.');
const METHOD = z.enum(['umalqura', 'civil', 'tabular']).describe('Islamic method: umalqura (default, Saudi Arabia\'s official calendar), civil or tabular.');
const SUNSET = bool('True when the time is after sunset: Hebrew and Islamic dates move to the next day (their days begin at sunset).');
const LINE = z.string().min(1).max(300);
const LINES = z.array(LINE).min(1).max(100);
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const BASE_TOOLS = [
  {
    name: 'convert_date', title: 'Convert a date between calendars', api: 'calendars', method: 'GET', path: '/convert', zylaEndpoint: 37316,
    description: 'Convert a date between the Gregorian, Hebrew, Islamic (Hijri), Chinese lunisolar, Persian (Solar Hijri), Indian national, Ethiopian and Coptic calendars. Give a Gregorian "date" (YYYY-MM-DD), or "calendar" with "year", "month" (number or name, e.g. "Kislev", "Ramadan", "Farvardin") and "day". Use it for questions like "what is the Hebrew date of my birthday" or "when is 1 Ramadan 1448 in the Gregorian calendar".',
    input: {
      date: str('A Gregorian date, YYYY-MM-DD.').optional(), calendar: z.enum(CALENDARS).describe('Calendar of year/month/day.').optional(), year: int('Year in that calendar.').optional(),
      month: str('Month number or name.').optional(), day: int('Day of the month.').optional(), leap: bool('Chinese only: a leap month.').optional(), to: TO.optional(), method: METHOD.optional(), afterSunset: SUNSET.optional(),
    },
  },
  {
    name: 'today', title: 'Today in other calendars', api: 'calendars', method: 'GET', path: '/today', zylaEndpoint: 37317,
    description: 'Today\'s date in a time zone, in the Hebrew, Islamic, Chinese and other calendars.',
    input: { timezone: str('IANA time zone, e.g. America/New_York, Asia/Jerusalem (default UTC).').optional(), to: TO.optional(), method: METHOD.optional(), afterSunset: SUNSET.optional() },
  },
  {
    name: 'holidays', title: 'Holidays of a year', api: 'calendars', method: 'GET', path: '/holidays', zylaEndpoint: 37319,
    description: 'Holidays of a year: Jewish (hebrew; Israel or diaspora), Islamic, Chinese festivals, Christian (Easter and the movable feasts, Western and Orthodox), Persian (Nowruz), Indian national, Ethiopian (Enkutatash, Meskel) or Coptic (Nayrouz). "year" is a Gregorian year; "calendarYear" is the calendar\'s own year instead.',
    input: {
      calendar: z.enum(['hebrew', 'islamic', 'chinese', 'christian', 'persian', 'indian', 'ethiopian', 'coptic']).describe('Which holidays.'),
      year: int('Gregorian year (default this year).').optional(), calendarYear: int('The calendar\'s own year (not for christian).').optional(),
      israel: bool('Hebrew only: Israel\'s schedule.').optional(), include: str('Hebrew only: categories, comma-separated (major, minor, fast, modern, roshchodesh).').optional(),
      method: METHOD.optional(), tradition: z.enum(['western', 'orthodox', 'both']).describe('Christian only: western, orthodox or both.').optional(),
    },
  },
  {
    name: 'calendar_months', title: 'Months of a year', api: 'calendars', method: 'GET', path: '/months', zylaEndpoint: 37318,
    description: 'Every month of a year in one calendar with its first and last Gregorian day and length (Hebrew leap years and Adar II, Chinese leap months, Islamic methods, Persian, Indian, Ethiopian and Coptic months).',
    input: { calendar: z.enum(CALENDARS).describe('The calendar.'), year: int('The year in that calendar (e.g. Hebrew 5787, Islamic 1448, Persian 1405).'), method: METHOD.optional() },
  },
  {
    name: 'solar_terms', title: 'Chinese solar terms', api: 'calendars', method: 'GET', path: '/solar-terms', zylaEndpoint: 37320,
    description: 'The 24 Chinese solar terms (jieqi) of a year 1900-2100, with dates in China, moments in UTC and the Chinese lunar date.',
    input: { year: int('Gregorian year 1900-2100 (default this year).').optional() },
  },
  {
    name: 'list_calendars', title: 'Supported calendars', api: 'calendars', method: 'GET', path: '/calendars', zylaEndpoint: 37321,
    description: 'The supported calendars, Islamic methods, date ranges and month names.',
    input: {},
  },
  {
    name: 'parse_ingredients', title: 'Parse recipe ingredient lines', api: 'ingredients', method: 'POST', path: '/parse', zylaApi: ZYLA_INGREDIENTS_API, zylaEndpoint: 38816, zylaPerLine: true,
    description: 'Parse recipe ingredient lines (English or Spanish) into amount, unit, item, prep, notes, optional flag, canonical key, grocery aisle, confidence and any unparsed remainder, with keyword flags for the major US food allergens (text matching, not a safety check). Send one "line" (e.g. "2 (14.5 oz) cans diced tomatoes, drained") or up to 100 "lines".',
    input: { line: LINE.describe('One ingredient line.').optional(), lines: LINES.describe('Up to 100 ingredient lines (send this or "line").').optional() },
  },
  {
    name: 'convert_ingredient', title: 'Convert ingredient units', api: 'ingredients', method: 'POST', path: '/convert', zylaApi: ZYLA_INGREDIENTS_API, zylaEndpoint: 38817, zylaPerLine: true,
    description: 'Convert an ingredient amount between US and metric units, or to one unit (g, ml, cup, oz, tbsp...). Volume to weight only for items with a known density (e.g. 250 g sugar to cups). Send one "line", up to 100 "lines", or "amount" + "unit" (+ "item" for volume <-> weight), and "to".',
    input: {
      to: str('"metric", "us" or a unit: tsp, tbsp, cup, fl oz, pint, quart, gallon, ml, l, oz, lb, g, kg.'),
      line: LINE.describe('One ingredient line, e.g. "1 1/2 cups flour".').optional(), lines: LINES.describe('Up to 100 ingredient lines.').optional(),
      amount: z.union([z.number().positive(), z.string().max(40)]).describe('An amount (with "unit"), e.g. 250 or "1 1/2".').optional(),
      unit: str('The amount\'s unit, e.g. g, cup, oz.').optional(), item: str('The ingredient (needed for volume <-> weight), e.g. sugar.').optional(),
      prefer: z.enum(['same', 'weight', 'volume']).describe('Keep the kind of unit (same, default), or prefer weight or volume.').optional(),
      spoons: z.enum(['keep', 'convert']).describe('Keep teaspoons and tablespoons as they are (default) or convert them too.').optional(),
      rounding: z.enum(['kitchen', 'none']).describe('Round to kitchen-friendly amounts (default) or not at all.').optional(),
    },
  },
  {
    name: 'scale_recipe', title: 'Scale a recipe', api: 'ingredients', method: 'POST', path: '/scale',
    description: 'Scale a recipe\'s ingredient lines by a factor (e.g. 2 or 0.5) or from one number of servings to another, with kitchen-friendly rounding and optional US/metric units.',
    input: {
      lines: LINES.describe('The recipe\'s ingredient lines (up to 100).'),
      factor: z.number().min(0.01).max(100).describe('Multiply every amount (send this or "servings").').optional(),
      servings: z.object({ from: z.number().min(0.25).max(1000), to: z.number().min(0.25).max(1000) }).strict().describe('Scale from one number of servings to another, e.g. { "from": 4, "to": 6 }.').optional(),
      units: z.enum(['friendly', 'keep']).describe('Switch to friendlier units when amounts grow or shrink (default) or keep them.').optional(),
      rounding: z.enum(['kitchen', 'none']).describe('Kitchen rounding (default) or none.').optional(),
      system: z.enum(['keep', 'us', 'metric']).describe('Keep the units\' system (default), or answer in US or metric units.').optional(),
    },
  },
  {
    name: 'merge_shopping_lists', title: 'Merge recipes into one shopping list', api: 'ingredients', method: 'POST', path: '/merge',
    description: 'Merge the ingredient lists of up to 20 recipes into one shopping list grouped by grocery aisle, adding up the same items (each list can be scaled), with pantry staples kept apart by default.',
    input: {
      lists: z.array(z.object({
        name: z.string().max(100).describe('The recipe\'s name.').optional(),
        lines: LINES.describe('Its ingredient lines.'),
        factor: z.number().min(0.01).max(100).describe('Scale this list (default 1).').optional(),
      }).strict()).min(1).max(20).describe('The recipes: [{ "name": "Tacos", "lines": ["1 lb ground beef", ...] }].'),
      system: z.enum(['us', 'metric']).describe('Units of the merged list (default us).').optional(),
      staples: z.enum(['separate', 'include']).describe('Keep pantry staples (salt, oil...) in their own group (default) or in the list.').optional(),
    },
  },
].map(t => ({ ...t, units: 1, zylaApi: t.zylaApi ?? (t.zylaEndpoint ? ZYLA_CALENDARS_API : undefined) }));

/** A catalog argument (from the API's openapi.json) as a zod schema. Query values are text on the wire, so strings
 * keep the APIs' own 200-character cap. */
export function zodOf(a) {
  let s;
  if (a.type === 'boolean') s = z.boolean();
  else if (a.type === 'integer' || a.type === 'number') {
    if (a.enum) s = z.union(a.enum.map(v => z.literal(v)));
    else {
      s = a.type === 'integer' ? z.number().int() : z.number();
      if (a.minimum !== undefined) s = s.min(a.minimum);
      if (a.maximum !== undefined) s = s.max(a.maximum);
    }
  } else if (a.enum) s = z.enum(a.enum.map(String));
  else {
    s = z.string().max(Math.min(a.maxLength ?? 200, 200));
    if (a.minLength) s = s.min(a.minLength);
    else if (a.required) s = s.min(1);
  }
  s = s.describe(a.description);
  return a.required ? s : s.optional();
}

const catalogTools = CATALOG.map(t => ({
  name: t.name, title: t.title, api: t.api, method: 'GET', path: t.path, description: t.description, units: t.units,
  ...(t.zylaEndpoint ? { zylaApi: t.zylaApi, zylaEndpoint: t.zylaEndpoint, zylaParams: t.zylaParams } : {}),
  ...(t.defaults ? { defaults: t.defaults } : {}),
  pathArgs: t.args.filter(a => a.in === 'path').map(a => a.name),
  input: Object.fromEntries(t.args.map(a => [a.name, zodOf(a)])),
}));

export const TOOLS = [...BASE_TOOLS, ...catalogTools]
  .map(t => ({ ...t, description: t.description + MORE, schema: z.object(t.input).strict(), annotations: { title: t.title, ...READ_ONLY } }));

/** The API groups a client can ask for with /mcp?apis=a,b (fewer tools for clients with a tool cap). */
export const API_GROUPS = Object.freeze({ calendars: 'World Calendars Converter', ...Object.fromEntries(Object.entries(APIS).map(([k, v]) => [k, v.title])) });

/** The tool of a name, or undefined (Object.hasOwn: a name like "constructor" is not a tool; lesson L056). */
const BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));
export const toolNamed = name => (typeof name === 'string' && Object.hasOwn(BY_NAME, name) ? BY_NAME[name] : undefined);

export const INSTRUCTIONS = 'Exact answers from FitzTopPicks\' APIs: world calendars and holidays, recipe ingredients, US baby names, world cities and time zones, coordinate formats and distances, concrete/paint/gravel and lumber amounts, the US hazmat table, US federal per diem, plugs and voltage by country, tipping by country, shoe/ring/hat/clothing sizes, a thesaurus, screw threads and drill bits, tire sizes, and sudoku/maze puzzles. Pick the tool whose description matches the question. Islamic dates are calculated and can differ by 1-2 days from moon sighting, so say so. Without a key each network gets a small free daily allowance of units (most calls 1; puzzles 3, hazmat and per diem 2, ingredient batches 1 a line); with your own Zyla API Hub key (header "Authorization: Bearer <key>") the tools listed on Zyla run through your Zyla account.';
