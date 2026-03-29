'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

interface DirectionStep {
  type: 'walk' | 'subway' | 'transfer';
  icon: string;
  instruction: string;
  durationMin: number;
  lineName?: string | null;
  lineColor?: string | null;
  stopCount?: number | null;
}

interface DirectionsResult {
  steps: DirectionStep[];
  overviewPolyline: string | null;
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
  const [verifyText, setVerifyText] = useState('Verifying your photo…');

  const mapInitRef = useRef(false);

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

  // Init map and fetch directions once adventure is loaded
  useEffect(() => {
    if (!adventure || mapInitRef.current) return;

    // Fall back to station coords offset if user location isn't stored
    const oLat = userLat ?? adventure.station.lat - 0.02;
    const oLng = userLng ?? adventure.station.lng - 0.02;

    mapInitRef.current = true;

    import('@/lib/map').then(({ initLeafletMap, getDirections }) => {
      getDirections(oLat, oLng, adventure.station.lat, adventure.station.lng)
        .then((result: DirectionsResult) => {
          setSteps(result.steps);
          // Now that we have directions (including the route polyline), initialize the map.
          initLeafletMap(
            'map-container',
            oLat,
            oLng,
            adventure.station.lat,
            adventure.station.lng,
            adventure.station.name,
            result.overviewPolyline
          );
        })
        .catch(() => {
          setSteps([
            {
              type: 'subway',
              icon: '🚇',
              instruction: `Head to ${adventure.station.name}`,
              durationMin: adventure.travelMinutes,
            },
          ]);
          // Initialize the map even if directions fail, just without the route line.
          initLeafletMap(
            'map-container',
            oLat,
            oLng,
            adventure.station.lat,
            adventure.station.lng,
            adventure.station.name
          );
        });
    });
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
    setVerifyText('Analyzing your photo…');

    try {
      const { readFileAsBase64, verifyPhoto } = await import('@/lib/photo');
      const { base64, mediaType } = await readFileAsBase64(pendingFile);
      const result = await verifyPhoto(
        base64,
        mediaType,
        adventure.station.name,
        adventure.quest
      );

      if (result.success) {
        const earned = adventure.xpReward;
        const player = JSON.parse(localStorage.getItem('sq_player') ?? '{}');
        const newXP = (player.xp ?? 0) + earned;
        const newCount = (player.questsCompleted ?? 0) + 1;
        const completedIds = [...(player.completedStationIds ?? []), adventure.station.id];

        localStorage.setItem(
          'sq_player',
          JSON.stringify({ xp: newXP, questsCompleted: newCount, completedStationIds: completedIds })
        );
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

        router.push('/complete');
      } else {
        setIsVerifying(false);
        setVerifyText(result.message || 'Verification failed. Try a different photo.');
      }
    } catch (err: unknown) {
      setIsVerifying(false);
      const msg = err instanceof Error ? err.message : 'Verification error.';
      setVerifyText(msg);
    }
  }

  if (!adventure) return null;

  return (
    <div id="view-map" className={`view${active ? ' active' : ''}`}>

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
            {(() => {
              const subwayLegs = steps.filter(
                (step) => step.type === 'subway' && step.lineName
              );

              if (subwayLegs.length === 0) {
                return <div className="route-connector" aria-hidden="true"></div>;
              }

              return (
                <div
                  className="route-connector"
                  aria-hidden="true"
                  style={{
                    flex: '1 1 0%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    margin: '0 8px',
                    minWidth: 0,
                  }}
                >
                  {subwayLegs.map((leg, i) => (
                    <span
                      key={`${leg.lineName}-${i}`}
                      style={{
                        backgroundColor: leg.lineColor || '#888',
                        color: (leg.lineColor || '').toLowerCase() === '#fccc0a' ? '#000' : '#fff',
                        borderRadius: '9999px',
                        width: '24px',
                        height: '24px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        flexShrink: 0,
                      }}
                    >
                      {leg.lineName}
                    </span>
                  ))}
                </div>
              );
            })()}
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
                {step.type === 'subway' && step.lineName ? (
                  <span
                    className="step-icon"
                    style={{
                      backgroundColor: step.lineColor || '#888',
                      // Use black text for yellow-ish backgrounds for readability
                      color: (step.lineColor || '').toLowerCase() === '#fccc0a' ? '#000' : '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {step.lineName}
                  </span>
                ) : (
                  <span className="step-icon" aria-hidden="true">{step.icon}</span>
                )}
                <span className="step-text">
                  {step.instruction}
                  {step.stopCount && (
                    <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.9em', paddingTop: '2px' }}>
                      {step.stopCount} stop{step.stopCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
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

          {isVerifying && (
            <div className="verify-status" aria-live="polite">
              <span className="verify-spinner" aria-hidden="true"></span>
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

        {/* Map panel */}
        <div
          id="panel-map"
          role="tabpanel"
          className="map-panel active"
        >
          <div id="map-container" style={{ height: '100%', width: '100%' }}></div>
        </div>

      </div>
    </div>
  );
}
