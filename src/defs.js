// The tools for every other API live on Zyla API Hub (task 1761, Kevin, Nov 14, 2026: "from the older list make the other
// zyla apis mcps"). Each entry is written for assistants: the name and description say which question the tool answers.
// The arguments are not written here: scripts/catalog.mjs takes them from the API's own openapi.json (types, enums,
// ranges, descriptions) and the Zyla ids from data/zyla.json, and writes src/catalog.js (test/catalog.test.mjs fails
// when it drifts). Fields:
//   name, api, path, title, description   the tool (path is the API's GET route; {x} segments become required args)
//   omit       arguments left out of the tool (e.g. format=svg: assistants read JSON)
//   defaults   values sent when the caller leaves them out (e.g. svg=false: a picture costs thousands of tokens)
//   units      free-allowance units per call when not the API's (see APIS[...].units in catalog.mjs: by Zyla price)
// A tool whose path has a {segment} has no Zyla lane yet (Zyla's call_api has no documented way to fill a path segment;
// those tools always use the free allowance; see README "Zyla lane").

/** The Workers behind the tools, with the D1 binding name this Worker gives their database (wrangler.toml). */
export const APIS = {
  babynames: { worker: 'babynames-api', title: 'US Baby Name Trends', db: 'BABYNAMES_DB' },
  cities: { worker: 'cities-api', title: 'World City Autocomplete', db: 'CITIES_DB' },
  coords: { worker: 'coords-api', title: 'Coordinate Converter' },
  coverfacts: { worker: 'coverfacts-api', title: 'Concrete, Paint and Gravel Calculator' },
  hazmat: { worker: 'hazmat-api', title: 'Hazmat Table Lookup' },
  ingredients: { worker: 'ingredients-api', title: 'Recipe Ingredient Parser' },
  lumberfacts: { worker: 'lumberfacts-api', title: 'Lumber Size and Board Feet' },
  perdiem: { worker: 'perdiem-api', title: 'Federal Per Diem Rates' },
  plugfacts: { worker: 'plugfacts-api', title: 'Plug Type and Voltage by Country' },
  puzzle: { worker: 'puzzle-api', title: 'Sudoku and Maze Generator' },
  sizes: { worker: 'sizes-api', title: 'Size Chart Converter' },
  thesaurus: { worker: 'thesaurus-api', title: 'Word Sense Thesaurus', db: 'THESAURUS_DB' },
  threadfacts: { worker: 'threadfacts-api', title: 'Screw Thread and Tap Drill' },
  tipfacts: { worker: 'tipfacts-api', title: 'Tipping Customs by Country' },
  tires: { worker: 'tires-api', title: 'Tire Size Decoder' },
};

const PUZZLE = { omit: ['format'], defaults: { svg: false } };

