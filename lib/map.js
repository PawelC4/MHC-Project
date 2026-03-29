/**
 * map.js
 * Map rendering and routing for Subway Quest.
 * Uses Leaflet.js to display a street map with subway station data.
 * Google Maps Directions API integration is stubbed.
 */

// ─── Google Maps Directions API Stub ─────────────────────

/**
 * STUB: Fetch step-by-step subway directions between two coordinates.
 *
 * Replace this with a real call to the Google Maps Directions API:
 *   https://maps.googleapis.com/maps/api/directions/json
 *     ?origin={lat},{lng}
 *     &destination={lat},{lng}
 *     &mode=transit
 *     &transit_mode=subway
 *     &key={GOOGLE_MAPS_API_KEY}
 *
 * @param {number} originLat
 * @param {number} originLng
 * @param {number} destLat
 * @param {number} destLng
 * @returns {Promise<DirectionsResult>}
 *
 * @typedef {{ steps: DirectionStep[], durationMinutes: number, distanceKm: number, overviewPolyline: string | null }} DirectionsResult
 * @typedef {{ instruction: string, icon: string, durationMin: number, type: 'walk'|'subway'|'transfer', lineName?: string, lineColor?: string, stopCount?: number, boardStation?: string, alightStation?: string }} DirectionStep
 */
export async function getDirections(originLat, originLng, destLat, destLng) {
  // This function now calls our own API route, which securely proxies the request to Google.
  // This avoids CORS issues and keeps the API key on the server.
  const params = new URLSearchParams({
    origin: `${originLat},${originLng}`,
    destination: `${destLat},${destLng}`,
  });

  const res = await fetch(`/api/directions?${params.toString()}`);
  if (!res.ok) throw new Error(`Directions API error: ${res.status}`);
  const data = await res.json();

  return _parseGoogleDirectionsResponse(data);
}

/**
 * Parse a real Google Maps Directions API JSON response into our internal format.
 * Activate this when the stub is replaced.
 * @param {object} googleResponse
 * @returns {DirectionsResult}
 */
function _parseGoogleDirectionsResponse(googleResponse) {
  const route = googleResponse.routes?.[0];
  const leg   = route?.legs?.[0];

  // Handle cases where no route is found (e.g., ZERO_RESULTS status from API)
  if (!leg || !leg.steps || leg.steps.length === 0) {
    console.warn('Could not find a valid route in Directions API response. Status:', googleResponse.status);
    return {
      steps: [],
      durationMinutes: 0,
      distanceKm: 0,
      overviewPolyline: null,
    };
  }

  const steps = leg.steps.map(step => {
    const isTransit = step.travel_mode === 'TRANSIT';
    const isWalk    = step.travel_mode === 'WALKING';
    const durationMin = Math.round((step.duration?.value ?? 0) / 60);

    if (isTransit) {
      const transitDetails = step.transit_details;
      const lineName = transitDetails?.line?.short_name;
      const stopCount = transitDetails?.num_stops;
      const boardStation = transitDetails?.departure_stop?.name;
      const alightStation = transitDetails?.arrival_stop?.name;

      let instruction = `Take the ${lineName || 'subway'} train`;
      if (boardStation) {
        instruction = `From ${boardStation}, take the ${lineName || 'subway'} train`;
      }
      if (alightStation) {
        instruction += `, getting off at ${alightStation}`;
      }
      instruction += '.';

      return {
        type: 'subway',
        icon: '🚇',
        instruction,
        durationMin,
        lineName: lineName ?? null,
        lineColor: transitDetails?.line?.color ?? null,
        stopCount: stopCount ?? null,
        boardStation: boardStation ?? null,
        alightStation: alightStation ?? null,
      };
    }

    return {
      type: isWalk ? 'walk' : 'transfer',
      icon: isWalk ? '🚶' : '↔',
      instruction: step.html_instructions.replace(/<[^>]+>/g, ''),
      durationMin,
      lineName: null,
      lineColor: null,
      stopCount: null,
      boardStation: null,
      alightStation: null,
    };
  });

  return {
    steps,
    durationMinutes: Math.round((leg.duration?.value ?? 0) / 60),
    distanceKm: (leg.distance?.value ?? 0) / 1000,
    overviewPolyline: route.overview_polyline?.points ?? null,
  };
}

// ─── Direction step renderer ──────────────────────────────

