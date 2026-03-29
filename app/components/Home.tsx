'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type View = 'splash' | 'loading';

const LOADING_MESSAGES = [
  'Locating you…',
  'Scanning nearby lines…',
  'Picking your destination…',
  'Building your adventure…',
];

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<View>('splash');
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trigger CSS fade-in after first paint
  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  async function handleStart() {
    setError(null);
    setView('loading');

    let msgIndex = 0;
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIndex]);
    }, 900);

    try {
      // Geolocation
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported by this browser.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(new Error(err.message || 'Location access denied.')),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });

      // Generate adventure (dynamic import keeps this out of the initial bundle)
      const { generateAdventure } = await import('@/lib/adventure');
      const adv = generateAdventure(coords.latitude, coords.longitude, { maxMinutes: 30 });

      clearInterval(interval);

      if (!adv) throw new Error('No stations found near you.');

      // Persist for downstream pages
      sessionStorage.setItem('sq_current_adventure', JSON.stringify(adv));
      sessionStorage.setItem(
        'sq_user_location',
        JSON.stringify({ lat: coords.latitude, lng: coords.longitude })
      );

      router.push('/adventure');
    } catch (err: unknown) {
      clearInterval(interval);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      setView('splash');
    }
  }

  return (
    // ID swaps between view-splash and view-loading so the correct
    // CSS centering rules apply for each state.
    <div
      id={view === 'splash' ? 'view-splash' : 'view-loading'}
      className={`view${active ? ' active' : ''}`}
    >
      {view === 'splash' ? (
        <>
          <div className="splash-inner">
            <div className="splash-logo">
              <span className="logo-track"></span>
              <h1 className="logo-wordmark">
                Metro
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
            {error && (
              <p
                style={{
                  color: '#ff6b6b',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-mono)',
                  maxWidth: 280,
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </p>
            )}
            <button onClick={handleStart} className="btn btn--primary btn--lg">
              Find My Adventure
            </button>
            <p className="splash-hint">Allow location access when prompted</p>
          </div>
          <div className="splash-grid" aria-hidden="true"></div>
        </>
      ) : (
        <div className="loading-inner">
          <div className="loading-pulse">
            <div className="pulse-ring"></div>
            <div className="pulse-ring pulse-ring--delay"></div>
            <div className="pulse-dot"></div>
          </div>
          <p className="loading-label" aria-live="polite">
            {loadingMsg}
          </p>
        </div>
      )}
    </div>
  );
}
