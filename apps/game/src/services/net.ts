import type { JoinOptions } from "@char-guty/shared";
import { Client, type Room } from "colyseus.js";
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
  const res = await fetch(`${SERVER_HTTP_URL}/wallet${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`could not load wallet (${res.status})`);
  return (await res.json()) as WalletInfo;
}

export async function findRoomByCode(token: string, code: string): Promise<string> {
  const res = await fetch(`${SERVER_HTTP_URL}/rooms/by-code/${encodeURIComponent(code)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`room not found (${res.status})`);
  const body = (await res.json()) as { roomId: string };
  return body.roomId;
}

const client = new Client(SERVER_WS_URL);

export function joinRandomMatch(options: JoinOptions): Promise<Room> {
  return client.joinOrCreate("guti", options);
}

export function createFriendRoom(options: JoinOptions): Promise<Room> {
  return client.create("guti", options);
}

export function joinRoomById(roomId: string, options: JoinOptions): Promise<Room> {
  return client.joinById(roomId, options);
}

/** Resumes a dropped session; the server holds the seat for 60s (GutiRoom.onLeave). */
export function reconnectRoom(reconnectionToken: string): Promise<Room> {
  return client.reconnect(reconnectionToken);
}
