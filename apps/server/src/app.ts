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

  if (process.env.ADS_MOCK === "true") {
    app.post("/ads/mock-reward", async (request, reply) => {
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
          network: "mock",
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
