process.env.AUTH_JWT_SECRET = "test-only-secret";
process.env.ADS_MOCK = "true";

import { MAX_REWARDED_ADS_PER_DAY } from "@char-guty/shared";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { createTestDb } from "./db/testDb.js";
import type { Database } from "./db/types.js";

let app: FastifyInstance;
let db: Database;

beforeAll(async () => {
  db = await createTestDb();
  app = buildApp({ db });
  await app.ready();
}, 30_000);

async function guestToken(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest",
    payload: { nickname: "bot" },
  });
  return (res.json() as { token: string }).token;
}

function claimAd(token: string, transactionId = randomUUID()) {
  return app.inject({
    method: "POST",
    url: "/ads/mock-reward",
    headers: { authorization: `Bearer ${token}` },
    payload: { transactionId },
  });
}

describe("GET /health", () => {
  it("responds ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /me", () => {
  it("returns the signup balance for a fresh guest", async () => {
    const token = await guestToken();
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ coins: 300, winPoints: 0 });
  });

  it("rejects a missing bearer token", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /ads/mock-reward", () => {
  it("credits a valid claim", async () => {
    const token = await guestToken();
    const res = await claimAd(token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, coins: 325, winPoints: 0 });
  });

  it("rejects a replayed transaction_id without crediting twice", async () => {
    const token = await guestToken();
    const transactionId = randomUUID();
    const first = await claimAd(token, transactionId);
    expect(first.statusCode).toBe(200);

    const second = await claimAd(token, transactionId);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ ok: false, reason: "duplicate" });
  });

  it("allows exactly the daily cap, then rejects and stops crediting", async () => {
    const token = await guestToken();
    for (let i = 0; i < MAX_REWARDED_ADS_PER_DAY; i++) {
      const res = await claimAd(token);
      expect(res.statusCode).toBe(200);
    }
    const meBefore = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    const balanceBefore = (meBefore.json() as { coins: number }).coins;

    const capped = await claimAd(token);
    expect(capped.statusCode).toBe(429);
    expect(capped.json()).toMatchObject({ ok: false, reason: "cap_exceeded" });

    const meAfter = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect((meAfter.json() as { coins: number }).coins).toBe(balanceBefore);
  });

  it("rejects a missing bearer token", async () => {
    const res = await app.inject({ method: "POST", url: "/ads/mock-reward", payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /leaderboard", () => {
  it("defaults to all-time and returns an array", async () => {
    const res = await app.inject({ method: "GET", url: "/leaderboard" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { period: string; entries: unknown[] };
    expect(body.period).toBe("all");
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("accepts period=week", async () => {
    const res = await app.inject({ method: "GET", url: "/leaderboard?period=week" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { period: string }).period).toBe("week");
  });
});
