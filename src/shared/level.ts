// Daily Orbit — shared level generation, physics, and solver.
// Pure TypeScript: no DOM, no Devvit imports, so the client, the server,
// and the unit tests all share exactly the same level for a given date.

export type Vec = { x: number; y: number };

export type Well = Vec & { r: number; strength: number };

export type Rock = Vec & { r: number };

export type Level = {
  date: string; // YYYY-MM-DD (UTC)
  seed: number;
  width: number;
  height: number;
  launch: Vec;
  target: Vec & { r: number };
  wells: Well[];
  rocks: Rock[];
  par: number;
};

export const WORLD_WIDTH = 720;
export const WORLD_HEIGHT = 480;
export const PAR_SHOTS = 3;
export const MAX_SPEED = 540;
export const MIN_SPEED = 200;
export const MAX_DRAG = 140; // px of pull-back for full power
export const MAX_FLIGHT_SECONDS = 6;

const GRAVITY_MIN_DIST = 26;
const GRAVITY_MAX_ACCEL = 1800;
const STEP = 1 / 120; // fixed physics timestep (seconds)

export const dateString = (d: Date): string => d.toISOString().slice(0, 10);

export const todayString = (): string => dateString(new Date());

export const yesterdayString = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dateString(d);
};

// ---- Seeded RNG (mulberry32 over a string hash) ----

export const hashSeed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const range = (rand: () => number, min: number, max: number): number =>
  min + rand() * (max - min);

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

// ---- Physics ----

export type FlightResult = {
  outcome: 'hit' | 'rock' | 'out' | 'timeout';
  time: number;
  path: Vec[];
};

export const stepPhysics = (pos: Vec, vel: Vec, level: Level): Vec => {
  let ax = 0;
  let ay = 0;
  for (const w of level.wells) {
    const dx = w.x - pos.x;
    const dy = w.y - pos.y;
    const d = Math.max(Math.hypot(dx, dy), GRAVITY_MIN_DIST);
    const a = Math.min(w.strength / (d * d), GRAVITY_MAX_ACCEL);
    ax += (a * dx) / d;
    ay += (a * dy) / d;
  }
  return { x: vel.x + ax * STEP, y: vel.y + ay * STEP };
};

export const simulate = (
  level: Level,
  angle: number,
  speed: number,
  maxSeconds: number = MAX_FLIGHT_SECONDS
): FlightResult => {
  let pos = { ...level.launch };
  let vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  const path: Vec[] = [{ ...pos }];
  const steps = Math.round(maxSeconds / STEP);
  for (let i = 0; i < steps; i++) {
    vel = stepPhysics(pos, vel, level);
    pos = { x: pos.x + vel.x * STEP, y: pos.y + vel.y * STEP };
    if (i % 4 === 0) path.push({ ...pos });
    if (dist(pos, level.target) <= level.target.r + 6) {
      return { outcome: 'hit', time: (i + 1) * STEP, path };
    }
    for (const rock of level.rocks) {
      if (dist(pos, rock) <= rock.r + 6) {
        return { outcome: 'rock', time: (i + 1) * STEP, path };
      }
    }
    if (pos.x < -60 || pos.x > level.width + 60 || pos.y < -60 || pos.y > level.height + 60) {
      return { outcome: 'out', time: (i + 1) * STEP, path };
    }
  }
  return { outcome: 'timeout', time: maxSeconds, path };
};

// ---- Level generation (deterministic per date) ----

const buildLevel = (date: string, attempt: number): Level => {
  const rand = mulberry32(hashSeed(`${date}#${attempt}`));
  const launch = { x: range(rand, 70, 120), y: range(rand, 370, 420) };
  const target = { x: range(rand, 600, 680), y: range(rand, 60, 140), r: 16 };
  const wells: Well[] = [];
  const wellCount = 2 + (rand() < 0.5 ? 1 : 0);
  let guard = 0;
  while (wells.length < wellCount && guard < 200) {
    guard++;
    const w: Well = {
      x: range(rand, 230, 540),
      y: range(rand, 130, 350),
      r: range(rand, 24, 38),
      strength: range(rand, 1.4e6, 2.6e6),
    };
    if (dist(w, launch) < 100 || dist(w, target) < 100) continue;
    if (wells.some((o) => dist(o, w) < 120)) continue;
    wells.push(w);
  }
  const rocks: Rock[] = [];
  const rockCount = rand() < 0.5 ? 1 : rand() < 0.5 ? 2 : 0;
  guard = 0;
  while (rocks.length < rockCount && guard < 200) {
    guard++;
    const rock: Rock = {
      x: range(rand, 180, 580),
      y: range(rand, 90, 390),
      r: range(rand, 13, 20),
    };
    if (dist(rock, launch) < 80 || dist(rock, target) < 80) continue;
    if (wells.some((w) => dist(w, rock) < 70)) continue;
    if (rocks.some((o) => dist(o, rock) < 60)) continue;
    rocks.push(rock);
  }
  return {
    date,
    seed: hashSeed(`${date}#${attempt}`),
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    launch,
    target,
    wells,
    rocks,
    par: PAR_SHOTS,
  };
};

/** Find any (angle, speed) that hits the target, or null. */
export const findSolution = (level: Level): { angle: number; speed: number } | null => {
  for (let deg = 0; deg < 360; deg++) {
    const angle = (deg * Math.PI) / 180;
    for (let speed = MIN_SPEED; speed <= MAX_SPEED; speed += 17) {
      if (simulate(level, angle, speed).outcome === 'hit') {
        return { angle, speed };
      }
    }
  }
  return null;
};

/** Deterministic daily level: same date always yields the same level. */
export const getDailyLevel = (date: string): Level => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const level = buildLevel(date, attempt);
    if (findSolution(level)) return level;
  }
  // Extremely unlikely fallback: open field, no wells/rocks.
  return {
    date,
    seed: hashSeed(`${date}#fallback`),
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    launch: { x: 90, y: 400 },
    target: { x: 640, y: 100, r: 16 },
    wells: [],
    rocks: [],
    par: PAR_SHOTS,
  };
};

// ---- Scoring / sharing ----

export const starsForShots = (shots: number, par: number = PAR_SHOTS): number =>
  shots <= par - 1 ? 3 : shots <= par ? 2 : 1;

export const shareText = (date: string, shots: number, streak: number): string => {
  const stars = '⭐'.repeat(starsForShots(shots));
  return (
    `Daily Orbit · ${date}\n` +
    `Got it in ${shots} shot${shots === 1 ? '' : 's'} ${stars}\n` +
    `${streak} day streak 🔥`
  );
};

/** Aim vector from a slingshot drag: pull back opposite the launch direction. */
export const aimFromDrag = (drag: Vec): { angle: number; speed: number } | null => {
  const len = Math.hypot(drag.x, drag.y);
  if (len < 8) return null;
  const clamped = Math.min(len, MAX_DRAG);
  return {
    angle: Math.atan2(-drag.y, -drag.x),
    speed: MIN_SPEED + (clamped / MAX_DRAG) * (MAX_SPEED - MIN_SPEED),
  };
};
