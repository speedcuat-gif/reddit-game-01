# NOTICE

## Scaffold

This project was scaffolded from Reddit's official
`devvit-template-react` (React 19 + Tailwind 4 + Vite client, Hono server).
The template's own license is kept in `LICENSE`. The template's
`AGENTS.md` was followed throughout (Devvit Web only — no Blocks, no
`@devvit/public-api`).

## This entry

Everything about the game itself is original work written for Reddit's
Game of the Day Hackathon (2026):

- the daily level generator, seeded physics, and solver
  (`src/shared/level.ts`),
- the canvas game, splash screen, and daily-state hook
  (`src/client/`),
- the score/streak API (`src/server/routes/api.ts`),
- all in-game copy, share text, and the demo narration
  (`DEMO_SCRIPT.md`).

No third-party game code, assets, or entries were copied. The only
external images are the template's stock `snoo.png` and the built
Tailwind stylesheet; the game art (starfield, gravity wells, probe,
target ring) is drawn in code.
