import { fetchCrazyGamesToken, fetchGuestToken, fetchWallet } from "./net.js";
import { crazyGamesUserToken } from "./platform.js";
import { loadSession, saveSession } from "./sessionStore.js";
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

/**
 * On CrazyGames a logged-in player plays as their CrazyGames account. The first time, the
 * guest this device was playing as becomes that account, coins and all. False when the
 * player isn't logged in there, or the server couldn't be reached.
 */
export async function signInWithCrazyGames(): Promise<boolean> {
  const crazyGamesToken = await crazyGamesUserToken();
  if (crazyGamesToken === null) return false;
  const stored = loadSession();
  const guestToken = stored?.isGuest === true ? stored.token : undefined;
  try {
    await completeSignIn(fetchCrazyGamesToken(crazyGamesToken, guestToken), false);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/** A new guest gets a numbered handle, so the leaderboard isn't a wall of identical names. */
export function guestSignIn(): Promise<SignIn> {
  return fetchGuestToken(`Guest${Math.floor(1000 + Math.random() * 9000)}`);
}
