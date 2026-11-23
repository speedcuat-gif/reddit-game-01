# Daily Orbit — Reddit's Game of the Day Hackathon

One fresh gravity-slingshot puzzle every day. Pull back, let it fly, hit the
gold ring. Same puzzle for everybody that day, so the whole sub can argue
about the same shot.

## How it plays

- Drag back from the launch pad (slingshot style) and release. A live dotted
  line shows where the probe is headed before you let go.
- Gravity wells bend the shot. Asteroids eat it. Flying off the edge wastes
  the shot.
- Hit the gold ring in as few shots as you can. Par 3. Three stars for
  two shots or fewer.
- One puzzle a day, seeded by the UTC date — deterministic, so everyone gets
  the same level. A solver check guarantees every day's puzzle is beatable
  (verified for 90 consecutive days in the unit tests).
- Solve it and your streak goes up. Already cleared today? It shows your
  result and the countdown to the next drop. Practice mode lets you run the
  same puzzle again without touching your streak.
- Hit "Copy my result" and you get a Wordle-style share line to drop in the
  comments.

## Stack

Devvit Web: React 19 + Tailwind 4 + Vite client, Hono server, Redis for
per-post best scores / play counts / streaks. The game itself is a plain
canvas renderer over a small pure-TypeScript physics + level module
(`src/shared/level.ts`) — the same module runs in the browser and in the
unit tests, so the daily puzzle is provably solvable by construction.

## Run it

```bash
npm install
npm run build        # vite build -> dist/client + dist/server
npm run test:unit    # 7 tests, incl. 90-day solvability
npm run test:types   # tsc --build
npm run lint
```

Devvit commands (need a Reddit login — see "Still needs a human" below):

```bash
npx devvit-cli login     # browser OAuth to a Reddit account
npx devvit-cli playtest  # play it live in a test subreddit
npx devvit-cli upload    # upload a version (kept private until launch)
```

## Test report (local, 2026-11-23)

- `npm run test:unit` — 7/7 pass, including solvability for 90 consecutive
  days, determinism, star thresholds, share text, drag mapping.
- `npm run test:types` — clean. `npm run lint` — clean.
  `npm run build` — complete, dist/client + dist/server.
- Browser playtest (headless Chromium, built files served from disk): the
  game loads, the drag shows a live trajectory preview, the verified shot
  fires and the probe rides the gravity wells into the ring — "You got it."
  with 3 stars in 1 shot, streak 1, countdown to the next puzzle. A
  deliberate bad shot in practice mode shows "Off the mark — run it back."
  and leaves the streak alone. Zero console errors.
- Screenshots: `web/screenshots/` (intro, aiming, flight, result, splash).
- Demo video: `web/demo.mp4` (27s, 900x900, silent, captioned walkthrough
  of the full loop — see `DEMO_SCRIPT.md` for the narration).

## Still needs a human

- A Reddit account + `devvit login`, then `upload` / playtest in a test
  subreddit and the demo post for judging. The builder has no Reddit
  credentials.
- Devpost submission (account + the demo post link + the video).
- The narrated video: `web/demo.mp4` is a silent captioned cut. A narrated
  version (<3 min) needs the live deployed game to record against, then a
  YouTube upload (needs the user's Google account).

## Origin

Scaffolded from Reddit's official `devvit-template-react` (see `NOTICE.md`
and the template's `LICENSE`). Everything about the game — the level
generator, physics, solver, UI, and copy — is original work written for
this hackathon.
