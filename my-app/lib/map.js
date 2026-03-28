/**
 * map.js
 * Map rendering and routing for Subway Quest.
 *
 * Two layers:
 *  1. SVG Schematic — an inline, animated NYC subway schematic map.
 *  2. Leaflet Street Map — real tile-based street view.
 *
 * Google Maps Directions API integration is stubbed; replace
 * GOOGLE_MAPS_DIRECTIONS_STUB with a real fetch() call once
 * a key is provisioned in .env.
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
 * @typedef {{ steps: DirectionStep[], durationMinutes: number, distanceKm: number }} DirectionsResult
 * @typedef {{ instruction: string, icon: string, durationMin: number, type: 'walk'|'subway'|'transfer' }} DirectionStep
 */
export async function getDirections(originLat, originLng, destLat, destLng) {
  // ── STUB: remove block below and uncomment the fetch() call. ──────
  console.info('[map.js] getDirections() — using stub data. Provide GOOGLE_MAPS_API_KEY to use live routing.');

  // Simulate network latency
  await new Promise(r => setTimeout(r, 400));

  // Return plausible synthetic directions
  return _buildStubDirections(originLat, originLng, destLat, destLng);

  /*
  // ── LIVE implementation (uncomment when key is ready) ─────────────
  const key = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY ?? window.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY is not set. See .env.example.');

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${originLat},${originLng}`);
  url.searchParams.set('destination', `${destLat},${destLng}`);
  url.searchParams.set('mode', 'transit');
  url.searchParams.set('transit_mode', 'subway');
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Directions API error: ${res.status}`);
  const data = await res.json();

  return _parseGoogleDirectionsResponse(data);
  */
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
  if (!leg) throw new Error('No route found in Directions API response.');

  const steps = leg.steps.map(step => {
    const isTransit = step.travel_mode === 'TRANSIT';
    const isWalk    = step.travel_mode === 'WALKING';

    return {
      type: isTransit ? 'subway' : isWalk ? 'walk' : 'transfer',
      icon: isTransit ? '🚇' : isWalk ? '🚶' : '↔',
      instruction: step.html_instructions.replace(/<[^>]+>/g, ''),
      durationMin: Math.round((step.duration?.value ?? 0) / 60),
      lineName: step.transit_details?.line?.short_name ?? null,
      lineColor: step.transit_details?.line?.color ?? null,
    };
  });

  return {
    steps,
    durationMinutes: Math.round((leg.duration?.value ?? 0) / 60),
    distanceKm: (leg.distance?.value ?? 0) / 1000,
  };
}

/**
 * Build synthetic directions when the real API is not available.
 * @private
 */
function _buildStubDirections(oLat, oLng, dLat, dLng) {
  const diffLat = Math.abs(dLat - oLat);
  const diffLng = Math.abs(dLng - oLng);
  const approxKm = Math.sqrt(diffLat ** 2 + diffLng ** 2) * 111;
  const approxMin = Math.round(8 + (approxKm / 28) * 60);

  const walkDirection = dLng < oLng ? 'west' : 'east';
  const boardDirection = dLat > oLat ? 'uptown' : 'downtown';

  return {
    durationMinutes: approxMin,
    distanceKm: approxKm,
    steps: [
      {
        type: 'walk',
        icon: '🚶',
        instruction: `Walk ${walkDirection} to the nearest subway entrance`,
        durationMin: 3,
        lineName: null,
        lineColor: null,
      },
      {
        type: 'subway',
        icon: '🚇',
        instruction: `Board a ${boardDirection} train`,
        durationMin: approxMin - 6,
        lineName: null,
        lineColor: null,
      },
      {
        type: 'walk',
        icon: '🚶',
        instruction: `Exit and walk to destination`,
        durationMin: 3,
        lineName: null,
        lineColor: null,
      },
    ],
  };
}

// ─── Direction step renderer ──────────────────────────────

/**
 * Render step-by-step directions into a <ol> element.
 * @param {DirectionStep[]} steps
 * @param {HTMLOListElement} listEl
 */
export function renderDirections(steps, listEl) {
  listEl.innerHTML = '';
  steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = `direction-step direction-step--${step.type}`;
    li.innerHTML = `
      <span class="step-num">${i + 1}</span>
      <span class="step-icon" aria-hidden="true">${step.icon}</span>
      <span class="step-text">${step.instruction}</span>
      ${step.durationMin > 0 ? `<span class="step-duration">${step.durationMin}m</span>` : ''}
    `;
    listEl.appendChild(li);
  });
}

