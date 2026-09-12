import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import { matchMaker } from "colyseus";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { getVerifierKeys } from "./ads/googleKeys.js";
import { parseCallbackQuery, verifySignature } from "./ads/verifySignature.js";
import { issueGuestToken, verifyAuthToken } from "./auth/auth.js";
import {
  claimAdReward,
  DailyAdRewardCapError,
  DuplicateAdRewardError,
} from "./db/adRewardService.js";
import { getLeaderboard } from "./db/leaderboardRepository.js";
import type { Database } from "./db/types.js";
import { upsertUser } from "./db/userService.js";
import { getBalance } from "./db/walletService.js";

function bearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
}

export interface BuildAppOptions {
  readonly db: Database;
}

export function buildApp({ db }: BuildAppOptions): FastifyInstance {
  const app = Fastify();

  // Bearer-token auth (no cookies), served to web/native/FB-Instant-Games contexts
  // with different origins - reflecting the request origin is safe here since there's
  // no session/cookie to leak, and an allowlist would need constant upkeep.
  void app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  // Meta and Google both require a public privacy policy URL before a game can be
  // published, and the game has no site of its own - so it is served from here.
  app.get("/privacy", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return privacyPage();
  });

  app.post("/auth/guest", async (request) => {
    const body = request.body as { nickname?: string } | undefined;
    const nickname = body?.nickname ?? "Guest";
    const guestId = randomUUID();
    // Upsert now (not just at room join) so the id returned here - what the client
    // remembers as "me" - is the real db user id the room will use as player identity.
    const user = await upsertUser(db, {
      provider: "guest",
      providerId: guestId,
      nickname,
      isGuest: true,
    });
    return { userId: user.id, token: issueGuestToken(guestId), nickname };
  });

  app.get("/me", async (request, reply) => {
    const token = bearerToken(request);
    if (token === undefined) {
      reply.code(401);
      return { error: "missing bearer token" };
    }
    const { nickname } = request.query as { nickname?: string };
    try {
      const verified = await verifyAuthToken(token);
      // Idempotent: creates the user (+ signup bonus) on first call, no-ops after.
      const user = await upsertUser(db, {
        provider: verified.provider,
        providerId: verified.providerId,
        nickname: nickname ?? "Player",
        isGuest: verified.isGuest,
      });
      const balance = await getBalance(db, user.id);
      return { userId: user.id, nickname: user.nickname, ...balance };
    } catch {
      reply.code(401);
      return { error: "invalid token" };
    }
  });

  app.get("/rooms/by-code/:code", async (request, reply) => {
    const token = bearerToken(request);
    if (token === undefined) {
      reply.code(401);
      return { error: "missing bearer token" };
    }
    try {
      await verifyAuthToken(token);
    } catch {
      reply.code(401);
      return { error: "invalid token" };
    }

    const { code } = request.params as { code: string };
    const rooms = await matchMaker.query({ name: "guti" });
    const room = rooms.find((r) => r.metadata?.code === code);
    if (room === undefined) {
      reply.code(404);
      return { error: "room not found" };
    }
    return { roomId: room.roomId };
  });

  app.get("/leaderboard", async (request) => {
    const { period } = request.query as { period?: string };
    const normalized = period === "week" ? "week" : "all";
    const entries = await getLeaderboard(db, normalized);
    return { period: normalized, entries };
  });

  // Real AdMob SSV: signature-verified against Google's rotating public keys.
  // Declared POST per spec; the signed payload still lives in the query string,
  // which is how AdMob's SSV mechanism works regardless of HTTP method.
  app.post("/ads/reward-callback", async (request, reply) => {
    const rawQuery = request.raw.url?.split("?")[1] ?? "";
    const parsed = parseCallbackQuery(rawQuery);
    if (parsed === null) {
      reply.code(400);
      return { error: "malformed callback" };
    }

    let keys;
    try {
      keys = await getVerifierKeys();
    } catch {
      reply.code(502);
      return { error: "could not fetch verifier keys" };
    }
    if (!verifySignature(parsed, keys)) {
      reply.code(403);
      return { error: "invalid signature" };
    }

    const query = request.query as Record<string, string | undefined>;
    const transactionId = query.transaction_id;
    const userId = query.custom_data ?? query.user_id;
    const network = query.ad_network ?? "admob";
    if (transactionId === undefined || userId === undefined) {
      reply.code(400);
      return { error: "missing transaction_id or user_id" };
    }

    try {
      await claimAdReward(db, { userId, network, transactionId });
      return { ok: true };
    } catch (err) {
      // 200 so the network doesn't keep retrying a claim that will never succeed.
      if (err instanceof DuplicateAdRewardError) return { ok: false, reason: "duplicate" };
      if (err instanceof DailyAdRewardCapError) return { ok: false, reason: "cap_exceeded" };
      throw err;
    }
  });

  // Rewards the client says it earned, so each route stays off unless its env flag is set:
  // ADS_MOCK for local testing without an ad network, INSTANT_AD_REWARDS for Facebook
  // Instant Games, whose SDK gives no server-side proof a video was watched. The daily
  // cap is what stops either from being farmed.
  const clientRewardRoutes = [
    { enabled: process.env.ADS_MOCK === "true", path: "/ads/mock-reward", network: "mock" },
    {
      enabled: process.env.INSTANT_AD_REWARDS === "true",
      path: "/ads/instant-reward",
      network: "fb_instant",
    },
  ];
  for (const route of clientRewardRoutes) {
    if (!route.enabled) continue;
    app.post(route.path, async (request, reply) => {
      const token = bearerToken(request);
      if (token === undefined) {
        reply.code(401);
        return { error: "missing bearer token" };
      }
      let verified;
      try {
        verified = await verifyAuthToken(token);
      } catch {
        reply.code(401);
        return { error: "invalid token" };
      }
      const user = await upsertUser(db, {
        provider: verified.provider,
        providerId: verified.providerId,
        nickname: "Player",
        isGuest: verified.isGuest,
      });

      const body = request.body as { transactionId?: string } | undefined;
      const transactionId = body?.transactionId ?? randomUUID();
      try {
        const balance = await claimAdReward(db, {
          userId: user.id,
          network: route.network,
          transactionId,
        });
        return { ok: true, ...balance };
      } catch (err) {
        if (err instanceof DuplicateAdRewardError) {
          reply.code(409);
          return { ok: false, reason: "duplicate" };
        }
        if (err instanceof DailyAdRewardCapError) {
          reply.code(429);
          return { ok: false, reason: "cap_exceeded" };
        }
        throw err;
      }
    });
  }

  return app;
}

