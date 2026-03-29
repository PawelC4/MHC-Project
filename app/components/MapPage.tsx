'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Station {
  id: string;
  name: string;
  lines: string[];
  borough: string;
  lat: number;
  lng: number;
  svgNodeId: string;
  funFact: string;
}

interface Adventure {
  station: Station;
  distanceKm: number;
  travelMinutes: number;
  stopCount: number;
  intermediateStops: string[];
  quest: string;
  clipLabel: string;
  xpReward: number;
}

interface DirectionStep {
  type: 'walk' | 'subway' | 'transfer';
  icon: string;
  instruction: string;
  durationMin: number;
}

export default function MapPage() {
  const router = useRouter();

  const [active, setActive] = useState(false);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [steps, setSteps] = useState<DirectionStep[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyDone, setVerifyDone] = useState(false);
  const [verifyText, setVerifyText] = useState('Verifying your photo…');

  const leafletInitRef = useRef(false);
  const mapLibRef = useRef<any>(null);

  // Fade in
  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Read adventure + user location from sessionStorage
  useEffect(() => {
    const advRaw = sessionStorage.getItem('sq_current_adventure');
    if (!advRaw) {
      router.replace('/');
      return;
    }
    setAdventure(JSON.parse(advRaw) as Adventure);

    const locRaw = sessionStorage.getItem('sq_user_location');
    if (locRaw) {
      const { lat, lng } = JSON.parse(locRaw);
      setUserLat(lat);
      setUserLng(lng);
    }
  }, [router]);

  // Watch for live location updates
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLat(latitude);
        setUserLng(longitude);
        sessionStorage.setItem(
          'sq_user_location',
          JSON.stringify({ lat: latitude, lng: longitude })
        );
      },
      (err) => console.error('Error watching geolocation:', err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Init map on first load, or update user position on subsequent updates
  useEffect(() => {
    if (!adventure || userLat === null || userLng === null) {
      return;
    }

    // Initialize map on first run
    if (!leafletInitRef.current) {
      leafletInitRef.current = true;
      import('@/lib/map').then((mapLib) => {
        mapLibRef.current = mapLib;
        mapLib.initLeafletMap(
          'leaflet-map',
          userLat,
          userLng,
          adventure.station.lat,
          adventure.station.lng,
          adventure.station.name
        );

        mapLib.getDirections(
          userLat,
          userLng,
          adventure.station.lat,
          adventure.station.lng,
          adventure.station.lines)
          .then((result: { steps: DirectionStep[] }) => setSteps(result.steps))
          .catch(() => setSteps([{ type: 'subway', icon: '🚇', instruction: `Head to ${adventure.station.name}`, durationMin: adventure.travelMinutes }]));
      });
    } else {
      // Update position on subsequent runs
      if (mapLibRef.current?.updateUserPosition) {
        mapLibRef.current.updateUserPosition(userLat, userLng);
      }
    }
  }, [adventure, userLat, userLng]);

  // ─── Photo handling ──────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const { resizeImage, readFileAsBase64 } = await import('@/lib/photo');
    const resized = await resizeImage(file);
    const { dataUrl } = await readFileAsBase64(resized);
    setPendingFile(resized);
    setPhotoDataUrl(dataUrl);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave() {
    setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  // ─── Verification + XP award ─────────────────────────────

  async function handleVerify() {
    if (!pendingFile || !photoDataUrl || !adventure) return;

    setIsVerifying(true);
    setVerifyDone(false);
    setVerifyText('Analyzing your photo…');

    try {
      const { verifyPhoto } = await import('@/lib/photo');
      const result = await verifyPhoto(
        pendingFile,                           // File/Blob — most reliable input for RawImage
        adventure.station.name,
        adventure.clipLabel,                   // short visual noun-phrase, NOT the quest sentence
        (msg: string) => setVerifyText(msg)   // live progress updates
      );

      if (result.success) {
        const earned = adventure.xpReward;
        
        // --- KEEP YOUR EXISTING LOCALSTORAGE CODE ---
        const player = JSON.parse(localStorage.getItem('sq_player') ?? '{}');
        const newXP = (player.xp ?? 0) + earned;
        const newCount = (player.questsCompleted ?? 0) + 1;
        const completedIds = [...(player.completedStationIds ?? []), adventure.station.id];

        localStorage.setItem(
          'sq_player',
          JSON.stringify({ xp: newXP, questsCompleted: newCount, completedStationIds: completedIds })
        );
        // Notify Home.tsx (same-tab) that XP changed
        window.dispatchEvent(new Event('sq:xp-updated'));
        sessionStorage.setItem(
          'sq_quest_result',
          JSON.stringify({
            earnedXP: earned,
            totalXP: newXP,
            questsCompleted: newCount,
            stationName: adventure.station.name,
            photoDataUrl,
          })
        );

        // ════════════════════════════════════════════════════════════
        // NEW: DEPOSIT THE POINTS INTO SUPABASE
        // ════════════════════════════════════════════════════════════
        try {
          // 1. Check if the user is actually logged in
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.user) {
            // 2. Fetch their current points from the database
            const { data: profile } = await supabase
              .from('profiles')
              .select('total_points')
              .eq('id', session.user.id)
              .single();

            const currentDbXP = profile?.total_points || 0;
            const newDbXP = currentDbXP + earned;

            // 3. Overwrite it with the new total
            await supabase
              .from('profiles')
              .update({ total_points: newDbXP })
              .eq('id', session.user.id);
              
            console.log(`Saved ${earned} XP to database! New total: ${newDbXP}`);
          }
        } catch (dbError) {
          console.error("Failed to save XP to database:", dbError);
        }
        // ════════════════════════════════════════════════════════════

        // Finally, send them to the success screen
        router.push('/complete');
      } else {
        setIsVerifying(false);
        setVerifyDone(true);
        setVerifyText(result.message || 'Verification failed. Try a different photo.');
      }
    } catch (err: unknown) {
      setIsVerifying(false);
      setVerifyDone(true);
      const msg = err instanceof Error ? err.message : 'Verification error.';
      setVerifyText(msg);
    }
  }

  if (!adventure) return null;

  return (
    <div id="view-map" className={`view${active ? ' active' : ''}`}>
      <style>
        {`
          @keyframes dash-march-street {
            to {
              stroke-dashoffset: -40;
            }
          }
          .leaflet-route-animating {
            animation: dash-march-street 1s linear infinite;
          }
        `}
      </style>

      {/* ─── Sidebar ─── */}
      <aside className="map-sidebar">

        <div className="sidebar-header">
          <button
            onClick={() => router.push('/adventure')}
            className="btn btn--icon"
            aria-label="Back to adventure card"
          >
            ← Back
          </button>
          <div className="route-summary">
            <div className="route-node">
              <span className="route-node-dot origin-dot" aria-hidden="true"></span>
              <span className="route-node-label">Your Location</span>
            </div>
            <div className="route-connector" aria-hidden="true"></div>
            <div className="route-node">
              <span className="route-node-dot dest-dot" aria-hidden="true"></span>
              <span className="route-node-label">{adventure.station.name}</span>
            </div>
          </div>
        </div>

        {/* Step-by-step directions */}
        <div className="directions-section">
          <h3 className="directions-heading">
            <span className="mono">DIRECTIONS</span>
          </h3>
          <ol className="directions-list" aria-label="Step-by-step directions">
            {steps.map((step, i) => (
              <li key={i} className={`direction-step direction-step--${step.type}`}>
                <span className="step-num">{i + 1}</span>
                <span className="step-icon" aria-hidden="true">{step.icon}</span>
                <span className="step-text">{step.instruction}</span>
                {step.durationMin > 0 && (
                  <span className="step-duration">{step.durationMin}m</span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* Quest completion */}
        <div className="quest-completion">
          <h3 className="completion-heading">Complete Your Quest</h3>
          <p className="completion-subtext">{adventure.quest}</p>

          <div
            className={`upload-area${isDragging ? ' drag-over' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Upload your photo"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.getElementById('photo-input')?.click();
              }
            }}
          >
            <input
              type="file"
              id="photo-input"
              accept="image/*"
              capture="environment"
              aria-label="Choose or take a photo"
              onChange={handleFileChange}
            />
            {photoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoDataUrl} className="photo-preview" alt="Your quest photo" />
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon" aria-hidden="true">◎</span>
                <span className="upload-label">Tap to upload photo</span>
                <span className="upload-hint">JPG, PNG or HEIC</span>
              </div>
            )}
          </div>

          {(isVerifying || verifyDone) && (
            <div className="verify-status" aria-live="polite">
              {isVerifying && <span className="verify-spinner" aria-hidden="true"></span>}
              <span>{verifyText}</span>
            </div>
          )}

          <button
            className="btn btn--primary btn--full"
            disabled={!photoDataUrl || isVerifying}
            onClick={handleVerify}
          >
            Verify &amp; Earn XP
          </button>
        </div>

      </aside>

      {/* ─── Map canvas ─── */}
      <div className="map-canvas">

        {/* Leaflet street map panel */}
        <div
          id="panel-street"
          role="tabpanel"
          className="map-panel active"
        >
          <div id="leaflet-map"></div>
        </div>

      </div>
    </div>
  );
}
