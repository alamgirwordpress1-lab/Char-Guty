import { createVerify } from "node:crypto";

export interface VerifierKey {
  readonly keyId: number;
  readonly pem: string;
}

export interface ParsedCallback {
  /** The exact raw query bytes signed by Google - up to but excluding "&signature=...". */
  readonly signedContent: string;
  readonly signature: string;
  readonly keyId: number;
}

/**
 * AdMob SSV appends `signature` and `key_id` as the last two query params, and signs
 * the raw query string that precedes them - not a re-serialized version of it, since
 * that could alter byte-for-byte encoding and break verification. `rawQuery` must be
 * the query string exactly as received (e.g. from request.raw.url), not the parsed
 * params re-joined.
 */
export function parseCallbackQuery(rawQuery: string): ParsedCallback | null {
  const sigStart = rawQuery.indexOf("signature=");
  if (sigStart <= 0 || rawQuery[sigStart - 1] !== "&") return null;
  const signedContent = rawQuery.slice(0, sigStart - 1);

  const params = new URLSearchParams(rawQuery);
  const signature = params.get("signature");
  const keyIdRaw = params.get("key_id");
  if (signature === null || keyIdRaw === null) return null;
  const keyId = Number(keyIdRaw);
  if (!Number.isFinite(keyId)) return null;

  return { signedContent, signature, keyId };
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** ECDSA/SHA-256 over the signed content, using whichever key the callback names by id. */
export function verifySignature(parsed: ParsedCallback, keys: readonly VerifierKey[]): boolean {
  const key = keys.find((k) => k.keyId === parsed.keyId);
  if (key === undefined) return false;
  try {
    const verifier = createVerify("SHA256");
    verifier.update(parsed.signedContent);
    verifier.end();
    return verifier.verify(key.pem, base64UrlToBuffer(parsed.signature));
  } catch {
    return false;
  }
}