/** The privacy policy and data-deletion instructions, kept in one page so both links can point here. */
function privacyPage(): string {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  const reach = contact === undefined ? "through the game's page on Facebook" : `at ${contact}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Char Guty - Privacy Policy</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 32px 20px 64px; background: #0a173f; color: #e8eeff;
         font: 16px/1.65 "Segoe UI", system-ui, sans-serif; }
  main { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 30px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 32px 0 8px; color: #ffd166; }
  p, li { color: #c8d5f5; }
  .updated { color: #8fa6d8; font-size: 14px; margin-bottom: 24px; }
</style></head>
<body><main>
<h1>Char Guty - Privacy Policy</h1>
<p class="updated">Last updated: 12 September 2026</p>

<p>Char Guty is a free game. It has no purchases and pays out no money. The coins in the
game have no cash value.</p>

<h2>What the game stores</h2>
<ul>
  <li>A player id the game creates for you, and the nickname shown to other players.</li>
  <li>Your coins, win points and the results of matches you play.</li>
  <li>On your device: your sign-in for this game and your sound setting.</li>
</ul>

<h2>What the game does not collect</h2>
<ul>
  <li>No name, photo or friend list from Facebook. On Facebook the game runs with Zero
      Permissions, so Meta does not share your profile with it.</li>
  <li>No password, no payment details, no location, no contacts.</li>
</ul>

<h2>Ads</h2>
<p>Where ads are shown, they are served by Meta Audience Network, which handles that ad
data under Meta's own terms. The game does not pass your game data to advertisers.</p>

<h2>Deleting your data</h2>
<p>Ask us to delete your account and we remove your player record, nickname, coins, win
points and match history. Reach us ${reach} and say which nickname to delete.</p>

<h2>Children</h2>
<p>The game is not directed at children under 13.</p>

<h2>Contact</h2>
<p>Questions about this policy: reach us ${reach}.</p>
</main></body></html>`;
}
