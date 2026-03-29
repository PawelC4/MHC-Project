/**
 * lib/main.js
 * Subway Quest — application entry point and state manager.
 * Exported as init() and called from app/components/SubwayQuestApp.tsx
 * after the React component mounts (client-side only).
 */

import { generateAdventure } from './adventure.js';
import {
  getDirections,
  renderDirections,
  initSchematicMap,
  showSchematicRoute,
  clearSchematicRoute,
  initLeafletMap,
} from './map.js';
import {
  initPhotoUpload,
  resetPhotoUpload,
  verifyPhoto,
  readFileAsBase64,
} from './photo.js';

// ─── App State ────────────────────────────────────────────

const state = {
  userLat: null,
  userLng: null,
  adventure: null,
  pendingPhotoFile: null,
  pendingPhotoDataUrl: null,
  xp: 0,
  questsCompleted: 0,
  completedStationIds: [],
  schematicReady: false,
  leafletReady: false,
};

// ─── Persistence ──────────────────────────────────────────

function loadPersistedState() {
  try {
    const saved = JSON.parse(localStorage.getItem('sq_player') ?? '{}');
    state.xp = saved.xp ?? 0;
    state.questsCompleted = saved.questsCompleted ?? 0;
    state.completedStationIds = saved.completedStationIds ?? [];
  } catch {
    // Start fresh on parse error
  }
}

function saveState() {
  localStorage.setItem('sq_player', JSON.stringify({
    xp: state.xp,
    questsCompleted: state.questsCompleted,
    completedStationIds: state.completedStationIds,
  }));
}

// ─── View management ──────────────────────────────────────

const VIEWS = ['splash', 'loading', 'adventure', 'map', 'complete'];

function showView(viewName) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (!el) return;
    el.classList.toggle('active', v === viewName);
  });
}

// ─── XP display ───────────────────────────────────────────

function updateXPDisplay() {
  const el = document.getElementById('xp-value');
  if (el) el.textContent = state.xp.toLocaleString();
}

// ─── Toast ────────────────────────────────────────────────

let toastTimer = null;

function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toast-message');
  if (!toast || !msg) return;

  msg.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 300);
  }, duration);
}

window.__sqShowToast = showToast;

// ─── Geolocation ──────────────────────────────────────────

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ─── Adventure card rendering ─────────────────────────────

function renderAdventureCard(adv) {
  const { station, travelMinutes, stopCount, intermediateStops, quest, xpReward } = adv;

  const linesEl = document.getElementById('card-lines');
  linesEl.innerHTML = station.lines
    .map(l => `<span class="line-badge line--${l}" aria-label="Line ${l}">${l}</span>`)
    .join('');

  document.getElementById('card-station-name').textContent = station.name;
  document.getElementById('card-borough').textContent = station.borough;
  document.getElementById('card-fact-text').textContent = station.funFact;
  document.getElementById('stat-time').textContent = travelMinutes;
  document.getElementById('stat-stops').textContent = stopCount;
  document.getElementById('stat-xp').textContent = xpReward;

  const stopsList = document.getElementById('stops-list');
  stopsList.innerHTML = '';

  if (intermediateStops.length === 0) {
    const li = document.createElement('li');
    li.className = 'stop-item';
    li.innerHTML = `<span class="stop-dot stop-dot--current"></span><span>Direct — no intermediate stops</span>`;
    stopsList.appendChild(li);
  } else {
    intermediateStops.forEach((stop, i) => {
      const li = document.createElement('li');
      li.className = 'stop-item';
      li.innerHTML = `
        <span class="stop-dot${i === intermediateStops.length - 1 ? ' stop-dot--current' : ''}"></span>
        <span>${stop}</span>
      `;
      stopsList.appendChild(li);
    });
  }

  document.getElementById('quest-text').textContent = quest;
  document.getElementById('route-dest-label').textContent = station.name;
  document.getElementById('completion-quest-text').textContent = quest;
  document.getElementById('complete-station-name').textContent = station.name;
}

