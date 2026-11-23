import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aimFromDrag,
  dateString,
  findSolution,
  getDailyLevel,
  hashSeed,
  mulberry32,
  shareText,
  simulate,
  starsForShots,
  yesterdayString,
} from './level.ts';

describe('Daily Orbit level', () => {
  it('is deterministic: same date gives the same level', () => {
    const a = getDailyLevel('2026-11-23');
    const b = getDailyLevel('2026-11-23');
    assert.deepEqual(a, b);
    const c = getDailyLevel('2026-11-24');
    assert.notDeepEqual(a, c);
  });

  it('is solvable for 90 consecutive days', () => {
    const start = new Date('2026-11-23T00:00:00Z');
    for (let i = 0; i < 90; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const level = getDailyLevel(dateString(d));
      const solution = findSolution(level);
      if (!solution) throw new Error(`no solution for ${level.date}`);
      const flight = simulate(level, solution.angle, solution.speed);
      assert.equal(flight.outcome, 'hit', `solution misses on ${level.date}`);
      assert.ok(Number.isFinite(flight.time) && flight.time > 0);
      assert.ok(flight.path.length > 2);
    }
  });

  it('keeps every simulated path finite (no NaN blow-ups)', () => {
    const level = getDailyLevel('2026-12-08');
    for (let deg = 0; deg < 360; deg += 15) {
      const flight = simulate(level, (deg * Math.PI) / 180, 540);
      for (const p of flight.path) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      }
    }
  });

  it('scores stars from shots', () => {
    assert.equal(starsForShots(1), 3);
    assert.equal(starsForShots(2), 3);
    assert.equal(starsForShots(3), 2);
    assert.equal(starsForShots(5), 1);
  });

  it('builds a share text with date, shots, stars, streak', () => {
    const text = shareText('2026-11-23', 2, 4);
    assert.ok(text.includes('Daily Orbit · 2026-11-23'));
    assert.ok(text.includes('Got it in 2 shots'));
    assert.ok(text.includes('⭐⭐⭐'));
    assert.ok(text.includes('4 day streak'));
  });

  it('maps a slingshot drag to an aim', () => {
    // Drag down-left => launch up-right.
    const aim = aimFromDrag({ x: -100, y: 100 });
    if (!aim) throw new Error('expected an aim for a 100px drag');
    assert.ok(aim.speed > 200 && aim.speed <= 540);
    // Tiny drag is not a shot.
    assert.equal(aimFromDrag({ x: 3, y: 2 }), null);
  });

  it('hashes seeds and dates consistently', () => {
    assert.equal(hashSeed('2026-11-23#0'), hashSeed('2026-11-23#0'));
    assert.notEqual(hashSeed('2026-11-23#0'), hashSeed('2026-11-23#1'));
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    assert.equal(r1(), r2());
    assert.equal(yesterdayString('2026-11-23'), '2026-11-22');
    assert.equal(yesterdayString('2026-12-01'), '2026-11-30');
  });
});
