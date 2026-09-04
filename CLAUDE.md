# Char Guty (চার গুটি) — spec (source of truth, keep short)
Traditional Bangladeshi game, 2–4 players online. Free-to-play: coins only. NO purchases, NO cash payouts, ever. Revenue = ads only.

## Rules
- 4 pieces ("guti"). Each lands flat-up (F) or round-up (R). Server RNG, p_flat = 0.70 (config). Never Math.random in game-core; inject an RNG interface.
- Turn: THROW → RESOLVE → TOKKA (0–2 flicks) → SCORE. Timer 30s per action; timeout = die.
- By flat count: 4F → 4 pts, no tokka. 3F, 2F, 1F → 2 tokkas, 1 pt each; a failed tokka = die (turn passes, points from that turn kept only for completed tokkas). 0F → instant match win.
- Tokka: player flicks one guti at an eligible partner guti. Server picks pairs by distance ≤ TOKKA_RADIUS (config, default 80). Deterministic 2D sim (circles, friction, fixed dt) in game-core; server authoritative, client only previews.
- Match: pot ∈ {100,200,300,400,500}, must divide evenly by player count. Stake = pot / players, deducted at start. First to reach `pot` points wins the whole pot. Then reset.

## Economy
- Coins: signup 300; rewarded ad +25 (max 12/day); win +pot. Never below 0. No purchase. No cash-out.
- Win Points: +pot per win, leaderboard only, never spent, never paid out.

## Stack
- packages/game-core: pure rules + sim + vitest, zero deps. Used by server and client.
- packages/shared: zod schemas, message types, constants.
- apps/server: Colyseus 0.16 + Fastify, Drizzle + Postgres, Redis. Server-authoritative; client never computes outcomes.
- apps/game: Phaser 4 + Vite. Targets: web, Capacitor Android, Facebook Instant Games.
- apps/admin: Next.js (later).

## Working rules for Claude
- Do not explain code in chat. Write files, run tests once, report pass/fail in ≤5 lines.
- Do not take browser screenshots unless asked.
- Check `git log --oneline -5` first to see progress.
