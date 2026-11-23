import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { todayString } from '../shared/level';

export const Splash = () => {
  const [streak] = useState(() => {
    try {
      return parseInt(localStorage.getItem('daily-orbit:streak') ?? '0') || 0;
    } catch {
      return 0;
    }
  });

  const play = (e: ReactMouseEvent) => {
    try {
      requestExpandedMode(e.nativeEvent, 'game');
    } catch {
      // Outside Reddit there is no expanded mode; the game page opens directly.
      window.location.href = 'game.html';
    }
  };

  return (
    <div className="flex relative flex-col justify-center items-center min-h-[320px] gap-3 bg-[#0b1026] text-white px-4 py-6">
      <p className="text-4xl leading-none">🪐</p>
      <h1 className="text-2xl font-black leading-none">Daily Orbit</h1>
      <p className="text-sm text-indigo-200 text-center max-w-[300px]">
        One puzzle a day. Pull back, let it fly, hit the ring.
      </p>
      <p className="text-xs text-indigo-300">{todayString()}</p>
      {streak > 0 && (
        <p className="text-xs bg-white/10 rounded-full px-3 py-1">🔥 {streak} day streak</p>
      )}
      <button
        className="bg-[#d93900] hover:bg-[#c23300] rounded-full px-6 py-2.5 font-bold cursor-pointer"
        onClick={play}
      >
        Let&apos;s play
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
