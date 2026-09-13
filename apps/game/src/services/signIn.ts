import { fetchGuestToken, fetchWallet } from "./net.js";
import { saveSession } from "./sessionStore.js";
import { setSession } from "../state/session.js";

export interface SignIn {
  readonly token: string;
  readonly nickname: string;
}

/** Turns a successful sign-in into the session: loads the wallet and remembers the device. */
export async function completeSignIn(attempt: Promise<SignIn>, isGuest: boolean): Promise<void> {
  const { token, nickname } = await attempt;
  const wallet = await fetchWallet(token, nickname);
  setSession({
    userId: wallet.userId,
    token,
    nickname: wallet.nickname,
    isGuest,
    coins: wallet.coins,
    winPoints: wallet.winPoints,
  });
  saveSession({ token, nickname: wallet.nickname, isGuest });
}

/** A new guest gets a numbered handle, so the leaderboard isn't a wall of identical names. */
export function guestSignIn(): Promise<SignIn> {
  return fetchGuestToken(`Guest${Math.floor(1000 + Math.random() * 9000)}`);
}
