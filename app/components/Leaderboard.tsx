'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

// Initialize the Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Updated to match your database schema
type Player = {
  id: string;
  username: string;
  total_points: number;
};

export default function Leaderboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [leaders, setLeaders] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, total_points')
      .order('total_points', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching leaderboard:', error);
    } else {
      setLeaders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard();
    }
  }, [isOpen]);

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="leaderboard-fab"
        aria-label="Toggle Leaderboard"
      >
        <EmojiEventsIcon className="leaderboard-fab__icon" fontSize="small" />
        <span className="leaderboard-fab__label">
          {isOpen ? 'Close' : 'Leaderboard'}
        </span>
      </button>

      {/* Leaderboard Modal */}
      {isOpen && (
        <div className="leaderboard-overlay">
          <div className="leaderboard-panel">

            {/* Header */}
            <div className="leaderboard-header">
              <div className="leaderboard-header__track" />
              <h2 className="leaderboard-header__title">Top Explorers</h2>
              <div className="leaderboard-header__track" />
            </div>

            {loading ? (
              <div className="leaderboard-loading">
                <div className="leaderboard-loading__spinner" />
                <span>Fetching rankings...</span>
              </div>
            ) : leaders.length === 0 ? (
              <div className="leaderboard-empty">
                No explorers yet.<br />Be the first!
              </div>
            ) : (
              <ol className="leaderboard-list">
                {leaders.map((player, index) => (
                  <li
                    key={player.id || index}
                    className={`leaderboard-row ${index === 0 ? 'leaderboard-row--gold' : ''}`}
                  >
                    <span className={`leaderboard-row__rank leaderboard-row__rank--${index + 1}`}>
                      {index === 0
                        ? <EmojiEventsIcon fontSize="small" />
                        : `#${index + 1}`}
                    </span>
                    <span className="leaderboard-row__name">
                      {player.username || 'Anonymous'}
                    </span>
                    <span className="leaderboard-row__pts">
                      {player.total_points || 0}
                      <span className="leaderboard-row__pts-label">pts</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}