// ─── Loading status messages ──────────────────────────────

const LOADING_MESSAGES = [
  'Locating you…',
  'Scanning nearby lines…',
  'Picking your destination…',
  'Building your adventure…',
];

let loadingMsgIndex = 0;
let loadingInterval = null;

function startLoadingMessages() {
  loadingMsgIndex = 0;
  const el = document.getElementById('loading-status');
  if (el) el.textContent = LOADING_MESSAGES[0];
  loadingInterval = setInterval(() => {
    loadingMsgIndex = (loadingMsgIndex + 1) % LOADING_MESSAGES.length;
    if (el) el.textContent = LOADING_MESSAGES[loadingMsgIndex];
  }, 900);
}

function stopLoadingMessages() {
  clearInterval(loadingInterval);
}

// ─── Generate a new adventure ─────────────────────────────

async function startAdventure() {
  showView('loading');
  startLoadingMessages();

  try {
    const coords = await getUserLocation();
    state.userLat = coords.latitude;
    state.userLng = coords.longitude;

    const adv = generateAdventure(state.userLat, state.userLng, { maxMinutes: 30 });

    if (!adv) {
      throw new Error('No stations found. Make sure you are in the NYC metro area.');
    }

    state.adventure = adv;
    stopLoadingMessages();
    renderAdventureCard(adv);
    updateXPDisplay();
    showView('adventure');

  } catch (err) {
    stopLoadingMessages();
    showToast(err.message ?? 'Could not get your location. Please allow location access.');
    showView('splash');
  }
}

// ─── Show map routing view ────────────────────────────────

async function openMapView() {
  if (!state.adventure) return;

  showView('map');
  const { station } = state.adventure;

  if (!state.schematicReady) {
    initSchematicMap(document.getElementById('svg-container'));
    state.schematicReady = true;
  }

  clearSchematicRoute();
  showSchematicRoute(null, station.svgNodeId);

  try {
    const result = await getDirections(
      state.userLat, state.userLng,
      station.lat, station.lng
    );
    renderDirections(result.steps, document.getElementById('directions-list'));
  } catch {
    showToast('Directions unavailable. Add GOOGLE_MAPS_API_KEY to .env.local.');
    renderDirections(
      [{ type: 'subway', icon: '🚇', instruction: `Head to ${station.name}`, durationMin: state.adventure.travelMinutes }],
      document.getElementById('directions-list')
    );
  }
}

// ─── Tab switching ────────────────────────────────────────

function initMapTabs() {
  const tabSchematic = document.getElementById('tab-schematic');
  const tabStreet = document.getElementById('tab-street');
  const panelSchematic = document.getElementById('panel-schematic');
  const panelStreet = document.getElementById('panel-street');

  function activateTab(tabEl, panelEl) {
    [tabSchematic, tabStreet].forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    [panelSchematic, panelStreet].forEach(p => {
      p.classList.remove('active');
      p.hidden = true;
    });
    tabEl.classList.add('active');
    tabEl.setAttribute('aria-selected', 'true');
    panelEl.classList.add('active');
    panelEl.hidden = false;
  }

  tabSchematic.addEventListener('click', () => activateTab(tabSchematic, panelSchematic));

  tabStreet.addEventListener('click', () => {
    activateTab(tabStreet, panelStreet);
    if (!state.leafletReady && state.adventure) {
      const { station } = state.adventure;
      initLeafletMap(
        'leaflet-map',
        state.userLat, state.userLng,
        station.lat, station.lng,
        station.name
      );
      state.leafletReady = true;
    }
  });
}

// ─── Photo upload + verification ─────────────────────────

