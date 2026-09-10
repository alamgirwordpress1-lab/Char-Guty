import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import jwt from "jsonwebtoken";

const GUEST_TOKEN_ISSUER = "char-guty-guest";

function guestSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (secret === undefined) throw new Error("AUTH_JWT_SECRET is not set (see .env.example)");
  return secret;
}

export interface AuthResult {
  readonly provider: "firebase" | "guest";
  readonly providerId: string;
  readonly isGuest: boolean;
}

export function issueGuestToken(guestId: string): string {
  return jwt.sign({ guest: true }, guestSecret(), {
    subject: guestId,
    issuer: GUEST_TOKEN_ISSUER,
    expiresIn: "30d",
  });
}

function tryVerifyGuestToken(token: string): AuthResult | null {
  try {
    const payload = jwt.verify(token, guestSecret(), { issuer: GUEST_TOKEN_ISSUER });
    if (typeof payload === "object" && payload.guest === true && typeof payload.sub === "string") {
      return { provider: "guest", providerId: payload.sub, isGuest: true };
    }
    return null;
  } catch {
    return null;
  }
}

function ensureFirebaseApp(): void {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId === undefined || clientEmail === undefined || privateKey === undefined) {
    throw new Error(
      "Firebase Admin credentials are not configured (FIREBASE_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY)",
    );
  }
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
  });
}

/**
 * Tries a guest token first (cheap, local, no network); anything else is verified
 * as a real Firebase ID token. Shared by room onAuth and Fastify route handlers.
 */
export async function verifyAuthToken(token: string): Promise<AuthResult> {
  const guest = tryVerifyGuestToken(token);
  if (guest !== null) return guest;

  ensureFirebaseApp();
  const decoded = await getAuth().verifyIdToken(token);
  return { provider: "firebase", providerId: decoded.uid, isGuest: false };
}
