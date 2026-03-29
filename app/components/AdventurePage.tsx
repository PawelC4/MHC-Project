'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Station {
  id: string;
  name: string;
  lines: string[];
  borough: string;
  lat: number;
  lng: number;
  svgNodeId: string;
  funFact: string;
  exits: string[];
}

interface Adventure {
  station: Station;
  distanceKm: number;
  travelMinutes: number;
  stopCount: number;
  intermediateStops: string[];
  quest: string;
  xpReward: number;
}

export default function AdventurePage() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [xp, setXP] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem('sq_current_adventure');
    if (!raw) {
      router.replace('/');
      return;
    }
    setAdventure(JSON.parse(raw) as Adventure);

    const player = JSON.parse(localStorage.getItem('sq_player') ?? '{}');
    setXP(player.xp ?? 0);
  }, [router]);

  function handleRegenerate() {
    sessionStorage.removeItem('sq_current_adventure');
    router.push('/');
  }

  function handleShowRoute() {
    router.push('/map');
  }

  if (!adventure) return null;

  const { station, travelMinutes, stopCount, intermediateStops, quest, xpReward } = adventure;

  return (
    <div id="view-adventure" className={`view${active ? ' active' : ''}`}>

      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-brand">
          <button onClick={() => router.push('/')}>
            <span className="topbar-logo">SQ</span>
            <span className="topbar-name">Subway Quest</span>
          </button>
        </div>
        <div className="topbar-xp" aria-label="Your XP">
          <span className="xp-icon">★</span>
          <span>{xp.toLocaleString()}</span>
          <span className="xp-label">XP</span>
        </div>
      </header>

      {/* Card */}
      <main className="card-stage">
        <div className="adventure-card" role="article">

          {/* Lines + destination */}
          <div className="card-header">
            <div className="card-lines" aria-label="Subway lines">
              {station.lines.map((l) => (
                <span key={l} className={`line-badge line--${l}`} aria-label={`Line ${l}`}>
                  {l}
                </span>
              ))}
            </div>
            <div className="card-destination">
              <span className="card-destination-label">Your destination</span>
              <h2 className="card-station-name">{station.name}</h2>
              <span className="card-borough">{station.borough}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="card-divider" aria-hidden="true">
            <span className="divider-dot"></span>
            <span className="divider-line"></span>
            <span className="divider-dot"></span>
          </div>

          {/* Fun fact */}
          <blockquote className="card-fact">
            <span className="fact-icon" aria-hidden="true">✦</span>
            <p>{station.funFact}</p>
          </blockquote>

          {/* Stats */}
          <div className="card-stats">
            <div className="stat-cell">
              <span className="stat-value">{travelMinutes}</span>
              <span className="stat-label">min travel</span>
            </div>
            <div className="stat-cell stat-cell--accent">
              <span className="stat-value">{stopCount}</span>
              <span className="stat-label">stops away</span>
            </div>
            <div className="stat-cell">
              <span className="stat-value">{xpReward}</span>
              <span className="stat-label">XP reward</span>
            </div>
          </div>

          {/* Intermediate stops */}
          <div className="card-stops-section">
            <h3 className="stops-heading">Route via</h3>
            <ol className="stops-list" aria-label="Intermediate stops">
              {intermediateStops.length === 0 ? (
                <li className="stop-item">
                  <span className="stop-dot stop-dot--current"></span>
                  <span>Direct — no intermediate stops</span>
                </li>
              ) : (
                intermediateStops.map((stop, i) => (
                  <li key={i} className="stop-item">
                    <span
                      className={`stop-dot${i === intermediateStops.length - 1 ? ' stop-dot--current' : ''
                        }`}
                    ></span>
                    <span>{stop}</span>
                  </li>
                ))
              )}
            </ol>
          </div>

          {/* Quest */}
          <div className="card-quest">
            <span className="quest-tag">Quest</span>
            <p className="quest-text">{quest}</p>
          </div>

        </div>
      </main>

      {/* Actions */}
      <footer className="card-actions">
        <button
          onClick={handleRegenerate}
          className="btn btn--ghost"
          aria-label="Generate a new adventure"
        >
          ↻ Regenerate
        </button>
        <button onClick={handleShowRoute} className="btn btn--primary">
          Show Route →
        </button>
      </footer>

    </div>
  );
}
