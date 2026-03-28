'use client';

import { useEffect } from 'react';

/**
 * SubwayQuestApp
 *
 * Renders the full Subway Quest HTML structure as JSX, then boots the
 * vanilla JS app logic via lib/main.js once the component mounts.
 *
 * All DOM manipulation, Geolocation, Leaflet, and camera access
 * happens in lib/main.js (and its module dependencies) after mount —
 * never during SSR.
 */
export default function SubwayQuestApp() {
  useEffect(() => {
    let cancelled = false;

    import('@/lib/main').then(({ init }) => {
      if (!cancelled) init();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {/* ═══════════════════════════════════════ SPLASH ═══ */}
      <section id="view-splash" className="view active" aria-label="Welcome">
        <div className="splash-inner">
          <div className="splash-logo">
            <span className="logo-track"></span>
            <h1 className="logo-wordmark">
              Subway
              <br />
              Quest
            </h1>
            <span className="logo-track logo-track--right"></span>
          </div>
          <p className="splash-tagline">
            Drop into the unknown.
            <br />
            NYC is your adventure map.
          </p>
          <button id="btn-start" className="btn btn--primary btn--lg">
            Find My Adventure
          </button>
          <p className="splash-hint">Allow location access when prompted</p>
        </div>
        <div className="splash-grid" aria-hidden="true"></div>
      </section>

      {/* ═══════════════════════════════════════ LOCATING ═══ */}
      <section
        id="view-loading"
        className="view"
        aria-label="Finding location"
        aria-live="polite"
      >
        <div className="loading-inner">
          <div className="loading-pulse">
            <div className="pulse-ring"></div>
            <div className="pulse-ring pulse-ring--delay"></div>
            <div className="pulse-dot"></div>
          </div>
          <p className="loading-label" id="loading-status">
            Locating you…
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════ ADVENTURE CARD ═══ */}
      <section id="view-adventure" className="view" aria-label="Adventure card">

        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-brand">
            <span className="topbar-logo">SQ</span>
            <span className="topbar-name">Subway Quest</span>
          </div>
          <div className="topbar-xp" id="xp-display" aria-label="Your XP">
            <span className="xp-icon">★</span>
            <span id="xp-value">0</span>
            <span className="xp-label">XP</span>
          </div>
        </header>

        {/* Card */}
        <main className="card-stage">
          <div className="adventure-card" id="adventure-card" role="article">

            {/* Line badge + station name */}
            <div className="card-header">
              <div className="card-lines" id="card-lines" aria-label="Subway lines">
                {/* Populated by JS */}
              </div>
              <div className="card-destination">
                <span className="card-destination-label">Your destination</span>
                <h2 className="card-station-name" id="card-station-name">—</h2>
                <span className="card-borough" id="card-borough">—</span>
              </div>
            </div>

            {/* Divider */}
            <div className="card-divider" aria-hidden="true">
              <span className="divider-dot"></span>
              <span className="divider-line"></span>
              <span className="divider-dot"></span>
            </div>

            {/* Fun fact */}
            <blockquote className="card-fact" id="card-fact">
              <span className="fact-icon" aria-hidden="true">✦</span>
              <p id="card-fact-text">Loading fun fact…</p>
            </blockquote>

            {/* Stats row */}
            <div className="card-stats">
              <div className="stat-cell">
                <span className="stat-value" id="stat-time">—</span>
                <span className="stat-label">min travel</span>
              </div>
              <div className="stat-cell stat-cell--accent">
                <span className="stat-value" id="stat-stops">—</span>
                <span className="stat-label">stops away</span>
              </div>
              <div className="stat-cell">
                <span className="stat-value" id="stat-xp">—</span>
                <span className="stat-label">XP reward</span>
              </div>
            </div>

            {/* Intermediate stops */}
            <div className="card-stops-section">
              <h3 className="stops-heading">Route via</h3>
              <ol
                className="stops-list"
                id="stops-list"
                aria-label="Intermediate stops"
              >
                {/* Populated by JS */}
              </ol>
            </div>

            {/* Quest description */}
            <div className="card-quest">
              <span className="quest-tag">Quest</span>
              <p className="quest-text" id="quest-text">—</p>
            </div>

          </div>
        </main>

        {/* Actions */}
        <footer className="card-actions">
          <button
            id="btn-regen"
            className="btn btn--ghost"
            aria-label="Generate a new adventure"
          >
            ↻ Regenerate
          </button>
          <button id="btn-show-route" className="btn btn--primary">
            Show Route →
          </button>
        </footer>

      </section>

      {/* ═══════════════════════════════════════ MAP ROUTING VIEW ═══ */}
      <section id="view-map" className="view" aria-label="Route map">

        {/* Sidebar */}
        <aside className="map-sidebar" id="map-sidebar">

          <div className="sidebar-header">
            <button
              id="btn-back"
              className="btn btn--icon"
              aria-label="Back to adventure card"
            >
              ← Back
            </button>
            <div className="route-summary">
              <div className="route-node route-node--origin">
                <span className="route-node-dot origin-dot" aria-hidden="true"></span>
                <span className="route-node-label" id="route-origin-label">
                  Your Location
                </span>
              </div>
              <div className="route-connector" aria-hidden="true"></div>
              <div className="route-node route-node--dest">
                <span className="route-node-dot dest-dot" aria-hidden="true"></span>
                <span className="route-node-label" id="route-dest-label">—</span>
              </div>
            </div>
          </div>

          {/* Step-by-step directions */}
          <div className="directions-section">
            <h3 className="directions-heading">
              <span className="mono">DIRECTIONS</span>
            </h3>
            <ol
              className="directions-list"
              id="directions-list"
              aria-label="Step-by-step directions"
            >
              {/* Populated by map.js */}
            </ol>
          </div>

          {/* Quest completion */}
          <div className="quest-completion" id="quest-completion">
            <h3 className="completion-heading">Complete Your Quest</h3>
            <p className="completion-subtext" id="completion-quest-text">—</p>

            <div
              className="upload-area"
              id="upload-area"
              role="button"
              tabIndex={0}
              aria-label="Upload your photo"
            >
              <input
                type="file"
                id="photo-input"
                accept="image/*"
                capture="environment"
                aria-label="Choose or take a photo"
              />
              <div className="upload-placeholder" id="upload-placeholder">
                <span className="upload-icon" aria-hidden="true">◎</span>
                <span className="upload-label">Tap to upload photo</span>
                <span className="upload-hint">JPG, PNG or HEIC</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="photo-preview"
                className="photo-preview"
                alt="Your quest photo"
                hidden
              />
            </div>

            <div
              className="verify-status"
              id="verify-status"
              aria-live="polite"
              hidden
            >
              <span className="verify-spinner" aria-hidden="true"></span>
              <span id="verify-status-text">Verifying your photo…</span>
            </div>

            <button
              id="btn-verify"
              className="btn btn--primary btn--full"
              disabled
            >
              Verify &amp; Earn XP
            </button>
          </div>

        </aside>

        {/* SVG Subway Map + Leaflet */}
        <div className="map-canvas" id="map-canvas">

          {/* Tab switcher */}
          <div className="map-tabs" role="tablist" aria-label="Map view">
            <button
              className="map-tab active"
              id="tab-schematic"
              role="tab"
              aria-selected="true"
              aria-controls="panel-schematic"
            >
              Schematic
            </button>
            <button
              className="map-tab"
              id="tab-street"
              role="tab"
              aria-selected="false"
              aria-controls="panel-street"
            >
              Street Map
            </button>
          </div>

          {/* Schematic SVG panel */}
          <div
            id="panel-schematic"
            role="tabpanel"
            className="map-panel active"
          >
            <div
              id="svg-container"
              aria-label="NYC subway schematic map"
            >
              {/* Injected by map.js initSchematicMap() */}
            </div>
          </div>

          {/* Leaflet street map panel */}
          <div
            id="panel-street"
            role="tabpanel"
            className="map-panel"
            hidden
          >
            <div id="leaflet-map"></div>
          </div>

        </div>

      </section>

      {/* ═══════════════════════════════════════ QUEST COMPLETE ═══ */}
      <section id="view-complete" className="view" aria-label="Quest complete">
        <div className="complete-inner">

          <div className="complete-badge" aria-hidden="true">
            <span className="badge-star">★</span>
          </div>

          <h2 className="complete-heading">
            Quest
            <br />
            Complete!
          </h2>

          <div className="complete-stats">
            <div className="complete-stat">
              <span className="complete-stat-value" id="earned-xp">+0</span>
              <span className="complete-stat-label">XP Earned</span>
            </div>
            <div className="complete-stat">
              <span className="complete-stat-value" id="total-xp">0</span>
              <span className="complete-stat-label">Total XP</span>
            </div>
            <div className="complete-stat">
              <span className="complete-stat-value" id="quests-done">0</span>
              <span className="complete-stat-label">Quests Done</span>
            </div>
          </div>

          <div className="complete-station">
            <span className="complete-station-label">You made it to</span>
            <span
              className="complete-station-name"
              id="complete-station-name"
            >
              —
            </span>
          </div>

          <div className="complete-photo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              id="complete-photo"
              className="complete-photo"
              alt="Your quest photo at the station"
              hidden
            />
          </div>

          <div className="complete-actions">
            <button id="btn-go-again" className="btn btn--primary btn--lg">
              Go Again ↗
            </button>
            <button id="btn-share" className="btn btn--ghost">
              Share
            </button>
          </div>

        </div>
      </section>

      {/* Toast notification */}
      <div
        id="toast"
        className="toast"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        hidden
      >
        <span id="toast-message"></span>
      </div>
    </>
  );
}
