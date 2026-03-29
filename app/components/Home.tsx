'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js'
import GoogleLoginButton from './GoogleLoginButton';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

  // 2. Add New State for the User and their XP
  const [user, setUser] = useState<any>(null);
  const [xp, setXp] = useState<number>(0);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));

    // Always load XP from localStorage immediately on mount
    setXp(readLocalXP());

    // 3. Check if someone is already logged in when the page loads
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        fetchProfileXP(session.user.id);
      }
      setIsAuthLoading(false);
    };

    checkSession();

    // 4. Listen for changes (like when they click the Google Button)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfileXP(session.user.id);
      } else {
        setUser(null);
        setXp(readLocalXP()); // keep local XP even when logged out
      }
    });

    // Re-read localStorage XP when the user navigates back from a completed quest
    const handleStorage = () => setXp(readLocalXP());
    window.addEventListener('storage', handleStorage);
    // Also catch same-tab updates via a custom event fired after quest completion
    window.addEventListener('sq:xp-updated', handleStorage);

    return () => {
      cancelAnimationFrame(id);
      authListener.subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('sq:xp-updated', handleStorage);
    };
  }, []);

  // Read XP from localStorage (where MapPage.tsx writes it after quests)
  const readLocalXP = () => {
    try {
      const player = JSON.parse(localStorage.getItem('sq_player') ?? '{}');
      return player.xp ?? 0;
    } catch {
      return 0;
    }
  };

  // Fetch XP from Supabase profiles as a supplement (if the table exists)
  const fetchProfileXP = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('total_points')
      .eq('id', userId)
      .single();

    if (data?.total_points) {
      // Use whichever is higher — localStorage (local quest completions) wins
      setXp((prev) => Math.max(prev, data.total_points));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  async function handleStart() {
    setError(null);
    setView('loading');

    let msgIndex = 0;
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIndex]);
    }, 900);

    try {
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

      const { generateAdventure } = await import('@/lib/adventure');
      const adv = generateAdventure(coords.latitude, coords.longitude, { maxMinutes: 30 });

      clearInterval(interval);

      if (!adv) throw new Error('No stations found near you.');

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
                Subway
                <br />
                Quest
              </h1>
              <span className="logo-track logo-track--right"></span>
            </div>

            {/* 6. Dynamic UI: Show different text depending on login status */}
            {!isAuthLoading && user ? (
              <div className="flex flex-col items-center gap-2 mb-6">
                <p className="splash-tagline !mb-2">Welcome back!</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-full px-6 py-2 flex items-center gap-3 shadow-lg">
                  <span className="text-yellow-400 text-xl">★</span>
                  <span className="text-white font-mono text-lg font-bold"> {xp.toLocaleString()} XP</span>
                </div>
              </div>
            ) : (
              <p className="splash-tagline">
                Drop into the unknown.
                <br />
                NYC is your adventure map.
              </p>
            )}

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

            {/* 7. Dynamic Buttons: Hide Google Login if already logged in */}
            <div className="flex flex-col gap-4 w-full mt-4">
              {isAuthLoading ? (
                <div className="h-12 flex items-center justify-center text-zinc-500">Loading...</div>
              ) : user ? (
                <div className='buttons'>
                  <button onClick={handleStart} className="btn btn--primary btn--lg">
                    Start Next Quest
                  </button>
                  <button onClick={handleLogout} className="btn btn--ghost">
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="buttons">
                  <GoogleLoginButton />
                  <button onClick={handleStart} className="btn btn--primary btn--lg">
                    Play as Guest
                  </button>
                </div>
              )}
            </div>

            <p className="splash-hint mt-4">Allow location access when prompted</p>
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