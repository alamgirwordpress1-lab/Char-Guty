import jwt, { type JwtPayload } from "jsonwebtoken";

const DEFAULT_KEY_URL = "https://sdk.crazygames.com/publicKey.json";
const CACHE_MS = 60 * 60 * 1000;
/** A key younger than this is not fetched again, so junk tokens can't make the server hammer CrazyGames. */
const REFETCH_AFTER_MS = 5 * 60 * 1000;

let cache: { key: string; fetchedAt: number } | null = null;

/** Who a CrazyGames user token names. */
export interface CrazyGamesPlayer {
  readonly userId: string;
  readonly username: string;
}

/** CrazyGames' signing key, cached for an hour; `fresh` skips the cache. */
async function publicKey(fresh: boolean): Promise<string> {
  if (!fresh && cache !== null && Date.now() - cache.fetchedAt < CACHE_MS) return cache.key;
  const url = process.env.CRAZYGAMES_PUBLIC_KEY_URL ?? DEFAULT_KEY_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch the CrazyGames public key: ${res.status}`);
  const body = (await res.json()) as { publicKey?: unknown };
  if (typeof body.publicKey !== "string") throw new Error("CrazyGames sent no public key");
  cache = { key: body.publicKey, fetchedAt: Date.now() };
  return body.publicKey;
}

function toPlayer(payload: string | JwtPayload): CrazyGamesPlayer {
  if (
    typeof payload === "object" &&
    typeof payload.userId === "string" &&
    typeof payload.username === "string"
  ) {
    return { userId: payload.userId, username: payload.username };
  }
  throw new Error("CrazyGames token names no user");
}

/**
 * Checks a token from the CrazyGames SDK's user.getUserToken() - RS256, signed by
 * CrazyGames, valid for an hour - and returns the player it names. A bad signature is
 * tried once more against a freshly fetched key, in case CrazyGames rotated it.
 */
export async function verifyCrazyGamesToken(token: string): Promise<CrazyGamesPlayer> {
  const check = async (fresh: boolean): Promise<CrazyGamesPlayer> =>
    toPlayer(jwt.verify(token, await publicKey(fresh), { algorithms: ["RS256"] }));
  try {
    return await check(false);
  } catch (err) {
    const keyIsRecent = cache !== null && Date.now() - cache.fetchedAt < REFETCH_AFTER_MS;
    const badSignature =
      err instanceof jwt.JsonWebTokenError && !(err instanceof jwt.TokenExpiredError);
    if (keyIsRecent || !badSignature) throw err;
    return check(true);
  }
}