// ─── SVG Schematic Map ────────────────────────────────────

/**
 * The schematic SVG node positions and line paths.
 * Keys match the `svgNodeId` field in stations.js.
 *
 * Coordinate space: 900×650 viewBox.
 * X → west (0) to east (900)
 * Y → north (0) to south (650)
 */

const SVG_NODES = {
  // Manhattan (x: 230–350, y: 30–470)
  'n-inwood':         [238, 38],
  'n-dyckman':        [240, 55],
  'n-181-a':          [243, 72],
  'n-168':            [248, 95],
  'n-145-abcd':       [255, 120],
  'n-145':            [255, 120],
  'n-125-abcd':       [264, 152],
  'n-125-456':        [308, 145],
  'n-116':            [268, 175],
  'n-96':             [272, 208],
  'n-81-museum':      [278, 225],
  'n-72':             [278, 242],
  'n-59-cc':          [282, 262],
  'n-times-sq':       [298, 292],
  'n-grand-central':  [352, 292],
  'n-penn':           [288, 314],
  'n-herald':         [315, 314],
  'n-23-ce':          [282, 336],
  'n-union-sq':       [320, 358],
  'n-canal':          [292, 402],
  'n-fulton':         [310, 428],
  'n-wtc':            [285, 432],
  'n-south-ferry':    [300, 462],
  // Bronx (x: 290–650, y: 0–130)
  'n-yankee':         [310, 110],
  'n-149-gc':         [320, 130],
  'n-fordham':        [395, 65],
  'n-pelham-bay':     [640, 52],
  'n-woodlawn':       [480, 20],
  // Brooklyn (x: 160–560, y: 480–650)
  'n-atlantic':       [345, 495],
  'n-jay-st':         [298, 510],
  'n-bedford':        [405, 482],
  'n-7ave-ps':        [338, 540],
  'n-flatbush':       [382, 590],
  'n-coney':          [310, 645],
  'n-brighton':       [368, 645],
  'n-bay-ridge':      [238, 638],
  'n-howard-beach':   [188, 610],
  'n-canarsie':       [530, 535],
  // Queens (x: 390–780, y: 60–410)
  'n-flushing':       [742, 248],
  'n-jackson-heights':[528, 290],
  'n-astoria-ditmars':[490, 105],
  'n-court-sq':       [420, 290],
  'n-jamaica':        [758, 370],
  'n-forest-hills':   [640, 365],
  'n-mets':           [640, 245],
  'n-far-rock':       [760, 620],
  'n-rockaway-park':  [760, 645],
  // Staten Island (x: 60–220, y: 440–650)
  'n-st-george':      [115, 455],
  'n-stapleton':      [110, 490],
  'n-tottenville':    [65, 648],
};

/**
 * SVG line path definitions.
 * Each entry: { id, color, label, nodeSequence }
 * nodeSequence is an ordered array of SVG_NODES keys to connect.
 */
