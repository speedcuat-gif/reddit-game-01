import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { showToast } from '@devvit/web/client';
import {
  MAX_DRAG,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  aimFromDrag,
  mulberry32,
  shareText,
  simulate,
  starsForShots,
  stepPhysics,
  type Vec,
} from '../shared/level';
import { useDaily } from './hooks/useDaily';

type Phase = 'aim' | 'flying' | 'done';
type Flight = { pos: Vec; vel: Vec; time: number; trail: Vec[] };

const STEP = 1 / 120;

const toLogical = (e: ReactPointerEvent, canvas: HTMLCanvasElement): Vec => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH,
    y: ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT,
  };
};

const toast = (message: string) => {
  try {
    showToast(message);
  } catch {
    // Outside Reddit the toast bridge is a no-op.
  }
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
};

const countdownToMidnight = (): string => {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const ms = next.getTime() - now.getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export const App = () => {
  const { level, result, streak, best, recordSolve } = useDaily();
  const [practice, setPractice] = useState(false);
  const [phase, setPhase] = useState<Phase>(() => (result ? 'done' : 'aim'));
  const [shots, setShots] = useState(() => (result ? result.shots : 0));
  const [flash, setFlash] = useState('');
  const [countdown, setCountdown] = useState(countdownToMidnight);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Vec | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const shakeRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const shotsRef = useRef(shots);
  const practiceRef = useRef(practice);
  const resultRef = useRef(result);

  useEffect(() => {
    phaseRef.current = phase;
    shotsRef.current = shots;
    practiceRef.current = practice;
    resultRef.current = result;
  });

  const stars = useMemo(() => {
    const rand = mulberry32(level.seed);
    return Array.from({ length: 90 }, () => ({
      x: rand() * WORLD_WIDTH,
      y: rand() * WORLD_HEIGHT,
      r: 0.5 + rand() * 1.4,
      tw: rand() * Math.PI * 2,
    }));
  }, [level.seed]);

  useEffect(() => {
    const id = window.setInterval(() => setCountdown(countdownToMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const resetRound = useCallback(() => {
    flightRef.current = null;
    dragRef.current = null;
    setPhase('aim');
  }, []);

  const startPractice = useCallback(() => {
    setPractice(true);
    setShots(0);
    setFlash('');
    resetRound();
  }, [resetRound]);

  const backToDaily = useCallback(() => {
    setPractice(false);
    setShots(resultRef.current ? resultRef.current.shots : 0);
    setPhase(resultRef.current ? 'done' : 'aim');
    resetRound();
  }, [resetRound]);

  const finishShot = useCallback(
    (outcome: 'hit' | 'rock' | 'out' | 'timeout') => {
      flightRef.current = null;
      if (outcome === 'hit') {
        const finalShots = shotsRef.current;
        setPhase('done');
        if (!practiceRef.current && !resultRef.current) {
          void recordSolve(finalShots).then((solved) => {
            setFlash(`You got it in ${finalShots} — ${'⭐'.repeat(solved.stars)}`);
          });
        } else {
          setFlash(`You got it in ${finalShots} — nice.`);
        }
      } else {
        shakeRef.current = performance.now() + 250;
        setFlash(outcome === 'rock' ? 'Clipped a rock — run it back.' : 'Off the mark — run it back.');
        setPhase('aim');
      }
    },
    [recordSolve]
  );

  // Game loop: physics + render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD_WIDTH * dpr;
    canvas.height = WORLD_HEIGHT * dpr;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const draw = (now: number) => {
      const t = now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const shake =
        now < shakeRef.current ? (Math.random() - 0.5) * 6 : 0;
      ctx.translate(shake, shake);

      // Space.
      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
      bg.addColorStop(0, '#0b1026');
      bg.addColorStop(1, '#241145');
      ctx.fillStyle = bg;
      ctx.fillRect(-10, -10, WORLD_WIDTH + 20, WORLD_HEIGHT + 20);
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + s.tw);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Gravity wells.
      for (const w of level.wells) {
        const glow = ctx.createRadialGradient(w.x, w.y, 4, w.x, w.y, w.r * 2.6);
        glow.addColorStop(0, 'rgba(168, 85, 247, 0.55)');
        glow.addColorStop(0.5, 'rgba(124, 58, 237, 0.18)');
        glow.addColorStop(1, 'rgba(124, 58, 237, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)';
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -t * 12;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rocks.
      for (const rock of level.rocks) {
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#57534e';
        ctx.beginPath();
        ctx.arc(rock.x - rock.r * 0.3, rock.y - rock.r * 0.25, rock.r * 0.28, 0, Math.PI * 2);
        ctx.arc(rock.x + rock.r * 0.35, rock.y + rock.r * 0.3, rock.r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Target: pulsing gold ring.
      const pulse = 1 + 0.12 * Math.sin(t * 3);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(level.target.x, level.target.y, level.target.r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(level.target.x, level.target.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Launch pad.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(level.launch.x, level.launch.y, 20, 0, Math.PI * 2);
      ctx.stroke();

      // Trajectory preview while aiming.
      const drag = dragRef.current;
      if (phaseRef.current === 'aim' && drag) {
        const aim = aimFromDrag(drag);
        if (aim) {
          const preview = simulate(level, aim.angle, aim.speed, 1.2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          preview.path.forEach((p, i) => {
            if (i % 2 === 0) {
              ctx.globalAlpha = Math.max(0.15, 0.9 - i * 0.02);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          });
          ctx.globalAlpha = 1;
          // Rubber band.
          ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(level.launch.x, level.launch.y);
          ctx.lineTo(level.launch.x + drag.x, level.launch.y + drag.y);
          ctx.stroke();
        }
      }

      // Flight trail + probe.
      const flight = flightRef.current;
      if (flight) {
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        flight.trail.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        const glow = ctx.createRadialGradient(
          flight.pos.x, flight.pos.y, 1, flight.pos.x, flight.pos.y, 16
        );
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        glow.addColorStop(0.4, 'rgba(251, 146, 60, 0.8)');
        glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(flight.pos.x, flight.pos.y, 16, 0, Math.PI * 2);
        ctx.fill();
      } else if (phaseRef.current === 'aim') {
        // Idle probe on the pad, gently bobbing.
        const bob = Math.sin(t * 2) * 2;
        ctx.fillStyle = '#fff7ed';
        ctx.beginPath();
        ctx.arc(level.launch.x, level.launch.y + bob, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(level.launch.x, level.launch.y + bob, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const flight = flightRef.current;
      if (flight && phaseRef.current === 'flying') {
        acc += dt;
        let done: 'hit' | 'rock' | 'out' | 'timeout' | null = null;
        while (acc >= STEP && !done) {
          acc -= STEP;
          flight.vel = stepPhysics(flight.pos, flight.vel, level);
          flight.pos = {
            x: flight.pos.x + flight.vel.x * STEP,
            y: flight.pos.y + flight.vel.y * STEP,
          };
          flight.time += STEP;
          flight.trail.push({ ...flight.pos });
          if (flight.trail.length > 90) flight.trail.shift();
          if (Math.hypot(flight.pos.x - level.target.x, flight.pos.y - level.target.y) <= level.target.r + 6) {
            done = 'hit';
          } else if (
            level.rocks.some(
              (r) => Math.hypot(flight.pos.x - r.x, flight.pos.y - r.y) <= r.r + 6
            )
          ) {
            done = 'rock';
          } else if (
            flight.pos.x < -60 || flight.pos.x > WORLD_WIDTH + 60 ||
            flight.pos.y < -60 || flight.pos.y > WORLD_HEIGHT + 60
          ) {
            done = 'out';
          } else if (flight.time >= 6) {
            done = 'timeout';
          }
        }
        if (done) finishShot(done);
      }
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level, finishShot, stars]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (phase !== 'aim') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const p = toLogical(e, canvas);
    dragRef.current = { x: p.x - level.launch.x, y: p.y - level.launch.y };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (phase !== 'aim' || !dragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = toLogical(e, canvas);
    const raw = { x: p.x - level.launch.x, y: p.y - level.launch.y };
    const len = Math.hypot(raw.x, raw.y);
    const clamped = len > MAX_DRAG ? (MAX_DRAG / len) : 1;
    dragRef.current = { x: raw.x * clamped, y: raw.y * clamped };
  };

  const onPointerUp = () => {
    if (phase !== 'aim') return;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const aim = aimFromDrag(drag);
    if (!aim) return;
    flightRef.current = {
      pos: { ...level.launch },
      vel: { x: Math.cos(aim.angle) * aim.speed, y: Math.sin(aim.angle) * aim.speed },
      time: 0,
      trail: [{ ...level.launch }],
    };
    setShots((s) => s + 1);
    setFlash('');
    setPhase('flying');
  };

  const onCopyResult = async () => {
    const solved = result ?? { shots, stars: starsForShots(shots, level.par), streak };
    const text = shareText(level.date, solved.shots, solved.streak);
    if (await copyText(text)) {
      setCopied(true);
      toast('Copied — go flex it.');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast('Copy did not work here — screenshot it instead.');
    }
  };

  const solvedStars = result ? result.stars : shots > 0 ? starsForShots(shots, level.par) : 0;

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#0b1026] text-white px-3 py-3 gap-3">
      <header className="w-full max-w-[720px] flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black leading-none">🪐 Daily Orbit</h1>
          <p className="text-xs text-indigo-300 mt-1">{level.date}</p>
        </div>
        <div className="flex gap-1.5 text-xs font-semibold">
          <span className="bg-white/10 rounded-full px-2.5 py-1">Shots {shots}</span>
          <span className="bg-white/10 rounded-full px-2.5 py-1">Par {level.par}</span>
          <span className="bg-white/10 rounded-full px-2.5 py-1">🔥 {streak}</span>
          {best !== null && (
            <span className="bg-white/10 rounded-full px-2.5 py-1">Best {best}</span>
          )}
        </div>
      </header>

      {practice && (
        <p className="text-xs bg-amber-400/15 text-amber-200 rounded-full px-3 py-1">
          Practice — same puzzle, streak stays safe.
        </p>
      )}

      <div className="relative w-full max-w-[720px]">
        <canvas
          ref={canvasRef}
          className="w-full rounded-2xl touch-none select-none"
          style={{ aspectRatio: '720 / 480', cursor: phase === 'aim' ? 'grab' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {phase === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 rounded-2xl p-4">
            <div className="bg-[#171233] rounded-2xl p-5 w-full max-w-[340px] text-center shadow-2xl">
              <p className="text-2xl font-black">You got it.</p>
              <p className="text-3xl mt-2">{'⭐'.repeat(Math.max(1, solvedStars))}</p>
              <p className="text-sm text-indigo-200 mt-2">
                {shots} shot{shots === 1 ? '' : 's'} · par {level.par} · 🔥 {streak} day streak
              </p>
              {!practice && result && (
                <p className="text-xs text-indigo-300 mt-2">
                  You already cleared today&apos;s. New one drops in {countdown}.
                </p>
              )}
              <div className="flex flex-col gap-2 mt-4">
                <button
                  className="bg-[#d93900] hover:bg-[#c23300] rounded-full py-2.5 font-bold cursor-pointer"
                  onClick={onCopyResult}
                >
                  {copied ? 'Copied ✓' : 'Copy my result'}
                </button>
                {practice ? (
                  <button
                    className="bg-white/10 hover:bg-white/20 rounded-full py-2.5 font-bold cursor-pointer"
                    onClick={backToDaily}
                  >
                    Back to today&apos;s puzzle
                  </button>
                ) : (
                  <button
                    className="bg-white/10 hover:bg-white/20 rounded-full py-2.5 font-bold cursor-pointer"
                    onClick={startPractice}
                  >
                    Run it again (practice)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-indigo-200 text-center max-w-[560px] min-h-[1.25rem]">
        {flash ||
          (phase === 'aim'
            ? 'Pull back on the probe, let it fly. Gravity gon’ bend it — hit the gold ring.'
            : 'Watch it ride…')}
      </p>

      <footer className="text-[0.8em] text-indigo-300/70">
        One fresh puzzle every day · same one for everybody · come back tomorrow
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
