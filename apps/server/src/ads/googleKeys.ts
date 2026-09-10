import type { VerifierKey } from "./verifySignature.js";

const DEFAULT_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const CACHE_MS = 60 * 60 * 1000;

interface GoogleKeysResponse {
  readonly keys: readonly { keyId: number; pem: string; base64: string }[];
}

let cache: { keys: VerifierKey[]; fetchedAt: number } | null = null;

/** Google rotates these; cached for an hour rather than fetched on every callback. */
export async function getVerifierKeys(): Promise<VerifierKey[]> {
  if (cache !== null && Date.now() - cache.fetchedAt < CACHE_MS) return cache.keys;

  const url = process.env.ADMOB_VERIFIER_KEYS_URL ?? DEFAULT_KEYS_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch AdMob verifier keys: ${res.status}`);
  const body = (await res.json()) as GoogleKeysResponse;
  const keys = body.keys.map((k) => ({ keyId: k.keyId, pem: k.pem }));
  cache = { keys, fetchedAt: Date.now() };
  return keys;
}
