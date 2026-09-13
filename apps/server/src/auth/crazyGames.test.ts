process.env.AUTH_JWT_SECRET = "test-only-secret";
process.env.ADS_MOCK = "true";

import { generateKeyPairSync, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestDb } from "../db/testDb.js";
import { verifyCrazyGamesToken } from "./crazyGames.js";

function keyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

// Stands in for CrazyGames' key endpoint: fetch reads a data: URL like any other.
const crazyGames = keyPair();
process.env.CRAZYGAMES_PUBLIC_KEY_URL = `data:application/json,${encodeURIComponent(
  JSON.stringify({ publicKey: crazyGames.publicKey }),
)}`;

/** A token shaped like the one CrazyGames' SDK hands the game. */
function crazyToken(userId: string, username: string, privateKey = crazyGames.privateKey): string {
  return jwt.sign({ userId, gameId: "char-guty", username, profilePictureUrl: "" }, privateKey, {
    algorithm: "RS256",
    expiresIn: "1h",
  });
}

describe("verifyCrazyGamesToken", () => {
  it("returns the player a CrazyGames token names", async () => {
    expect(await verifyCrazyGamesToken(crazyToken("cg-1", "Rafiq_99"))).toEqual({
      userId: "cg-1",
      username: "Rafiq_99",
    });
  });

  it("rejects a token signed by anyone else", async () => {
    const forged = crazyToken("cg-1", "Rafiq_99", keyPair().privateKey);
    await expect(verifyCrazyGamesToken(forged)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign(
      { userId: "cg-1", username: "Rafiq_99", exp: Math.floor(Date.now() / 1000) - 60 },
      crazyGames.privateKey,
      { algorithm: "RS256" },
    );
    await expect(verifyCrazyGamesToken(expired)).rejects.toThrow();
  });
});

describe("POST /auth/crazygames", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ db: await createTestDb() });
    await app.ready();
  }, 30_000);

  const signIn = (token: string, guestToken?: string) =>
    app.inject({ method: "POST", url: "/auth/crazygames", payload: { token, guestToken } });
  const me = (token: string) =>
    app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } });

  it("makes a new player an account with the signup bonus and their CrazyGames name", async () => {
    const res = await signIn(crazyToken(randomUUID(), "NewPlayer"));
    expect(res.statusCode).toBe(200);
    const body = res.json() as { userId: string; token: string; nickname: string };
    expect(body.nickname).toBe("NewPlayer");
    expect((await me(body.token)).json()).toMatchObject({
      userId: body.userId,
      nickname: "NewPlayer",
      coins: 300,
    });
  });

  it("turns the guest this device played as into the account, coins and all", async () => {
    const guest = (
      await app.inject({ method: "POST", url: "/auth/guest", payload: { nickname: "Guest1234" } })
    ).json() as { userId: string; token: string };
    await app.inject({
      method: "POST",
      url: "/ads/mock-reward",
      headers: { authorization: `Bearer ${guest.token}` },
      payload: { transactionId: randomUUID() },
    });

    const res = await signIn(crazyToken(randomUUID(), "Linked_1"), guest.token);
    const body = res.json() as { userId: string; token: string };
    expect(body.userId).toBe(guest.userId);
    expect((await me(body.token)).json()).toMatchObject({ nickname: "Linked_1", coins: 325 });
  });

  it("gives a returning player the same account, renamed if their name changed", async () => {
    const id = randomUUID();
    const first = (await signIn(crazyToken(id, "OldName"))).json() as { userId: string };
    const again = await signIn(crazyToken(id, "NewName"));
    expect(again.json()).toMatchObject({ userId: first.userId, nickname: "NewName" });
  });

  it("refuses a missing or forged token", async () => {
    const missing = await app.inject({ method: "POST", url: "/auth/crazygames", payload: {} });
    expect(missing.statusCode).toBe(400);
    const forged = await signIn(crazyToken(randomUUID(), "Forger", keyPair().privateKey));
    expect(forged.statusCode).toBe(401);
  });
});
