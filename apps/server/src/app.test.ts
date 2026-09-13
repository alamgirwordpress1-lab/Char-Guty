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

describe.each([
  { path: "/ads/instant-reward", flag: "INSTANT_AD_REWARDS" },
  { path: "/ads/crazygames-reward", flag: "CRAZYGAMES_AD_REWARDS" },
])("POST $path", ({ path, flag }) => {
  let flaggedApp: FastifyInstance;

  beforeAll(async () => {
    process.env[flag] = "true";
    flaggedApp = buildApp({ db });
    delete process.env[flag];
    await flaggedApp.ready();
  });

  it("does not exist unless its flag is on", async () => {
    const token = await guestToken();
    const res = await app.inject({
      method: "POST",
      url: path,
      headers: { authorization: `Bearer ${token}` },
      payload: { transactionId: randomUUID() },
    });
    expect(res.statusCode).toBe(404);
  });

  it("credits a claim when on, and refuses the same transaction twice", async () => {
    const token = await guestToken();
    const transactionId = randomUUID();
    const claim = () =>
      flaggedApp.inject({
        method: "POST",
        url: path,
        headers: { authorization: `Bearer ${token}` },
        payload: { transactionId },
      });
    const first = await claim();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, coins: 325 });
    const replay = await claim();
    expect(replay.statusCode).toBe(409);
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

describe("admin routes", () => {
  let adminApp: FastifyInstance;
  const TOKEN = "admin-test-token";

  beforeAll(async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    adminApp = buildApp({ db });
    delete process.env.ADMIN_TOKEN;
    await adminApp.ready();
  });

  const asAdmin = (
    url: string,
    method: "GET" | "POST" = "GET",
    payload?: Record<string, unknown>,
  ) =>
    adminApp.inject({
      method,
      url,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload,
    });

  it("do not exist unless ADMIN_TOKEN is set", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/players" });
    expect(res.statusCode).toBe(404);
  });

  it("refuse a missing or wrong token on every data route", async () => {
    for (const url of [
      "/admin/stats",
      "/admin/activity",
      "/admin/players",
      "/admin/matches",
      "/admin/ledger",
      "/admin/ledger/reasons",
    ]) {
      expect((await adminApp.inject({ method: "GET", url })).statusCode).toBe(401);
      const wrong = await adminApp.inject({
        method: "GET",
        url,
        headers: { authorization: "Bearer nope" },
      });
      expect(wrong.statusCode).toBe(401);
    }
  });

  it("serve the console page without a token, since it asks for one itself", async () => {
    const res = await adminApp.inject({ method: "GET", url: "/admin" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Char Guty admin");
    // Without this, #login's display: grid kept the sign-in card over the dashboard.
    expect(res.body).toContain("[hidden] { display: none !important; }");
    expect(res.body).toContain('id="remember"');
  });

  it("list and find a player, ban them out of /me, and let them back in", async () => {
    const signup = await adminApp.inject({
      method: "POST",
      url: "/auth/guest",
      payload: { nickname: "banme" },
    });
    const { userId, token } = signup.json() as { userId: string; token: string };

    const found = await asAdmin("/admin/players?q=banme");
    const page = found.json() as {
      rows: { id: string }[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(page.rows.map((r) => r.id)).toEqual([userId]);
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 25 });

    const banned = await asAdmin(`/admin/players/${userId}/ban`, "POST", { reason: "testing" });
    expect(banned.json()).toEqual({ ok: true, banned: true });
    expect((await asAdmin("/admin/players?status=banned")).json()).toMatchObject({ total: 1 });

    const me = () =>
      adminApp.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } });
    expect((await me()).statusCode).toBe(403);

    await asAdmin(`/admin/players/${userId}/unban`, "POST");
    expect((await me()).statusCode).toBe(200);
  });

  it("serve the dashboard numbers, activity, matches and transactions", async () => {
    const stats = (await asAdmin("/admin/stats")).json() as {
      players: { total: number };
      coinsInCirculation: number;
    };
    expect(stats.players.total).toBeGreaterThan(0);
    expect(stats.coinsInCirculation).toBeGreaterThan(0);

    expect((await asAdmin("/admin/activity?days=7")).json()).toHaveLength(7);
    expect((await asAdmin("/admin/matches")).json()).toMatchObject({ page: 1 });

    const ledgerPage = (await asAdmin("/admin/ledger?reason=signup_bonus")).json() as {
      rows: { reason: string }[];
    };
    expect(ledgerPage.rows.every((r) => r.reason === "signup_bonus")).toBe(true);
    expect((await asAdmin("/admin/ledger/reasons")).json()).toContain("signup_bonus");
  });

  it("ignore filter values outside the known choices", async () => {
    const res = await asAdmin("/admin/players?status=bogus&sort=bogus&pageSize=-5");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pageSize: 1 });
  });

  it("404 on a player who does not exist", async () => {
    expect((await asAdmin(`/admin/players/${randomUUID()}`)).statusCode).toBe(404);
    expect((await asAdmin("/admin/players/not-a-uuid")).statusCode).toBe(404);
  });
});