function initPhotoFlow() {
  const photoElements = {
    input: document.getElementById('photo-input'),
    uploadArea: document.getElementById('upload-area'),
    placeholder: document.getElementById('upload-placeholder'),
    preview: document.getElementById('photo-preview'),
    verifyBtn: document.getElementById('btn-verify'),
  };

  initPhotoUpload(photoElements, (file, dataUrl) => {
    state.pendingPhotoFile = file;
    state.pendingPhotoDataUrl = dataUrl;
    photoElements.verifyBtn.disabled = false;
  });

  document.getElementById('btn-verify').addEventListener('click', async () => {
    if (!state.pendingPhotoFile || !state.adventure) return;

    const verifyStatus = document.getElementById('verify-status');
    const statusText = document.getElementById('verify-status-text');
    const verifyBtn = document.getElementById('btn-verify');

    verifyBtn.disabled = true;
    verifyStatus.hidden = false;
    statusText.textContent = 'Analyzing your photo…';

    try {
      const result = await verifyPhoto(
        state.pendingPhotoFile,              // File blob directly (most reliable for RawImage)
        state.adventure.station.name,
        state.adventure.clipLabel,           // short visual noun-phrase, NOT the quest sentence
        (msg) => { statusText.textContent = msg; }
      );

      verifyStatus.hidden = true;

      if (result.success) {
        completeQuest(result);
      } else {
        showToast(`Verification failed: ${result.message}`);
        verifyBtn.disabled = false;
      }
    } catch (err) {
      verifyStatus.hidden = true;
      showToast(`Error: ${err.message}`);
      verifyBtn.disabled = false;
    }
  });
}

// ─── Quest completion ─────────────────────────────────────

function completeQuest() {
  if (!state.adventure) return;

  const earned = state.adventure.xpReward;
  state.xp += earned;
  state.questsCompleted += 1;
  state.completedStationIds.push(state.adventure.station.id);
  saveState();

  document.getElementById('earned-xp').textContent = `+${earned}`;
  document.getElementById('total-xp').textContent = state.xp.toLocaleString();
  document.getElementById('quests-done').textContent = state.questsCompleted;

  const completePhoto = document.getElementById('complete-photo');
  if (state.pendingPhotoDataUrl) {
    completePhoto.src = state.pendingPhotoDataUrl;
    completePhoto.hidden = false;
  }

  showView('complete');
  updateXPDisplay();
}

// ─── Share ────────────────────────────────────────────────

function shareAdventure() {
  if (!state.adventure) return;
  const text = `I just completed a Subway Quest to ${state.adventure.station.name} and earned ${state.adventure.xpReward} XP! 🚇 #SubwayQuest #NYC`;
  if (navigator.share) {
    navigator.share({ title: 'Subway Quest', text }).catch(() => { });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Copied to clipboard!'))
      .catch(() => showToast('Could not share. Copy the URL manually.'));
  }
}

// ─── Bootstrap ────────────────────────────────────────────

export function init() {
  loadPersistedState();
  updateXPDisplay();
  initMapTabs();
  initPhotoFlow();

  document.getElementById('btn-start').addEventListener('click', startAdventure);
  document.getElementById('btn-regen').addEventListener('click', startAdventure);
  document.getElementById('btn-show-route').addEventListener('click', openMapView);

  document.getElementById('btn-back').addEventListener('click', () => {
    clearSchematicRoute();
    showView('adventure');
  });

  document.getElementById('btn-go-again').addEventListener('click', () => {
    resetPhotoUpload({
      input: document.getElementById('photo-input'),
      placeholder: document.getElementById('upload-placeholder'),
      preview: document.getElementById('photo-preview'),
      verifyBtn: document.getElementById('btn-verify'),
    });

    state.pendingPhotoFile = null;
    state.pendingPhotoDataUrl = null;
    state.leafletReady = false;
    document.getElementById('verify-status').hidden = true;

    startAdventure();
  });

  document.getElementById('btn-share').addEventListener('click', shareAdventure);

  showView('splash');
}