const SVG_LINES = [
  {
    id: 'line-red',
    label: '1·2·3',
    color: '#EE352E',
    nodeSequence: [
      'n-inwood', 'n-168', 'n-145', 'n-125-abcd', 'n-116', 'n-96',
      'n-72', 'n-59-cc', 'n-times-sq', 'n-penn', 'n-union-sq',
      'n-canal', 'n-fulton', 'n-south-ferry',
    ],
  },
  {
    id: 'line-red-bk',
    label: '2·3 Brooklyn',
    color: '#EE352E',
    nodeSequence: [
      'n-fulton', 'n-atlantic', 'n-7ave-ps', 'n-flatbush',
    ],
  },
  {
    id: 'line-red-bronx',
    label: '2·5 Bronx',
    color: '#EE352E',
    nodeSequence: [
      'n-125-456', 'n-149-gc', 'n-yankee',
    ],
  },
  {
    id: 'line-green',
    label: '4·5·6',
    color: '#00933C',
    nodeSequence: [
      'n-woodlawn', 'n-fordham', 'n-149-gc', 'n-yankee',
      'n-125-456', 'n-grand-central', 'n-union-sq',
      'n-fulton', 'n-atlantic',
    ],
  },
  {
    id: 'line-green-6',
    label: '6 Pelham',
    color: '#00933C',
    nodeSequence: [
      'n-grand-central', 'n-125-456', 'n-149-gc', 'n-pelham-bay',
    ],
  },
  {
    id: 'line-blue',
    label: 'A·C·E',
    color: '#0039A6',
    nodeSequence: [
      'n-inwood', 'n-168', 'n-145-abcd', 'n-125-abcd',
      'n-59-cc', 'n-times-sq', 'n-penn', 'n-23-ce',
      'n-canal', 'n-wtc', 'n-fulton', 'n-jay-st',
      'n-atlantic', 'n-howard-beach', 'n-far-rock',
    ],
  },
  {
    id: 'line-orange',
    label: 'B·D·F·M',
    color: '#FF6319',
    nodeSequence: [
      'n-yankee', 'n-fordham', 'n-145-abcd', 'n-125-abcd',
      'n-81-museum', 'n-59-cc', 'n-herald', 'n-union-sq',
      'n-jay-st', 'n-atlantic', 'n-7ave-ps', 'n-coney',
    ],
  },
  {
    id: 'line-orange-f',
    label: 'F Queens',
    color: '#FF6319',
    nodeSequence: [
      'n-jackson-heights', 'n-court-sq', 'n-herald',
      'n-jay-st', 'n-7ave-ps', 'n-coney',
    ],
  },
  {
    id: 'line-yellow',
    label: 'N·Q·R·W',
    color: '#FCCC0A',
    nodeSequence: [
      'n-astoria-ditmars', 'n-court-sq', 'n-times-sq',
      'n-herald', 'n-union-sq', 'n-canal', 'n-atlantic',
      'n-7ave-ps', 'n-brighton', 'n-coney',
    ],
  },
  {
    id: 'line-yellow-r',
    label: 'R Bay Ridge',
    color: '#FCCC0A',
    nodeSequence: [
      'n-jay-st', 'n-atlantic', 'n-bay-ridge',
    ],
  },
  {
    id: 'line-purple',
    label: '7 Flushing',
    color: '#B933AD',
    nodeSequence: [
      'n-flushing', 'n-mets', 'n-jackson-heights', 'n-court-sq', 'n-times-sq',
    ],
  },
  {
    id: 'line-gray',
    label: 'L Canarsie',
    color: '#A7A9AC',
    nodeSequence: [
      'n-canarsie', 'n-bedford', 'n-union-sq',
    ],
  },
  {
    id: 'line-a-rockaway',
    label: 'A Rockaway',
    color: '#0039A6',
    nodeSequence: [
      'n-howard-beach', 'n-far-rock',
    ],
  },
  {
    id: 'line-a-rockaway-s',
    label: 'A·S Rockaway Park',
    color: '#0039A6',
    nodeSequence: [
      'n-far-rock', 'n-rockaway-park',
    ],
  },
  {
    id: 'line-sir',
    label: 'SIR',
    color: '#6D6E71',
    nodeSequence: [
      'n-st-george', 'n-stapleton', 'n-tottenville',
    ],
  },
];

// ─── SVG builder ──────────────────────────────────────────

/**
 * Generate the complete SVG markup for the schematic map.
 * @returns {string} SVG element as an HTML string
 */
