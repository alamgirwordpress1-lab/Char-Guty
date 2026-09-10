import type { MatchEventMsg, MatchStateMsg, TokkaFramesMsg } from "@char-guty/shared";

/** Mirrors GutiRoom's statePayload() (apps/server/src/rooms/GutiRoom.ts). */
export interface RoomStateMsg {
  readonly mode: "friend" | "random";
  readonly code: string | null;
  readonly roomPhase: "LOBBY" | "PLAYING" | "ENDED";
  readonly hostUserId: string | null;
  readonly seats: readonly { sessionId: string; userId: string; nickname: string }[];
  readonly match: MatchStateMsg | null;
  /** Epoch ms of the current action deadline; null when nothing is pending. */
  readonly turnDeadlineAt: number | null;
  /** Server clock at send time - the client derives an offset from it for the countdown. */
  readonly serverNow: number;
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

export type EventsMsg = readonly MatchEventMsg[];

export type { MatchEventMsg, MatchStateMsg, TokkaFramesMsg };
