'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

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
      {/* Floating Action Button - Always Accessible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2 bg-zinc-900 text-white px-4 py-3 rounded-full shadow-2xl border border-zinc-700 hover:bg-zinc-800 transition-all font-mono"
        aria-label="Toggle Leaderboard"
      >
        <span className="btn btn--primary sm:inline">
          {isOpen ? 'Close' : 'Leaderboard'}
        </span>
      </button>

      {/* Leaderboard Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#111] border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            
            {loading ? (
              <div className="text-zinc-500 text-center py-8 font-mono animate-pulse">
                Loading rankings...
              </div>
            ) : leaders.length === 0 ? (
              <div className="text-zinc-500 text-center py-8 font-mono">
                No explorers yet.<br/>Be the first!
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {leaders.map((player, index) => (
                  <div 
                    key={player.id || index} 
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <span 
                        className={`text-lg font-bold w-6 text-center ${
                          index === 0 ? 'text-yellow-400' : 
                          index === 1 ? 'text-zinc-300' : 
                          index === 2 ? 'text-amber-600' : 
                          'text-zinc-500'
                        }`}
                      >
                        #{index + 1}&nbsp;
                      </span>
                      <span className="font-medium text-white">
                        {player.username || 'Anonymous'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-green-400 font-mono">
                      <span>{player.total_points || 0}</span>
                      <span className="text-xs opacity-70">&nbsp;pts</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}