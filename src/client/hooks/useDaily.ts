import { useCallback, useEffect, useState } from 'react';
import {
  getDailyLevel,
  starsForShots,
  todayString,
  yesterdayString,
  type Level,
} from '../../shared/level';
import type { DailyResponse, ScoreResponse } from '../../shared/api';

export type TodayResult = {
  shots: number;
  stars: number;
  streak: number;
};

const resultKey = (date: string) => `daily-orbit:result:${date}`;
const STREAK_KEY = 'daily-orbit:streak';
const LAST_KEY = 'daily-orbit:last';

const readResult = (date: string): TodayResult | null => {
  try {
    const raw = localStorage.getItem(resultKey(date));
    return raw ? (JSON.parse(raw) as TodayResult) : null;
  } catch {
    return null;
  }
};

const readStreak = (): number => {
  try {
    return parseInt(localStorage.getItem(STREAK_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
};

/** Client-side daily state. The game never blocks on the server: the level
 *  is computed locally from the date, and scores sync to /api/score when
 *  the Devvit server is reachable (best/streak come back from Redis). */
export const useDaily = () => {
  const [level] = useState<Level>(() => getDailyLevel(todayString()));
  const [result, setResult] = useState<TodayResult | null>(() => readResult(level.date));
  const [streak, setStreak] = useState<number>(() => readStreak());
  const [best, setBest] = useState<number | null>(() =>
    readResult(level.date) ? readResult(level.date)!.shots : null
  );
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch('/api/daily');
        if (!res.ok) return;
        const data: DailyResponse = await res.json();
        if (!cancelled && data.type === 'daily' && data.date === level.date) {
          setOnline(true);
        }
      } catch {
        // Offline/local mode: the game is fully playable without the server.
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [level.date]);

  const recordSolve = useCallback(
    async (shots: number): Promise<TodayResult> => {
      const stars = starsForShots(shots, level.par);
      const last = (() => {
        try {
          return localStorage.getItem(LAST_KEY);
        } catch {
          return null;
        }
      })();
      const nextStreak =
        last === level.date
          ? readStreak()
          : last === yesterdayString(level.date)
            ? readStreak() + 1
            : 1;
      const solved: TodayResult = { shots, stars, streak: nextStreak };
      try {
        localStorage.setItem(resultKey(level.date), JSON.stringify(solved));
        localStorage.setItem(STREAK_KEY, String(nextStreak));
        localStorage.setItem(LAST_KEY, level.date);
      } catch {
        // Storage unavailable: result still shown for this session.
      }
      setResult(solved);
      setStreak(nextStreak);
      setBest((prev) => (prev === null ? shots : Math.min(prev, shots)));
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shots }),
        });
        if (res.ok) {
          const data: ScoreResponse = await res.json();
          if (data.type === 'score' && !data.offline) {
            if (data.best !== null) setBest(data.best);
            if (data.streak !== null) setStreak(data.streak);
            setOnline(true);
          }
        }
      } catch {
        // Offline: local record stands.
      }
      return solved;
    },
    [level]
  );

  return { level, result, streak, best, online, recordSolve } as const;
};
