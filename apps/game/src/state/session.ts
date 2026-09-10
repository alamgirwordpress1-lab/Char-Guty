export interface Session {
  readonly userId: string;
  readonly token: string;
  readonly nickname: string;
  readonly isGuest: boolean;
  coins: number;
  winPoints: number;
}

let session: Session | null = null;

export function setSession(next: Session): void {
  session = next;
}

export function updateBalance(coins: number, winPoints: number): void {
  if (session === null) return;
  session.coins = coins;
  session.winPoints = winPoints;
}

export function getSession(): Session {
  if (session === null) throw new Error("no active session - sign in first");
  return session;
}

export function hasSession(): boolean {
  return session !== null;
}

export function clearSession(): void {
  session = null;
}
