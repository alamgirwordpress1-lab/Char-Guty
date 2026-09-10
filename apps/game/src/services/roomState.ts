import type { MatchStateMsg } from "@char-guty/shared";

/** Mirrors GutiRoom's broadcastState() payload (apps/server/src/rooms/GutiRoom.ts). */
export interface RoomStateMsg {
  readonly mode: "friend" | "random";
  readonly code: string | null;
  readonly roomPhase: "LOBBY" | "PLAYING" | "ENDED";
  readonly hostUserId: string | null;
  readonly seats: readonly { sessionId: string; userId: string; nickname: string }[];
  readonly match: MatchStateMsg | null;
}

/** Mirrors GutiRoom's "matchEnded" broadcast payload. */
export interface MatchEndedMsg {
  readonly winner: string | null;
  readonly settlement: {
    readonly stakes: readonly { player: string; coins: number }[];
    readonly payout: { player: string; coins: number } | null;
    readonly deltas: Readonly<Record<string, number>>;
  };
}
