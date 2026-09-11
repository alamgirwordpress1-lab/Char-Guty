/** Remembers the signed-in account on this device, so reopening the game skips sign-in. */
const STORAGE_KEY = "char-guty.session";

export interface StoredSession {
  readonly token: string;
  readonly nickname: string;
  readonly isGuest: boolean;
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked (e.g. private browsing): stay signed in for this visit only.
  }
}

export function loadSession(): StoredSession | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "token" in parsed &&
      typeof parsed.token === "string" &&
      "nickname" in parsed &&
      typeof parsed.nickname === "string" &&
      "isGuest" in parsed &&
      typeof parsed.isGuest === "boolean"
    ) {
      return { token: parsed.token, nickname: parsed.nickname, isGuest: parsed.isGuest };
    }
  } catch {
    // Unreadable or blocked storage counts as signed out.
  }
  return null;
}

export function forgetSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing reachable to forget.
  }
}
