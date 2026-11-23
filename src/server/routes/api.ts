import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import { getDailyLevel, todayString, yesterdayString } from '../../shared/level.js';
import type {
  DailyResponse,
  ErrorResponse,
  ScoreRequest,
  ScoreResponse,
} from '../../shared/api.js';

export const api = new Hono();

api.get('/daily', (c) => {
  const level = getDailyLevel(todayString());
  return c.json<DailyResponse>({
    type: 'daily',
    date: level.date,
    par: level.par,
    wells: level.wells.length,
    rocks: level.rocks.length,
  });
});

api.post('/score', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }
  let body: ScoreRequest;
  try {
    body = await c.req.json<ScoreRequest>();
  } catch {
    return c.json<ErrorResponse>({ status: 'error', message: 'invalid JSON body' }, 400);
  }
  const shots = Math.floor(body.shots);
  if (!Number.isFinite(shots) || shots < 1 || shots > 99) {
    return c.json<ErrorResponse>({ status: 'error', message: 'shots must be 1..99' }, 400);
  }
  try {
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const date = todayString();
    const bestKey = `orbit:best:${postId}:${username}`;
    const playsKey = `orbit:plays:${postId}:${date}`;
    const streakKey = `orbit:streak:${username}`;
    const lastKey = `orbit:last:${username}`;
    const [prevBest, playsToday, prevStreak, lastPlayed] = await Promise.all([
      redis.get(bestKey),
      redis.incrBy(playsKey, 1),
      redis.get(streakKey),
      redis.get(lastKey),
    ]);
    const best = prevBest === undefined ? shots : Math.min(parseInt(prevBest), shots);
    let streak = prevStreak === undefined ? 1 : parseInt(prevStreak);
    if (lastPlayed !== date) {
      streak = lastPlayed === yesterdayString(date) ? streak + 1 : 1;
    }
    await Promise.all([
      redis.set(bestKey, String(best)),
      redis.set(streakKey, String(streak)),
      redis.set(lastKey, date),
    ]);
    return c.json<ScoreResponse>({ type: 'score', best, playsToday, streak });
  } catch (error) {
    console.error('Score submit failed:', error);
    return c.json<ScoreResponse>({
      type: 'score',
      best: null,
      playsToday: 0,
      streak: null,
      offline: true,
    });
  }
});