/**
 * Decodes a Google Maps polyline string into an array of lat/lng pairs.
 * @param {string | null | undefined} encoded The encoded polyline string.
 * @returns {Array<[number, number]>} An array of [lat, lng] coordinates.
 * @see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function _decodePolyline(encoded) {
  if (!encoded) return [];
  let len = encoded.length;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const array = [];

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    array.push([lat * 1e-5, lng * 1e-5]);
  }
  return array;
}

// ─── Leaflet Street Map ───────────────────────────────────

let _leafletMap = null;
let _routeLayer = null;
let _linesLayer = null;
let _stationsLoaded = false;

/**
 * Parses CSV text into an array of station objects.
 * @param {string} csvText
 * @returns {Array<{name: string, lat: number, lon: number, routes: string[]}>}
 */
function _parseStationsCSV(csvText) {
  const complexData = new Map();
  const lines = csvText.trim().split('\n');
  const headerLine = lines.shift();
  if (!headerLine) return [];

  const header = headerLine.split(',').map(h => h.replace(/"/g, ''));
  const complexIdIndex = header.indexOf('Complex ID');
  const nameIndex = header.indexOf('Stop Name');
  const latIndex = header.indexOf('GTFS Latitude');
  const lonIndex = header.indexOf('GTFS Longitude');
  const routesIndex = header.indexOf('Daytime Routes');

  if ([complexIdIndex, nameIndex, latIndex, lonIndex, routesIndex].includes(-1)) {
    console.error('Could not find required columns in CSV: Complex ID, Stop Name, GTFS Latitude, GTFS Longitude, Daytime Routes');
    return [];
  }

  for (const line of lines) {
    if (!line) continue;
    const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (columns.length > Math.max(complexIdIndex, nameIndex, latIndex, lonIndex, routesIndex)) {
      const complexId = columns[complexIdIndex].replace(/"/g, '');
      const name = columns[nameIndex].replace(/"/g, '');
      const lat = parseFloat(columns[latIndex].replace(/"/g, ''));
      const lon = parseFloat(columns[lonIndex].replace(/"/g, ''));
      const routes = columns[routesIndex].replace(/"/g, '').split(' ').filter(Boolean);

      if (complexId && name && !isNaN(lat) && !isNaN(lon)) {
        if (!complexData.has(complexId)) {
          complexData.set(complexId, {
            canonicalName: name, // Use the first name encountered as canonical
            allNames: new Set(),
            allRoutes: new Set(),
            coords: [],
          });
        }
        const data = complexData.get(complexId);
        data.allNames.add(name);
        routes.forEach(r => data.allRoutes.add(r));
        data.coords.push({ lat, lon });
      }
    }
  }

  const stations = [];
  for (const data of complexData.values()) {
    const totalCoords = data.coords.reduce((acc, curr) => ({ lat: acc.lat + curr.lat, lon: acc.lon + curr.lon }), { lat: 0, lon: 0 });
    const avgLat = totalCoords.lat / data.coords.length;
    const avgLon = totalCoords.lon / data.coords.length;

    stations.push({
      name: data.canonicalName,
      lat: avgLat,
      lon: avgLon,
      routes: Array.from(data.allRoutes).sort(),
      aliases: Array.from(data.allNames),
    });
  }
  return stations;
}

/**
 * A map to reconcile different names for the same station complex.
 * Maps an alias name to a canonical name.
 */
const STATION_NAME_ALIASES = new Map([
  // This map helps link station names that are part of the same complex but may have
  // different names in various data sources (e.g., the line paths vs. the station CSV).
  // The "canonical" name (the value) should ideally be the most common or official name for the complex.

  // --- Major Transfer Hubs & Renames ---

  // Times Square Complex
  ['42 St-Port Authority Bus Terminal', 'Times Sq-42 St'],

  // World Trade Center / Cortlandt Complex
  ['WTC Cortlandt', 'World Trade Center'], // Links 1 train to E train station
  ['Cortlandt St', 'World Trade Center'], // Links R,W trains to the complex
  // Note: 'Park Place' and 'Chambers St' are too ambiguous to merge globally.
  // The CSV 'Complex ID' is the more reliable way to group these.

  // Other Key Transfers
  ['168 St-Washington Hts', '168 St'],
  ['74 St-Broadway', 'Jackson Hts-Roosevelt Av'],
  ['Broadway-Lafayette St', 'Bleecker St'],
  ['4 Av-9 St', '9 St'],
  ['Court Sq-23 St', 'Court Sq'],
  ['Lexington Av/53 St', '51 St'],
  // The '59 St' alias is too broad, as there are multiple distinct 59 St stations.
  // We rely on the more specific 'Lexington Av/59 St' name for the 4/5/6/N/R/W complex.
  ['Metropolitan Av', 'Lorimer St'],
  ['Botanic Garden', 'Franklin Av-Medgar Evers College'],
  ['62 St', 'New Utrecht Av'],
  ['Junius St', 'Livonia Av'],
]);

/**
 * Maps subway route identifiers to their official MTA colors.
 */
const ROUTE_COLORS = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  'G': '#6CBE45',
  'J': '#996633', 'Z': '#996633',
  'L': '#A7A9AC',
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  'S': '#808183',
  'SIR': '#6D6E71',
};

/**
 * Provides the complete, ordered sequence of station names for each subway route.
 * This is used to draw accurate paths on the Leaflet map.
 */
const DETAILED_LINE_PATHS = {
  '1': ['Van Cortlandt Park-242 St', '238 St', '231 St', 'Marble Hill-225 St', '215 St', '207 St', 'Dyckman St', '191 St', '181 St', '168 St', '157 St', '145 St', '137 St-City College', '125 St', '116 St-Columbia University', 'Cathedral Pkwy (110 St)', '103 St', '96 St', '86 St', '79 St', '72 St', '66 St-Lincoln Center', '59 St-Columbus Circle', '50 St', 'Times Sq-42 St', '34 St-Penn Station', '28 St', '23 St', '18 St', '14 St-Union Sq', 'Christopher St-Stonewall', 'Houston St', 'Canal St', 'Franklin St', 'Chambers St', 'WTC Cortlandt', 'Rector St', 'South Ferry'],
  '2': ['Wakefield-241 St', 'Nereid Av', '233 St', '225 St', '219 St', 'Gun Hill Rd', 'Burke Av', 'Allerton Av', 'Pelham Pkwy', 'Bronx Park East', 'E 180 St', 'West Farms Sq-E Tremont Av', '174 St', 'Freeman St', 'Simpson St', 'Intervale Av', 'Prospect Av', 'Jackson Av', '3 Av-149 St', '149 St-Grand Concourse', '135 St', '125 St', '116 St', 'Central Park North (110 St)', '96 St', '86 St', '79 St', '72 St', 'Times Sq-42 St', '34 St-Penn Station', '14 St-Union Sq', 'Chambers St', 'Park Place', 'Fulton St', 'Wall St', 'Clark St', 'Borough Hall', 'Hoyt St', 'Nevins St', 'Atlantic Av-Barclays Ctr', 'Bergen St', 'Grand Army Plaza', 'Eastern Pkwy-Brooklyn Museum', 'Franklin Av-Medgar Evers College', 'President St-Medgar Evers College', 'Sterling St', 'Winthrop St', 'Church Av', 'Beverly Rd', 'Newkirk Av-Little Haiti', 'Flatbush Av-Brooklyn College'],
  '3': ['Harlem-148 St', '145 St', '135 St', '125 St', '116 St', 'Central Park North (110 St)', '96 St', '72 St', 'Times Sq-42 St', '34 St-Penn Station', '14 St-Union Sq', 'Chambers St', 'Park Place', 'Fulton St', 'Wall St', 'Clark St', 'Borough Hall', 'Hoyt St', 'Nevins St', 'Atlantic Av-Barclays Ctr', 'Grand Army Plaza', 'Eastern Pkwy-Brooklyn Museum', 'Franklin Av-Medgar Evers College', 'Nostrand Av', 'Kingston Av', 'Crown Hts-Utica Av', 'Sutter Av-Rutland Rd', 'Saratoga Av', 'Rockaway Av', 'Junius St', 'Pennsylvania Av', 'Van Siclen Av', 'New Lots Av'],
  '4': ['Woodlawn', 'Mosholu Pkwy', 'Bedford Park Blvd-Lehman College', 'Kingsbridge Rd', 'Fordham Rd', '183 St', 'Burnside Av', '176 St', 'Mt Eden Av', '170 St', '167 St', '161 St-Yankee Stadium', '149 St-Grand Concourse', '138 St-Grand Concourse', '125 St', '116 St', '110 St', '103 St', '96 St', '86 St', '77 St', '68 St-Hunter College', '59 St', '51 St', 'Grand Central-42 St', '14 St-Union Sq', 'Brooklyn Bridge-City Hall', 'Fulton St', 'Wall St', 'Bowling Green', 'Borough Hall', 'Nevins St', 'Atlantic Av-Barclays Ctr', 'Franklin Av-Medgar Evers College', 'Crown Hts-Utica Av'],
  '5': ['Eastchester-Dyre Av', 'Baychester Av', 'Gun Hill Rd', 'Pelham Pkwy', 'Morris Park', 'E 180 St', 'West Farms Sq-E Tremont Av', '174 St', 'Freeman St', 'Simpson St', 'Intervale Av', 'Prospect Av', 'Jackson Av', '3 Av-149 St', '149 St-Grand Concourse', '138 St-Grand Concourse', '125 St', '116 St', '110 St', '103 St', '96 St', '86 St', '77 St', '68 St-Hunter College', '59 St', '51 St', 'Grand Central-42 St', '14 St-Union Sq', 'Brooklyn Bridge-City Hall', 'Fulton St', 'Wall St', 'Bowling Green', 'Borough Hall', 'Nevins St', 'Atlantic Av-Barclays Ctr', 'Franklin Av-Medgar Evers College', 'President St-Medgar Evers College', 'Sterling St', 'Winthrop St', 'Church Av', 'Beverly Rd', 'Newkirk Av-Little Haiti', 'Flatbush Av-Brooklyn College'],
  '6': ['Pelham Bay Park', 'Buhre Av', 'Middletown Rd', 'Westchester Sq-E Tremont Av', 'Zerega Av', 'Castle Hill Av', 'Parkchester', 'St Lawrence Av', 'Elder Av', 'Whitlock Av', 'Hunts Point Av', 'Longwood Av', 'E 149 St', 'E 143 St-St Mary\'s St', 'Cypress Av', 'Brook Av', '3 Av-138 St', '125 St', '116 St', '110 St', '103 St', '96 St', '86 St', '77 St', '68 St-Hunter College', '59 St', '51 St', 'Grand Central-42 St', '33 St', '28 St', '23 St', '14 St-Union Sq', 'Astor Pl', 'Bleecker St', 'Spring St', 'Canal St', 'Brooklyn Bridge-City Hall'],
  '7': ['Flushing-Main St', 'Mets-Willets Point', '111 St', '103 St-Corona Plaza', 'Junction Blvd', '90 St-Elmhurst Av', '82 St-Jackson Hts', 'Jackson Hts-Roosevelt Av', '69 St', '61 St-Woodside', '52 St', '46 St-Bliss St', '40 St-Lowery St', '33 St-Rawson St', 'Queensboro Plaza', 'Court Sq', 'Hunters Point Av', 'Vernon Blvd-Jackson Av', 'Grand Central-42 St', '5 Av', 'Times Sq-42 St', '34 St-Hudson Yards'],
  'A': ['Inwood-207 St', 'Dyckman St', '190 St', '181 St', '175 St', '168 St', '163 St-Amsterdam Av', '155 St', '145 St', '125 St', '116 St', 'Cathedral Pkwy (110 St)', '103 St', '96 St', '86 St', '81 St-Museum of Natural History', '72 St', '59 St-Columbus Circle', '50 St', 'Times Sq-42 St', '34 St-Penn Station', '14 St', 'W 4 St-Wash Sq', 'Spring St', 'Canal St', 'Chambers St', 'Fulton St', 'High St', 'Jay St-MetroTech', 'Hoyt-Schermerhorn Sts', 'Nostrand Av', 'Kingston-Throop Avs', 'Utica Av', 'Ralph Av', 'Rockaway Av', 'Broadway Junction', 'Liberty Av', 'Van Siclen Av', 'Shepherd Av', 'Euclid Av', 'Grant Av', '80 St', '88 St', 'Rockaway Blvd', '104 St', '111 St', 'Ozone Park-Lefferts Blvd'],
  'C': ['168 St', '163 St-Amsterdam Av', '155 St', '145 St', '135 St', '125 St', '116 St', 'Cathedral Pkwy (110 St)', '103 St', '96 St', '86 St', '81 St-Museum of Natural History', '72 St', '59 St-Columbus Circle', '50 St', 'Times Sq-42 St', '34 St-Penn Station', '23 St', '14 St', 'W 4 St-Wash Sq', 'Spring St', 'Canal St', 'Chambers St', 'Fulton St', 'High St', 'Jay St-MetroTech', 'Hoyt-Schermerhorn Sts', 'Lafayette Av', 'Clinton-Washington Avs', 'Franklin Av', 'Nostrand Av', 'Kingston-Throop Avs', 'Utica Av', 'Ralph Av', 'Rockaway Av', 'Broadway Junction', 'Liberty Av', 'Van Siclen Av', 'Shepherd Av', 'Euclid Av'],
  'E': ['Jamaica Center-Parsons/Archer', 'Sutphin Blvd-Archer Av-JFK Airport', 'Jamaica-Van Wyck', 'Briarwood', 'Kew Gardens-Union Tpke', '75 Av', 'Forest Hills-71 Av', '67 Av', '63 Dr-Rego Park', 'Woodhaven Blvd', 'Grand Av-Newtown', 'Elmhurst Av', 'Jackson Hts-Roosevelt Av', '65 St', 'Northern Blvd', '46 St', 'Steinway St', '36 St', 'Queens Plaza', 'Court Sq', '51 St', '5 Av/53 St', '7 Av', '50 St', 'Times Sq-42 St', '34 St-Penn Station', '23 St', '14 St', 'W 4 St-Wash Sq', 'Spring St', 'Canal St', 'WTC Cortlandt'],
  'B': ['145 St', '135 St', '125 St', '116 St', 'Cathedral Pkwy (110 St)', '103 St', '96 St', '86 St', '81 St-Museum of Natural History', '72 St', '59 St-Columbus Circle', '7 Av', '47-50 Sts-Rockefeller Ctr', '42 St-Bryant Pk', '34 St-Herald Sq', 'W 4 St-Wash Sq', 'Broadway-Lafayette St', 'Grand St', 'DeKalb Av', 'Atlantic Av-Barclays Ctr', '7 Av', 'Prospect Park', 'Church Av', 'Newkirk Plaza', 'Avenue H', 'Avenue J', 'Avenue M', 'Kings Hwy', 'Sheepshead Bay', 'Brighton Beach'],
  'D': ['Norwood-205 St', 'Bedford Park Blvd', 'Kingsbridge Rd', 'Fordham Rd', '182-183 Sts', 'Tremont Av', '174-175 Sts', '170 St', '167 St', '161 St-Yankee Stadium', '155 St', '145 St', '125 St', '59 St-Columbus Circle', '7 Av', '47-50 Sts-Rockefeller Ctr', '42 St-Bryant Pk', '34 St-Herald Sq', 'W 4 St-Wash Sq', 'Broadway-Lafayette St', 'Grand St', 'DeKalb Av', 'Atlantic Av-Barclays Ctr', '9 St', 'Prospect Av', '25 St', '36 St', '9 Av', 'Fort Hamilton Pkwy', '50 St', '55 St', '62 St', '71 St', '79 St', '18 Av', '20 Av', 'Bay Pkwy', '25 Av', 'Bay 50 St', 'Coney Island-Stillwell Av'],
  'F': ['Jamaica-179 St', '169 St', 'Parsons Blvd', 'Sutphin Blvd', 'Briarwood', 'Kew Gardens-Union Tpke', '75 Av', 'Forest Hills-71 Av', 'Jackson Hts-Roosevelt Av', '21 St-Queensbridge', 'Roosevelt Island', 'Lexington Av/63 St', '57 St', '47-50 Sts-Rockefeller Ctr', '42 St-Bryant Pk', '34 St-Herald Sq', '23 St', '14 St', 'W 4 St-Wash Sq', 'Broadway-Lafayette St', '2 Av', 'Delancey St-Essex St', 'East Broadway', 'York St', 'Jay St-MetroTech', 'Bergen St', 'Carroll St', 'Smith-9 Sts', '4 Av-9 St', '7 Av', '15 St-Prospect Park', 'Fort Hamilton Pkwy', 'Church Av', 'Ditmas Av', '18 Av', 'Avenue I', 'Bay Pkwy', 'Avenue N', 'Avenue P', 'Kings Hwy', 'Avenue U', 'Avenue X', 'Neptune Av', 'W 8 St-NY Aquarium', 'Coney Island-Stillwell Av'],
  'M': ['Forest Hills-71 Av', '67 Av', '63 Dr-Rego Park', 'Woodhaven Blvd', 'Grand Av-Newtown', 'Elmhurst Av', 'Jackson Hts-Roosevelt Av', '65 St', 'Northern Blvd', '46 St', 'Steinway St', '36 St', 'Queens Plaza', 'Court Sq', '51 St', '5 Av/53 St', '47-50 Sts-Rockefeller Ctr', '42 St-Bryant Pk', '34 St-Herald Sq', '23 St', '14 St', 'W 4 St-Wash Sq', 'Broadway-Lafayette St', 'Delancey St-Essex St', 'Marcy Av', 'Hewes St', 'Lorimer St', 'Flushing Av', 'Myrtle Av', 'Central Av', 'Knickerbocker Av', 'Myrtle-Wyckoff Avs', 'Seneca Av', 'Forest Av', 'Fresh Pond Rd', 'Middle Village-Metropolitan Av'],
  'G': ['Court Sq', '21 St', 'Greenpoint Av', 'Nassau Av', 'Metropolitan Av', 'Broadway', 'Flushing Av', 'Myrtle-Willoughby Avs', 'Bedford-Nostrand Avs', 'Classon Av', 'Clinton-Washington Avs', 'Fulton St', 'Hoyt-Schermerhorn Sts', 'Bergen St', 'Carroll St', 'Smith-9 Sts', '4 Av-9 St', '7 Av', '15 St-Prospect Park', 'Fort Hamilton Pkwy', 'Church Av'],
  'J': ['Jamaica Center-Parsons/Archer', 'Sutphin Blvd-Archer Av-JFK Airport', '121 St', '111 St', '104 St', 'Woodhaven Blvd', '85 St-Forest Pkwy', '75 St-Elderts Ln', 'Cypress Hills', 'Crescent St', 'Norwood Av', 'Cleveland St', 'Van Siclen Av', 'Alabama Av', 'Broadway Junction', 'Chauncey St', 'Halsey St', 'Gates Av', 'Kosciuszko St', 'Myrtle Av', 'Flushing Av', 'Lorimer St', 'Hewes St', 'Marcy Av', 'Delancey St-Essex St', 'Bowery', 'Canal St', 'Chambers St', 'Fulton St', 'Broad St'],
  'Z': ['Jamaica Center-Parsons/Archer', 'Sutphin Blvd-Archer Av-JFK Airport', '121 St', '104 St', 'Woodhaven Blvd', '75 St-Elderts Ln', 'Crescent St', 'Norwood Av', 'Van Siclen Av', 'Alabama Av', 'Broadway Junction', 'Chauncey St', 'Gates Av', 'Myrtle Av', 'Marcy Av', 'Delancey St-Essex St', 'Bowery', 'Canal St', 'Chambers St', 'Fulton St', 'Broad St'],
  'L': ['8 Av', '6 Av', '14 St-Union Sq', '3 Av', '1 Av', 'Bedford Av', 'Lorimer St', 'Graham Av', 'Grand St', 'Montrose Av', 'Morgan Av', 'Jefferson St', 'DeKalb Av', 'Myrtle-Wyckoff Avs', 'Halsey St', 'Wilson Av', 'Bushwick Av-Aberdeen St', 'Broadway Junction', 'Atlantic Av', 'Sutter Av', 'Livonia Av', 'New Lots Av', 'East 105 St', 'Canarsie-Rockaway Pkwy'],
  'N': ['Astoria-Ditmars Blvd', 'Astoria Blvd', '30 Av', 'Broadway', '36 Av', '39 Av-Dutch Kills', 'Queensboro Plaza', 'Lexington Av/59 St', '5 Av/59 St', '57 St-7 Av', '49 St', 'Times Sq-42 St', '34 St-Herald Sq', '28 St', '23 St', '14 St-Union Sq', '8 St-NYU', 'Prince St', 'Canal St', 'City Hall', 'Cortlandt St', 'Rector St', 'Whitehall St-South Ferry', 'DeKalb Av', 'Atlantic Av-Barclays Ctr', '36 St', '9 St', 'Prospect Av', '25 St', '53 St', '59 St', '8 Av', 'Fort Hamilton Pkwy', 'New Utrecht Av', '18 Av', '20 Av', 'Bay Pkwy', 'Kings Hwy', 'Avenue U', '86 St', 'Coney Island-Stillwell Av'],
  'Q': ['96 St', '86 St', '72 St', 'Lexington Av/63 St', '57 St-7 Av', '49 St', 'Times Sq-42 St', '34 St-Herald Sq', '28 St', '23 St', '14 St-Union Sq', 'Canal St', 'DeKalb Av', 'Atlantic Av-Barclays Ctr', '7 Av', 'Prospect Park', 'Parkside Av', 'Church Av', 'Beverley Rd', 'Cortelyou Rd', 'Newkirk Plaza', 'Avenue H', 'Avenue J', 'Avenue M', 'Kings Hwy', 'Avenue U', 'Neck Rd', 'Sheepshead Bay', 'Brighton Beach', 'Ocean Pkwy', 'W 8 St-NY Aquarium', 'Coney Island-Stillwell Av'],
  'R': ['Forest Hills-71 Av', '67 Av', '63 Dr-Rego Park', 'Woodhaven Blvd', 'Grand Av-Newtown', 'Elmhurst Av', 'Jackson Hts-Roosevelt Av', '65 St', 'Northern Blvd', '46 St', 'Steinway St', '36 St', 'Queens Plaza', 'Lexington Av/59 St', '5 Av/59 St', '57 St-7 Av', '49 St', 'Times Sq-42 St', '34 St-Herald Sq', '28 St', '23 St', '14 St-Union Sq', '8 St-NYU', 'Prince St', 'Canal St', 'City Hall', 'Cortlandt St', 'Rector St', 'Whitehall St-South Ferry', 'Court St', 'Jay St-MetroTech', 'DeKalb Av', 'Atlantic Av-Barclays Ctr', 'Union St', '9 St', 'Prospect Av', '25 St', '36 St', '45 St', '53 St', '59 St', 'Bay Ridge Av', '77 St', '86 St', 'Bay Ridge-95 St'],
  'W': ['Astoria-Ditmars Blvd', 'Astoria Blvd', '30 Av', 'Broadway', '36 Av', '39 Av-Dutch Kills', 'Queensboro Plaza', 'Lexington Av/59 St', '5 Av/59 St', '57 St-7 Av', '49 St', 'Times Sq-42 St', '34 St-Herald Sq', '28 St', '23 St', '14 St-Union Sq', '8 St-NYU', 'Prince St', 'Canal St', 'City Hall', 'Cortlandt St', 'Rector St', 'Whitehall St-South Ferry'],
  'S_FRANKLIN': ['Franklin Av', 'Park Pl', 'Botanic Garden', 'Prospect Park'],
  'S_ROCKAWAY': ['Broad Channel', 'Beach 90 St', 'Beach 98 St', 'Beach 105 St', 'Rockaway Park-Beach 116 St'],
  'S_TIMES_SQ': ['Times Sq-42 St', 'Grand Central-42 St'],
  'SIR': ['St George', 'Tompkinsville', 'Stapleton', 'Clifton', 'Grasmere', 'Old Town', 'Dongan Hills', 'Jefferson Av', 'Grant City', 'New Dorp', 'Oakwood Heights', 'Bay Terrace', 'Great Kills', 'Eltingville', 'Annadale', 'Huguenot', 'Prince\'s Bay', 'Pleasant Plains', 'Richmond Valley', 'Arthur Kill', 'Tottenville'],
};

/**
 * Draws all subway lines on the map by connecting stations based on the detailed
 * line path data.
 * @param {L.Map} map The Leaflet map instance.
 * @param {Array<{name: string, lat: number, lon: number, routes: string[]}>} stations Parsed station data.
 */
function _plotAllSubwayLines(map, stations) {
  // Create a comprehensive lookup map from ANY station name/alias to its coordinates.
  const stationCoords = new Map();
  stations.forEach(station => {
    const coords = { lat: station.lat, lon: station.lon };
    // Add all known aliases from the CSV for this complex.
    station.aliases.forEach(alias => {
      stationCoords.set(alias, coords);
    });
  });

  // Layer manual aliases on top as a fallback.
  // This makes the lookup more robust by linking known name variations.
  STATION_NAME_ALIASES.forEach((canonicalName, alias) => {
    const canonicalCoords = stationCoords.get(canonicalName);
    const aliasCoords = stationCoords.get(alias);

    if (canonicalCoords && !aliasCoords) {
      // The CSV name is the canonical one, map the alias to it.
      stationCoords.set(alias, canonicalCoords);
    } else if (aliasCoords && !canonicalCoords) {
      // The CSV name is the alias, map the canonical name to it.
      stationCoords.set(canonicalName, aliasCoords);
    }
  });

  if (!_linesLayer) _linesLayer = window.L.layerGroup().addTo(map);
  _linesLayer.clearLayers();

  for (const routeId in DETAILED_LINE_PATHS) {
    const stationNameSequence = DETAILED_LINE_PATHS[routeId];
    const color = ROUTE_COLORS[routeId.split('_')[0]] || '#888'; // Handle 'S_FRANKLIN' etc.

    const linePathCoords = stationNameSequence
      .map(stationName => stationCoords.get(stationName))
      .filter(Boolean); // Filter out any stations that weren't found

    if (linePathCoords.length > 1) {
      window.L.polyline(linePathCoords, {
        color: color,
        weight: 2.5,
        opacity: 0.7
      }).addTo(_linesLayer);
    }
  }
}

/**
 * Fetches and plots all subway stations on the Leaflet map.
 * @param {L.Map} map
 */
async function _plotAllStations(map) {
  if (_stationsLoaded) return;

  try {
    const res = await fetch('/nyc_subway_stations.csv');
    if (!res.ok) throw new Error(`Failed to fetch stations: ${res.status}`);
    const csvText = await res.text();
    const stations = _parseStationsCSV(csvText);

    const stationsLayer = window.L.layerGroup();

    // Create a single, simple icon for all stations
    const stationIcon = window.L.divIcon({
      className: 'station-marker',
      html: `<div style="width:8px;height:8px;border-radius:50%;background:#999;border:1px solid #111;"></div>`,
      iconSize: [8, 8],
      iconAnchor: [4, 4],
    });

    stations.forEach(station => {
      const uniqueRoutes = [...new Set(station.routes)].sort();
      const badgeSize = 14;

      const routeBadges = uniqueRoutes
        .map(route => {
          const color = ROUTE_COLORS[route] || '#888';
          // Yellow backgrounds need dark text for readability
          const textColor = ['N', 'Q', 'R', 'W'].includes(route) ? '#000' : '#FFF';
          const fontSize = route.length > 2 ? '7px' : '8px'; // Smaller font for 'SIR'
          return `<div style="width:${badgeSize}px;height:${badgeSize}px;border-radius:50%;background-color:${color};color:${textColor};font-size:${fontSize};font-weight:bold;line-height:${badgeSize}px;text-align:center;font-family:sans-serif;">${route}</div>`;
        })
        .join('');

      // Create popup content with station name and route badges
      const popupContent = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <strong>${station.name}</strong>
          ${uniqueRoutes.length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;">${routeBadges}</div>`
            : ''
          }
        </div>
      `;

      window.L.marker([station.lat, station.lon], { icon: stationIcon })
        .bindPopup(popupContent)
        .addTo(stationsLayer);
    });

    // Draw all the subway lines on the map permanently.
    _plotAllSubwayLines(map, stations);

    stationsLayer.addTo(map);
    _stationsLoaded = true; // Set true only on success
  } catch (error) {
    console.error('Error plotting stations:', error);
  }
}

/**
 * Initialize (or reinitialize) the Leaflet street map.
 * Called lazily when the user switches to the Street Map tab.
 *
 * @param {string} containerId - ID of the map container div
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} destLat
 * @param {number} destLng
 * @param {string} destName
 * @param {string | null} [overviewPolyline] - Optional encoded polyline for the route.
 */
export function initLeafletMap(containerId, userLat, userLng, destLat, destLng, destName, overviewPolyline) {
  if (!window.L) {
    console.warn('[map.js] Leaflet is not loaded. Make sure the Leaflet script tag is present in index.html.');
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) return;

  // Destroy previous instance if container was already initialized
  if (_leafletMap) {
    _leafletMap.remove();
    _leafletMap = null;
    _routeLayer = null;
    _linesLayer = null; // This will be recreated
  }

  const routeCoords = _decodePolyline(overviewPolyline);
  let bounds;

  if (routeCoords.length > 0) {
    // If we have a detailed route, bounds encompass the whole route.
    bounds = window.L.latLngBounds(routeCoords).pad(0.1);
  } else {
    // Otherwise, just fit the user and destination.
    bounds = window.L.latLngBounds([
      [userLat, userLng],
      [destLat, destLng],
    ]).pad(0.15);
  }
  
  _leafletMap = window.L.map(containerId, {
    zoomControl: true,
    attributionControl: true,
  }).fitBounds(bounds);

  // Initialize layer for subway lines
  _linesLayer = window.L.layerGroup().addTo(_leafletMap);

  // Dark-themed tile layer (CartoDB Dark Matter)
  window.L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(_leafletMap);

  // Plot all stations from CSV
  _plotAllStations(_leafletMap);

  // User marker
  const userIcon = window.L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#a7a9ac;border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(167,169,172,0.3);">
    </div>`,
    iconAnchor: [7, 7],
  });

  // Destination marker
  const destIcon = window.L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:#f7c948;border:3px solid #fff;
      box-shadow:0 0 0 5px rgba(247,201,72,0.3);">
    </div>`,
    iconAnchor: [9, 9],
  });

  window.L.marker([userLat, userLng], { icon: userIcon })
    .addTo(_leafletMap)
    .bindPopup('You are here');

  window.L.marker([destLat, destLng], { icon: destIcon })
    .addTo(_leafletMap)
    .bindPopup(`<strong>${destName}</strong>`)
    .openPopup();

  // Draw route polyline
  if (_routeLayer) _routeLayer.remove();

  if (routeCoords.length > 0) {
    // If we have a detailed route, draw it.
    _routeLayer = window.L.polyline(routeCoords, { color: '#f7c948', weight: 4, opacity: 0.9 }).addTo(_leafletMap);
  }
  // Per user request, do not draw a straight line if no polyline is available.
}
