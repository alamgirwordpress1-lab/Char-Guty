import type { JoinOptions } from "@char-guty/shared";
import type { Client, Room } from "colyseus.js";
import { SERVER_HTTP_URL, SERVER_WS_URL } from "../config.js";

export interface GuestAuth {
  readonly userId: string;
  readonly token: string;
  readonly nickname: string;
}

export async function fetchGuestToken(nickname: string): Promise<GuestAuth> {
  const res = await fetch(`${SERVER_HTTP_URL}/auth/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) throw new Error(`guest sign-in failed (${res.status})`);
  return (await res.json()) as GuestAuth;
}

export interface WalletInfo {
  readonly userId: string;
  readonly nickname: string;
  readonly coins: number;
  readonly winPoints: number;
}

export async function fetchWallet(token: string, nickname?: string): Promise<WalletInfo> {
  const query = nickname === undefined ? "" : `?nickname=${encodeURIComponent(nickname)}`;
  const res = await fetch(`${SERVER_HTTP_URL}/me${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`could not load wallet (${res.status})`);
  return (await res.json()) as WalletInfo;
}

export interface LeaderboardEntry {
  readonly userId: string;
  readonly nickname: string;
  readonly winPoints: number;
}

export type LeaderboardPeriod = "week" | "all";

export async function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${SERVER_HTTP_URL}/leaderboard?period=${period}`);
  if (!res.ok) throw new Error(`could not load leaderboard (${res.status})`);
  const body = (await res.json()) as { entries: LeaderboardEntry[] };
  return body.entries;
}

export interface AdRewardResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly coins?: number;
  readonly winPoints?: number;
}

/** Dev/web stand-in for a rewarded ad (server route only exists when ADS_MOCK=true). */
export function claimMockAdReward(token: string): Promise<AdRewardResult> {
  return claimAdReward("/ads/mock-reward", token, {});
}

/** A rewarded video watched inside Facebook (route only exists when INSTANT_AD_REWARDS=true). */
export function claimInstantAdReward(
  token: string,
  transactionId: string,
): Promise<AdRewardResult> {
  return claimAdReward("/ads/instant-reward", token, { transactionId });
}

/** A rewarded video watched on CrazyGames (route only exists when CRAZYGAMES_AD_REWARDS=true). */
export function claimCrazyGamesAdReward(
  token: string,
  transactionId: string,
): Promise<AdRewardResult> {
  return claimAdReward("/ads/crazygames-reward", token, { transactionId });
}

async function claimAdReward(path: string, token: string, body: object): Promise<AdRewardResult> {
  const res = await fetch(`${SERVER_HTTP_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as AdRewardResult;
}

export async function findRoomByCode(token: string, code: string): Promise<string> {
  const res = await fetch(`${SERVER_HTTP_URL}/rooms/by-code/${encodeURIComponent(code)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`room not found (${res.status})`);
  const body = (await res.json()) as { roomId: string };
  return body.roomId;
}

// colyseus.js is only needed once a match is actually being joined/created - not for
// login or browsing the lobby - so it's dynamically imported instead of bundled
// eagerly, keeping it out of the initial (first-paint) chunk.
let clientPromise: Promise<Client> | undefined;

function getClient(): Promise<Client> {
  clientPromise ??= import("colyseus.js").then((mod) => new mod.Client(SERVER_WS_URL));
  return clientPromise;
}

export async function joinRandomMatch(options: JoinOptions): Promise<Room> {
  const client = await getClient();
  return client.joinOrCreate("guti", options);
}

export async function createFriendRoom(options: JoinOptions): Promise<Room> {
  const client = await getClient();
  return client.create("guti", options);
}

/** A practice game: the server seats computer players and starts it at once. */
export async function createComputerGame(options: JoinOptions): Promise<Room> {
  const client = await getClient();
  return client.create("guti", options);
}

export async function joinRoomById(roomId: string, options: JoinOptions): Promise<Room> {
  const client = await getClient();
  return client.joinById(roomId, options);
}

/** Resumes a dropped session; the server holds the seat for 60s (GutiRoom.onLeave). */
export async function reconnectRoom(reconnectionToken: string): Promise<Room> {
  const client = await getClient();
  return client.reconnect(reconnectionToken);
}