function buildSchematicSVG() {
  const W = 900, H = 650;

  // Build polyline path string for a line
  const lineToPoints = (nodeSeq) =>
    nodeSeq
      .map(id => SVG_NODES[id] ?? null)
      .filter(Boolean)
      .map(([x, y]) => `${x},${y}`)
      .join(' ');

  // Line paths
  const linePaths = SVG_LINES.map(line => {
    const points = lineToPoints(line.nodeSequence);
    if (!points) return '';
    return `<polyline
      id="${line.id}"
      class="subway-line"
      points="${points}"
      stroke="${line.color}"
      stroke-width="3.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
      opacity="0.75"
    />`;
  }).join('\n    ');

  // Station nodes (circles)
  const stationDots = Object.entries(SVG_NODES).map(([id, [x, y]]) => {
    return `<circle
      id="${id}"
      class="station-dot"
      cx="${x}" cy="${y}" r="4"
      fill="#1c1c1c"
      stroke="#444"
      stroke-width="1.5"
    />`;
  }).join('\n    ');

  // Labels for major interchange stations
  const LABELS = [
    ['n-times-sq',      'Times Sq',        -1,   8],
    ['n-grand-central', 'Grand Central',     1,   8],
    ['n-union-sq',      'Union Sq',          1,   8],
    ['n-atlantic',      'Atlantic',          1,   8],
    ['n-59-cc',         'Columbus Circle',  -1,  -8],
    ['n-125-abcd',      '125 St',           -1,   8],
    ['n-168',           '168 St',           -1,   8],
    ['n-flushing',      'Flushing',          1,   8],
    ['n-jamaica',       'Jamaica',           1,   8],
    ['n-coney',         'Coney Island',      0,  14],
    ['n-far-rock',      'Far Rockaway',      1,   8],
    ['n-st-george',     'St George',        -1,   8],
    ['n-woodlawn',      'Woodlawn',          1, -10],
    ['n-astoria-ditmars','Astoria',          1,  -8],
    ['n-jay-st',        'Jay St',           -1,   8],
    ['n-jackson-heights','Jackson Hts',      1,   8],
    ['n-penn',          '34 St Penn',       -1,   8],
    ['n-fulton',        'Fulton St',         1,   8],
    ['n-pelham-bay',    'Pelham Bay',        1,   8],
    ['n-canarsie',      'Canarsie',          1,   8],
    ['n-forest-hills',  'Forest Hills',      1,   8],
  ];

  const labels = LABELS.map(([nodeId, text, anchorDir, dy]) => {
    const pos = SVG_NODES[nodeId];
    if (!pos) return '';
    const [x, y] = pos;
    const anchor = anchorDir === -1 ? 'end' : anchorDir === 1 ? 'start' : 'middle';
    const dx = anchorDir === -1 ? -8 : anchorDir === 1 ? 8 : 0;
    return `<text
      x="${x + dx}" y="${y + dy}"
      class="station-label"
      text-anchor="${anchor}"
      fill="#6b6b6b"
      font-size="8.5"
      font-family="DM Mono, monospace"
      letter-spacing="0.3"
    >${text}</text>`;
  }).join('\n    ');

  // Borough labels
  const boroughLabels = [
    [270, 530, 'MANHATTAN'],
    [350, 590, 'BROOKLYN'],
    [580, 190, 'QUEENS'],
    [400, 70,  'THE BRONX'],
    [105, 480, 'SI'],
  ].map(([x, y, text]) =>
    `<text x="${x}" y="${y}" class="borough-label" text-anchor="middle"
      fill="#282828" font-size="13" font-weight="bold"
      font-family="Bebas Neue, sans-serif" letter-spacing="2"
    >${text}</text>`
  ).join('\n    ');

  // Route highlight overlay (populated by showRoute())
  const routeOverlay = `
    <g id="route-overlay" style="pointer-events:none">
      <polyline
        id="route-path"
        points=""
        stroke="#f7c948"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
        opacity="0"
        stroke-dasharray="8 6"
      />
      <circle id="route-origin-dot" cx="0" cy="0" r="8"
        fill="#f7c948" opacity="0" />
      <circle id="route-dest-dot" cx="0" cy="0" r="8"
        fill="#f7c948" opacity="0">
        <animate attributeName="r" values="6;10;6" dur="1.8s" repeatCount="indefinite"/>
      </circle>
    </g>`;

  return `<svg
  viewBox="0 0 ${W} ${H}"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="NYC Subway schematic map"
  style="width:100%;height:100%;background:#0d0d0d;"
>
  <defs>
    <style>
      .subway-line { transition: opacity 0.3s; }
      .subway-line.dimmed { opacity: 0.12; }
      .station-dot { transition: fill 0.25s, stroke 0.25s; }
      .station-dot.highlighted { fill: #f7c948; stroke: #fff; r: 6; }
      @keyframes dash-march {
        to { stroke-dashoffset: -28; }
      }
      #route-path.animating {
        animation: dash-march 0.6s linear infinite;
      }
    </style>
  </defs>

  <!-- Borough background labels -->
  ${boroughLabels}

  <!-- Subway lines -->
  <g id="lines-layer">
    ${linePaths}
  </g>

  <!-- Station dots -->
  <g id="nodes-layer">
    ${stationDots}
  </g>

  <!-- Station labels -->
  <g id="labels-layer">
    ${labels}
  </g>

  <!-- Route overlay -->
  ${routeOverlay}
</svg>`;
}

// ─── Public: init and render ──────────────────────────────

/**
 * Inject the SVG schematic into a container element.
 * @param {HTMLElement} containerEl
 */
export function initSchematicMap(containerEl) {
  containerEl.innerHTML = buildSchematicSVG();
}

