'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface QuestResult {
  earnedXP: number;
  totalXP: number;
  questsCompleted: number;
  stationName: string;
  photoDataUrl: string | null;
}

export default function CompletePage() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<QuestResult | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem('sq_quest_result');
    if (!raw) {
      router.replace('/');
      return;
    }
    setResult(JSON.parse(raw) as QuestResult);
  }, [router]);

  function handleGoAgain() {
    sessionStorage.removeItem('sq_current_adventure');
    sessionStorage.removeItem('sq_quest_result');
    router.push('/');
  }

  function handleShare() {
    if (!result) return;
    const text = `I just completed a Subway Quest to ${result.stationName} and earned ${result.earnedXP} XP! 🚇 #SubwayQuest #NYC`;
    if (navigator.share) {
      navigator.share({ title: 'Subway Quest', text }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(text)
        .then(() => alert('Copied to clipboard!'))
        .catch(() => {});
    }
  }

  if (!result) return null;

  return (
    <div id="view-complete" className={`view${active ? ' active' : ''}`}>
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
            <span className="complete-stat-value">+{result.earnedXP}</span>
            <span className="complete-stat-label">XP Earned</span>
          </div>
          <div className="complete-stat">
            <span className="complete-stat-value">{result.totalXP.toLocaleString()}</span>
            <span className="complete-stat-label">Total XP</span>
          </div>
          <div className="complete-stat">
            <span className="complete-stat-value">{result.questsCompleted}</span>
            <span className="complete-stat-label">Quests Done</span>
          </div>
        </div>

        <div className="complete-station">
          <span className="complete-station-label">You made it to</span>
          <span className="complete-station-name">{result.stationName}</span>
        </div>

        {result.photoDataUrl && (
          <div className="complete-photo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.photoDataUrl}
              className="complete-photo"
              alt="Your quest photo at the station"
            />
          </div>
        )}

        <div className="complete-actions">
          <button onClick={handleGoAgain} className="btn btn--primary btn--lg">
            Go Again ↗
          </button>
          <button onClick={handleShare} className="btn btn--ghost">
            Share
          </button>
        </div>

      </div>
    </div>
  );
}
