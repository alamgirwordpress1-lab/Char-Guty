# Char Guty (চার গুটি) — spec (source of truth, keep short)
Traditional Bangladeshi game, 2–4 players online. Free-to-play: coins only. NO purchases, NO cash payouts, ever. Revenue = ads only.

## Rules
- 4 pieces ("guti"). Each lands flat-up (F) or round-up (R). Server RNG, p_flat = 0.70 (config). Never Math.random in game-core; inject an RNG interface.
- Turn: THROW → RESOLVE → TOKKA (0–2 flicks) → SCORE, then the same player throws again: a turn only passes on a die. Timer 30s per action; timeout = die.
- By flat count: 4F → 4 pts, no tokka. 3F, 2F, 1F → 2 tokkas, 1 pt each; a failed tokka = die (turn passes, points from completed tokkas kept). 0F → instant match win.
- Tokka: carrom-style - player grabs any guti, pulls back and releases to flick it, harder the further the pull. Nothing is pre-marked; touching any other guti scores 1 and both gutis go out, so the second tokka is between the two left; touching none is a die. The mat's edge stops gutis. Tokkas should be hard to land: every flick strays a little from its aim (server RNG), more the harder it is flicked, and the aim shows that spread. Deterministic 2D sim (circles, friction, fixed dt) in game-core; server authoritative, client only previews.
- Guti: a 2-inch round stick split lengthwise - one flat face, a rounded back, flat ends.
- Match: pot ∈ {100,200,300,400,500}, must divide evenly by player count. Stake = pot / players, deducted at start. First to reach `pot` points wins the whole pot. Then reset.
- Vs Computer: the player's own choice from the lobby (like Ludo), never a matchmaking fallback. Computer players are server-driven; practice only, no coins or Win Points.
- All in-game text is English.

## Economy
- Coins: signup 300; rewarded ad +25 (max 12/day); win +pot. Never below 0. No purchase. No cash-out.
- Win Points: +pot per win, leaderboard only, never spent, never paid out.

## Stack
- packages/game-core: pure rules + sim + vitest, zero deps. Used by server and client.
- packages/shared: zod schemas, message types, constants.
- apps/server: Colyseus 0.16 + Fastify, Drizzle + Postgres, Redis. Server-authoritative; client never computes outcomes.
- apps/game: Phaser 4 + Vite. Targets: web, Capacitor Android, Facebook Instant Games, CrazyGames.
- apps/admin: Next.js (later).

## Working rules for Claude
- Do not explain code in chat. Write files, run tests once, report pass/fail in ≤5 lines.
- Do not take browser screenshots unless asked.
- Check `git log --oneline -5` first to see progress.
