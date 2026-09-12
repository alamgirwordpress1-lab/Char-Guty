import { timingSafeEqual } from "node:crypto";

/**
 * The admin routes are guarded by one shared token from the environment rather than
 * accounts of their own: there is a single operator, and a password table for one
 * person would be more to get wrong than it protects. No token set, no admin routes.
 */
export function adminToken(): string | undefined {
  // Trimmed: a value pasted into a hosting dashboard easily picks up a stray space or
  // newline, and the sign-in page trims what the operator pastes - so both sides have to
  // agree on what the token is, or the right token would never match.
  const token = process.env.ADMIN_TOKEN?.trim();
  return token === undefined || token === "" ? undefined : token;
}

/**
 * Constant-time compare, so a wrong token cannot be narrowed down by timing it. The
 * expected token is passed in rather than read here, so a request is always judged
 * against the same value that decided whether these routes exist at all.
 */
export function isAdminToken(expected: string, candidate: string | undefined): boolean {
  if (candidate === undefined) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
