import "dotenv/config";
import { randomUUID } from "node:crypto";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { matchMaker, Server } from "colyseus";
import Fastify, { type FastifyRequest } from "fastify";
import { issueGuestToken, verifyAuthToken } from "./auth/auth.js";
import { db } from "./db/client.js";
import { upsertUser } from "./db/userService.js";
import { getBalance } from "./db/walletService.js";
import { GutiRoom } from "./rooms/GutiRoom.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = Fastify();

function bearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
}

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

app.get("/wallet", async (request, reply) => {
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

// Colyseus wraps whatever request listeners Fastify has already registered on
// this http.Server, so Fastify's routes must be fully ready before the
// WebSocketTransport/Server are constructed below.
await app.ready();

const transport = new WebSocketTransport({ server: app.server });
const gameServer = new Server({ transport });
gameServer.define("guti", GutiRoom).filterBy(["mode", "pot", "playerCount"]);

await gameServer.listen(PORT);
console.log(`char-guty server listening on :${PORT}`);