/**
 * Animate a route on the schematic SVG.
 * Dims all lines not part of the route and overlays an animated
 * dashed path from the origin node to the destination node.
 *
 * @param {string|null} originNodeId   - svgNodeId from stations.js (or null for user location)
 * @param {string}      destNodeId     - svgNodeId of destination station
 * @param {string[]}    [lineIds]      - IDs of SVG_LINES to keep highlighted (optional)
 */
export function showSchematicRoute(originNodeId, destNodeId, lineIds = []) {
  const svg = document.querySelector('#svg-container svg');
  if (!svg) return;

  // Determine origin SVG coords (use a mid-Manhattan default if unknown)
  const originCoords = originNodeId ? SVG_NODES[originNodeId] : [298, 360];
  const destCoords   = SVG_NODES[destNodeId];
  if (!destCoords) return;

  // Build route polyline points (straight line — real routing uses Directions API)
  const routePath = svg.querySelector('#route-path');
  const originDot = svg.querySelector('#route-origin-dot');
  const destDot   = svg.querySelector('#route-dest-dot');

  if (!routePath || !originDot || !destDot) return;

  routePath.setAttribute('points', `${originCoords[0]},${originCoords[1]} ${destCoords[0]},${destCoords[1]}`);
  routePath.setAttribute('opacity', '1');
  routePath.classList.add('animating');

  originDot.setAttribute('cx', originCoords[0]);
  originDot.setAttribute('cy', originCoords[1]);
  originDot.setAttribute('opacity', '1');

  destDot.setAttribute('cx', destCoords[0]);
  destDot.setAttribute('cy', destCoords[1]);
  destDot.setAttribute('opacity', '1');

  // Highlight destination node
  const allDots = svg.querySelectorAll('.station-dot');
  allDots.forEach(dot => dot.classList.remove('highlighted'));
  const destDotEl = svg.querySelector(`#${destNodeId}`);
  if (destDotEl) destDotEl.classList.add('highlighted');

  // Dim non-relevant lines (if lineIds provided)
  if (lineIds.length > 0) {
    const allLines = svg.querySelectorAll('.subway-line');
    allLines.forEach(line => {
      const relevant = lineIds.some(id => line.id === id || line.id.startsWith(id));
      line.classList.toggle('dimmed', !relevant);
    });
  }
}

/**
 * Clear any active route from the schematic.
 */
export function clearSchematicRoute() {
  const svg = document.querySelector('#svg-container svg');
  if (!svg) return;

  const routePath = svg.querySelector('#route-path');
  const originDot = svg.querySelector('#route-origin-dot');
  const destDot   = svg.querySelector('#route-dest-dot');

  if (routePath) { routePath.setAttribute('opacity', '0'); routePath.classList.remove('animating'); }
  if (originDot) originDot.setAttribute('opacity', '0');
  if (destDot)   destDot.setAttribute('opacity', '0');

  svg.querySelectorAll('.station-dot').forEach(d => d.classList.remove('highlighted'));
  svg.querySelectorAll('.subway-line').forEach(l => l.classList.remove('dimmed'));
}

// ─── Leaflet Street Map ───────────────────────────────────

let _leafletMap = null;
let _routeLayer = null;

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
 */
export function initLeafletMap(containerId, userLat, userLng, destLat, destLng, destName) {
  if (!window.L) {
    console.warn('[map.js] Leaflet is not loaded. Make sure the Leaflet script tag is present in index.html.');
    return;
  }

  // Enable Leaflet CSS
  const leafletCss = document.getElementById('leaflet-css');
  if (leafletCss) leafletCss.removeAttribute('disabled');

  const container = document.getElementById(containerId);
  if (!container) return;

  // Destroy previous instance if container was already initialized
  if (_leafletMap) {
    _leafletMap.remove();
    _leafletMap = null;
    _routeLayer = null;
  }

  // Fit bounds to encompass both user and destination
  const bounds = window.L.latLngBounds([
    [userLat, userLng],
    [destLat, destLng],
  ]).pad(0.15);

  _leafletMap = window.L.map(containerId, {
    zoomControl: true,
    attributionControl: true,
  }).fitBounds(bounds);

  // Dark-themed tile layer (CartoDB Dark Matter)
  window.L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(_leafletMap);

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

  // Draw straight-line route (replace with decoded polyline from Directions API)
  _routeLayer = window.L.polyline(
    [[userLat, userLng], [destLat, destLng]],
    { color: '#f7c948', weight: 3, dashArray: '8, 8', opacity: 0.8 }
  ).addTo(_leafletMap);
}