export const DEFS = [
  // ---------- US Baby Name Trends (SSA data since 1880) ----------
  { name: 'baby_name_history', api: 'babynames', path: '/name/{name}', title: 'A baby name\'s popularity since 1880',
    description: 'How popular has a first name been in the US? Yearly counts and ranks of babies given the name since 1880 (US Social Security data), its peak year and best rank. Use for "how popular was Olivia in 1990" or "when did Jayden peak".' },
  { name: 'baby_name_by_state', api: 'babynames', path: '/name/{name}/states', title: 'A baby name in every US state',
    description: 'Where in the US is a first name most popular? The name\'s count and rank in every state and territory for one year, and the state where its share is highest.' },
  { name: 'top_baby_names', api: 'babynames', path: '/top', title: 'Top baby names of a year',
    description: 'What were the most popular baby names in a year, nationally or in one US state? Ranked lists for girls and boys (US Social Security data).' },
  { name: 'trending_baby_names', api: 'babynames', path: '/trending', title: 'Rising and falling baby names',
    description: 'Which baby names rose or fell the most between two years, nationally or in a state? Biggest risers and fallers by share, rank or percent change.' },
  { name: 'similar_baby_names', api: 'babynames', path: '/similar/{name}', title: 'Similar baby names',
    description: 'Spelling variants of a first name (Kaitlyn, Katelyn, Caitlin...) and names whose popularity rose and fell the same way. Use for "names like Emma" suggestions.' },
  { name: 'compare_baby_names', api: 'babynames', path: '/compare', title: 'Compare baby names over time',
    description: 'How do up to 5 first names compare in popularity over the years? Yearly series side by side.' },
  { name: 'baby_names_of_a_decade', api: 'babynames', path: '/peak', title: 'Names that peaked in a decade',
    description: 'Which names were at their most popular in a decade ("1950s names", "90s names")? Names whose share of births peaked then.' },
  { name: 'baby_name_totals', api: 'babynames', path: '/totals', title: 'Babies listed per year',
    description: 'How many babies and distinct names the US Social Security lists record per year and sex, nationally or by state (the base for per-million shares).' },

  // ---------- World City Autocomplete (GeoNames) ----------
  { name: 'find_city', api: 'cities', path: '/autocomplete', title: 'Find a city by the start of its name',
    description: 'Find cities and towns worldwide from the first letters of their name (any of 16 languages, accents ignored), with country, region, coordinates, population and time zone. Use for "which Springfield", or to get a place ID.' },
  { name: 'place_details', api: 'cities', path: '/city/{geonameId}', title: 'One place by its GeoNames ID',
    description: 'Everything about one place by its GeoNames ID (from find_city or places_near): names in 16 languages, region, country, coordinates, population, elevation and its time zone with the current UTC offset.' },
  { name: 'place_names', api: 'cities', path: '/names/{geonameId}', title: 'A place\'s names in other languages',
    description: 'What is a place called in other languages, and what were its historic names? Every name GeoNames lists for a place, region or country, by language.' },
  { name: 'places_near', api: 'cities', path: '/nearby', title: 'Places near a point',
    description: 'Which cities and towns are near a latitude/longitude? Places within a radius, nearest first, with the distance in km.' },
  { name: 'time_zone_at_point', api: 'cities', path: '/timezone', title: 'Time zone at a point',
    description: 'What time zone is a latitude/longitude in, and what time is it there now? The IANA zone of the nearest populated place, the UTC offset now and whether DST is on.' },
  { name: 'list_countries', api: 'cities', path: '/countries', title: 'All countries',
    description: 'Every country and territory with ISO codes, capital, continent, population, area, currency, calling code, languages and neighbours (names in 16 languages).' },
  { name: 'country_regions', api: 'cities', path: '/admin1', title: 'States and provinces of a country',
    description: 'The first-level regions (states, provinces, cantons...) of a country with their codes, usable to narrow find_city.' },

  // ---------- Coordinate Converter ----------
  { name: 'convert_coordinates', api: 'coords', path: '/convert', title: 'Convert a coordinate between formats',
    description: 'Convert a location between decimal degrees, degrees-minutes-seconds, UTM, UPS, MGRS, Plus Codes, geohash and Maidenhead (input format detected). Use for "what is 40°26\'46"N 79°58\'56"W in MGRS" or "UTM of 51.5, -0.12".' },
  { name: 'identify_coordinate', api: 'coords', path: '/validate', title: 'Check a coordinate and name its format',
    description: 'Is this text a valid coordinate, and in which format (MGRS, UTM, Plus Code, Maidenhead...)? Gives the normalized form and the point.' },
  { name: 'distance_between_points', api: 'coords', path: '/distance', title: 'Distance and bearing between two points',
    description: 'How far apart are two places (in any coordinate format), and in which direction? Precise WGS84 distance in m, km, mi, nmi and ft, initial and final bearing and the midpoint.' },
  { name: 'destination_point', api: 'coords', path: '/destination', title: 'Point at a bearing and distance',
    description: 'Where do you end up going a given distance on a given bearing from a start point? The end point on the WGS84 ellipsoid, in the formats you ask for.' },
  { name: 'shorten_plus_code', api: 'coords', path: '/pluscode/shorten', title: 'Shorten a Plus Code',
    description: 'Shorten a full Plus Code (Open Location Code) near a reference point, for showing with a town name.' },
  { name: 'recover_plus_code', api: 'coords', path: '/pluscode/recover', title: 'Recover a full Plus Code',
    description: 'Turn a short Plus Code back into the full code using a nearby reference point (coordinates, not a place name).' },
  { name: 'coordinate_formats', api: 'coords', path: '/formats', title: 'Supported coordinate formats',
    description: 'The coordinate formats convert_coordinates reads and writes, with example spellings.' },
  { name: 'great_circle_path', api: 'coords', path: '/path', title: 'Great-circle route waypoints',
    description: 'Waypoints along the shortest route between two points on the Earth (geodesic), as GeoJSON, by step distance or number of points. Use for flight-path lines on a map.' },
  { name: 'geodesic_circle', api: 'coords', path: '/circle', title: 'A circle of a radius around a point',
    description: 'A true circle of a given radius around a point as a GeoJSON polygon (correct on the ellipsoid, across the antimeridian). Use for "everything within 50 km of" map shapes.' },

  // ---------- Concrete, Paint and Gravel Calculator ----------
  { name: 'concrete_calculator', api: 'coverfacts', path: '/concrete', title: 'How much concrete',
    description: 'How much concrete for a slab, footing, column or stairs? Volume in cubic yards or m³, the ready-mix order and the number of 40/60/80 lb premix bags, with waste.' },
  { name: 'paint_calculator', api: 'coverfacts', path: '/paint', title: 'How much paint',
    description: 'How much paint for a room\'s walls (and ceiling), minus doors and windows, for a number of coats and primer? Gallons or liters.' },
  { name: 'gravel_calculator', api: 'coverfacts', path: '/gravel', title: 'How much gravel, sand, soil or mulch',
    description: 'How much gravel, crushed stone, sand, topsoil or mulch for an area and depth? Volume, weight in tons and bags.' },

  // ---------- Hazmat Table Lookup (49 CFR 172.101) ----------
  { name: 'hazmat_by_un_number', api: 'hazmat', path: '/un/{id}', title: 'Hazmat table rows for a UN number',
    description: 'What does the US hazardous materials table (49 CFR 172.101) say for a UN/NA number (e.g. UN1993)? Proper shipping name, hazard class, packing group, labels, special provisions decoded, packaging sections and quantity limits.' },
  { name: 'hazmat_search', api: 'hazmat', path: '/search', title: 'Search the hazmat table by name',
    description: 'Find hazardous materials by proper shipping name (fuzzy, e.g. "acetone", "lithium batteries") in the 49 CFR 172.101 table, with their UN numbers and classes.' },
  { name: 'hazmat_class_rows', api: 'hazmat', path: '/class/{class}', title: 'Hazmat table rows of a hazard class',
    description: 'Every 49 CFR 172.101 entry of a hazard class or division (e.g. 3, 2.1, 1.4S, "forbidden"), paged.' },
  { name: 'hazmat_special_provision', api: 'hazmat', path: '/special-provision/{code}', title: 'Decode a hazmat special provision',
    description: 'What does a 49 CFR 172.102 special provision code (e.g. 130, A100, IB2, T11) mean? Its full text and what it applies to.' },

  // ---------- Lumber Size and Board Feet ----------
  { name: 'lumber_actual_size', api: 'lumberfacts', path: '/size', title: 'Actual size of nominal lumber',
    description: 'What are the real dimensions of a 2x4 (or 1x6, 4x4, 5/4x6...)? Actual dry or green size of softwood or hardwood lumber, and board feet when a length is given.' },
  { name: 'lumber_sizes', api: 'lumberfacts', path: '/sizes', title: 'Common lumber sizes',
    description: 'A chart of common nominal lumber sizes with their actual dimensions (softwood or hardwood, dry or green).' },
  { name: 'board_feet', api: 'lumberfacts', path: '/boardfeet', title: 'Board feet and lumber cost',
    description: 'How many board feet (and linear feet, volume and cost) are in some boards? From a nominal size or thickness and width, length and quantity, with a price per board foot, linear foot or piece.' },
  { name: 'sheet_goods', api: 'lumberfacts', path: '/sheet', title: 'Plywood, OSB and drywall sheets',
    description: 'Real thickness of plywood, OSB or drywall, and how many 4x8 (or other) sheets cover an area with waste.' },

  // ---------- Federal Per Diem Rates (GSA) ----------
  { name: 'per_diem_rates', api: 'perdiem', path: '/rates', title: 'US federal per diem rates for a place',
    description: 'What are the GSA per diem rates (lodging and meals & incidentals) for a US city, county or ZIP on a date or for a fiscal year?' },
  { name: 'per_diem_trip', api: 'perdiem', path: '/trip', title: 'Per diem total for a trip',
    description: 'How much per diem does a US federal trip to one place get? Nightly lodging and M&IE for each day from start to end, with 75% on the first and last day, and the total.' },
  { name: 'per_diem_meals_breakdown', api: 'perdiem', path: '/mie-breakdown', title: 'Meals and incidentals breakdown',
    description: 'How a GSA M&IE rate splits into breakfast, lunch, dinner and incidentals, and the 75% first/last-day amount.' },
  { name: 'per_diem_locations', api: 'perdiem', path: '/locations', title: 'Non-standard per diem areas',
    description: 'Which US places have their own (non-standard) GSA per diem rate, by state or search, with destination IDs and the counties they cover.' },
  { name: 'per_diem_tax_exempt', api: 'perdiem', path: '/tax-exempt', title: 'Hotel tax exemption for government cards',
    description: 'Is a government travel card exempt from hotel or sales tax in a US state, and which form to show? From GSA SmartPay.' },
  { name: 'per_diem_fiscal_years', api: 'perdiem', path: '/fiscal-years', title: 'Per diem fiscal years loaded', units: 1,
    description: 'Which federal fiscal years of per diem rates are available, with their dates and standard rates.' },

  // ---------- Plug Type and Voltage by Country ----------
  { name: 'travel_adapter_check', api: 'plugfacts', path: '/compat', title: 'Do I need a plug adapter or converter?',
    description: 'Traveling from one country to another: do my plugs fit, do I need an adapter, and do I need a voltage converter for my device?' },
  { name: 'country_plugs', api: 'plugfacts', path: '/country/{code}', title: 'Plug types and voltage of a country',
    description: 'Which plug types, voltage and frequency does a country use (by ISO code or name)?' },
  { name: 'search_plug_countries', api: 'plugfacts', path: '/search', title: 'Find countries by plug type or voltage',
    description: 'Find countries by name or by plug type (e.g. "type G"), voltage or frequency.' },
  { name: 'plug_countries', api: 'plugfacts', path: '/countries', title: 'Every country\'s plugs and voltage',
    description: 'Plug types, voltage and frequency for every country (compact), optionally filtered.' },
  { name: 'plug_type', api: 'plugfacts', path: '/plug/{type}', title: 'One plug type',
    description: 'What is a plug type (A to O)? Its description, the countries that use it and which sockets it fits.' },
  { name: 'plug_types', api: 'plugfacts', path: '/plugs', title: 'All plug types',
    description: 'The 15 plug types A to O with short descriptions.' },

  // ---------- Sudoku and Maze Generator ----------
  { name: 'make_sudoku', api: 'puzzle', path: '/sudoku', title: 'Make a sudoku', ...PUZZLE,
    description: 'Make a new sudoku with exactly one solution (easy, medium or hard; classic or diagonal), optionally with the answer. Seeded, so the same seed gives the same puzzle.' },
  { name: 'solve_sudoku', api: 'puzzle', path: '/sudoku/solve', title: 'Solve a sudoku', ...PUZZLE,
    description: 'Solve a sudoku from its 81-character grid and say whether the solution is unique.' },
  { name: 'sudoku_hint', api: 'puzzle', path: '/sudoku/hint', title: 'Next sudoku step, explained',
    description: 'What is the next logical move in this sudoku? The simplest technique that makes progress (hidden single, pointing pair...), named and explained, without giving the whole answer.' },
  { name: 'make_nonogram', api: 'puzzle', path: '/nonogram', title: 'Make a nonogram', ...PUZZLE,
    description: 'Make a nonogram (picture logic puzzle, 5x5 to 25x25) with exactly one solution, solvable by line logic.' },
  { name: 'make_kakuro', api: 'puzzle', path: '/kakuro', title: 'Make a kakuro', ...PUZZLE,
    description: 'Make a kakuro (cross sums) puzzle with exactly one solution.' },
  { name: 'make_math_cages', api: 'puzzle', path: '/cages', title: 'Make a math cage puzzle', ...PUZZLE,
    description: 'Make a math cage puzzle (Latin square with arithmetic cages, 4x4 to 9x9) with exactly one solution.' },
  { name: 'make_maze', api: 'puzzle', path: '/maze', title: 'Make a maze', ...PUZZLE,
    description: 'Make a perfect maze (one path from entrance to exit) up to 60x60, optionally with the solution path.' },
  { name: 'puzzle_themes', api: 'puzzle', path: '/themes', title: 'Puzzle themes', units: 1,
    description: 'The built-in word search and crossword themes of the puzzle API.' },

  // ---------- Size Chart Converter ----------
  { name: 'convert_shoe_size', api: 'sizes', path: '/shoe', title: 'Convert a shoe size',
    description: 'What is a US men\'s 10 in EU, UK, Japan or Mondopoint? Convert shoe sizes between systems for men, women and kids, through foot length.' },
  { name: 'convert_ring_size', api: 'sizes', path: '/ring', title: 'Convert a ring size',
    description: 'Convert a ring size between US, UK letters, EU/ISO, Japan and others, with the inside diameter and circumference.' },
  { name: 'convert_hat_size', api: 'sizes', path: '/hat', title: 'Convert a hat size',
    description: 'Convert a hat size between US fitted, UK, EU centimeters, inches and S/M/L letters.' },
  { name: 'convert_clothing_size', api: 'sizes', path: '/clothing', title: 'Convert a clothing size',
    description: 'Convert women\'s dress/top sizes or men\'s suit and shirt sizes between US, UK, EU, FR, IT, Japan and others.' },
  { name: 'size_chart', api: 'sizes', path: '/chart', title: 'A whole size chart',
    description: 'A complete shoe, ring, hat or clothing size chart from one system to every other, for size pickers or listings.' },
  { name: 'size_systems', api: 'sizes', path: '/systems', title: 'Supported size systems',
    description: 'The size categories and systems the size tools accept, with their aliases.' },

  // ---------- Word Sense Thesaurus (Open English WordNet) ----------
  { name: 'synonyms', api: 'thesaurus', path: '/synonyms', title: 'Synonyms by meaning',
    description: 'Synonyms of an English word, grouped by meaning (each sense with its definition), so you pick the right sense. "safe" hides offensive words.' },
  { name: 'antonyms', api: 'thesaurus', path: '/antonyms', title: 'Antonyms by meaning',
    description: 'Opposites of an English word, by meaning (direct and indirect antonyms).' },
  { name: 'related_words', api: 'thesaurus', path: '/related', title: 'Broader, narrower and related words',
    description: 'Broader terms (dog -> canine), narrower ones (dog -> poodle), parts, similar words and other WordNet relations of a word, per meaning.' },
  { name: 'define_word', api: 'thesaurus', path: '/define', title: 'Define a word',
    description: 'Definitions of an English word with example sentences, part of speech, pronunciation and inflections.' },
  { name: 'word_family', api: 'thesaurus', path: '/family', title: 'Word family',
    description: 'Derived forms of a word grouped by part of speech (decide, decision, decisive, decisively).' },
  { name: 'random_words', api: 'thesaurus', path: '/random', title: 'Random words for games',
    description: 'Random English words for word games, filtered by part of speech, length, first letters and difficulty, and repeatable with a seed.' },

  // ---------- Screw Thread and Tap Drill ----------
  { name: 'thread_info', api: 'threadfacts', path: '/thread', title: 'Everything about a screw thread',
    description: 'Dimensions of a screw thread (M6x1, 1/4-20 UNC, #10-32...): pitch, diameters, tap drill, clearance holes and hex sizes.' },
  { name: 'npt_pipe_thread', api: 'threadfacts', path: '/npt', title: 'NPT pipe thread',
    description: 'NPT tapered pipe thread dimensions and tap drill for a pipe size (1/2-14 NPT...), or the list of sizes when none is given.' },
  { name: 'tap_drill', api: 'threadfacts', path: '/tapdrill', title: 'Tap drill for a thread',
    description: 'Which drill bit do I use to tap this thread (e.g. M8x1.25, 1/4-20) at a given percent of thread?' },
  { name: 'clearance_hole', api: 'threadfacts', path: '/clearance', title: 'Clearance hole for a bolt',
    description: 'What size hole lets a bolt pass through (close, normal or loose fit), and its hex head and nut sizes?' },
  { name: 'nearest_drill_bit', api: 'threadfacts', path: '/drill/nearest', title: 'Nearest standard drill bit',
    description: 'Which standard drill bit (fractional, number, letter or metric) is closest to a size like 5.1 mm or 0.201 in?' },
  { name: 'drill_bit', api: 'threadfacts', path: '/drill/{name}', title: 'A drill bit by name',
    description: 'The size of a drill bit by name (#7, F, 7/32, 5.5mm), its nearest bit in the other system and the threads it taps.' },
  { name: 'search_threads', api: 'threadfacts', path: '/search', title: 'Find threads by size',
    description: 'Find screw threads by designation text (M6, 1/4, #10) or by diameter.' },
  { name: 'list_threads', api: 'threadfacts', path: '/threads', title: 'Every standard thread',
    description: 'Every standard metric and inch screw thread (compact), filtered by system or series.' },

  // ---------- Tipping Customs by Country ----------
  { name: 'tip_amount', api: 'tipfacts', path: '/tip', title: 'How much to tip',
    description: 'How much should I tip at a restaurant, taxi, hotel or for a guide in a country? The custom and, with a bill amount, the tip to leave.' },
  { name: 'country_tipping', api: 'tipfacts', path: '/country/{code}', title: 'Tipping customs of a country',
    description: 'Tipping customs of a country (by ISO code or name) for restaurants, taxis, hotels and guides, and whether a service charge is usual.' },
  { name: 'search_tipping_countries', api: 'tipfacts', path: '/search', title: 'Find countries by tipping custom',
    description: 'Find countries by name, or by how tipping works there (e.g. where tipping is not expected at restaurants).' },
  { name: 'tipping_countries', api: 'tipfacts', path: '/countries', title: 'Tipping customs of every country',
    description: 'Tipping customs of every country (compact), optionally filtered by service, level or service charge.' },
  { name: 'tipping_services', api: 'tipfacts', path: '/services', title: 'Tipping levels explained',
    description: 'The services, tipping levels and methods the tipping tools use, explained, with counts.' },

  // ---------- Tire Size Decoder ----------
  { name: 'decode_tire_size', api: 'tires', path: '/decode', title: 'Decode a tire size',
    description: 'What does a tire size like 225/45R17 94W XL mean? Width, aspect ratio, construction, rim, diameter, load index and speed rating decoded.' },
  { name: 'compare_tire_sizes', api: 'tires', path: '/compare', title: 'Compare two tire sizes',
    description: 'Will a different tire size fit, and how does it change the speedometer? Diameter, width and sidewall differences and the speedometer error between two sizes.' },
  { name: 'tire_load_index', api: 'tires', path: '/load-index', title: 'Tire load index',
    description: 'How much weight does a tire load index carry (e.g. 98 = 750 kg), or which index covers a load?' },
  { name: 'tire_speed_rating', api: 'tires', path: '/speed-rating', title: 'Tire speed rating',
    description: 'What top speed does a tire speed rating letter allow (e.g. H = 210 km/h), or which rating covers a speed?' },
  { name: 'tire_age_from_dot', api: 'tires', path: '/dot', title: 'Tire age from its DOT code',
    description: 'How old is a tire? Decode the DOT code\'s week and year of manufacture and the plant, and the age today.' },

  // ---------- Recipe Ingredient Parser (the other tools are in tools.js) ----------
  { name: 'write_ingredient_line', api: 'ingredients', path: '/format', title: 'Write an ingredient line from fields',
    description: 'Turn structured fields (amount, unit, item, prep, notes) into a natural recipe line ("1½ cups flour, sifted"), with plurals, fractions and US/metric units.' },
];
