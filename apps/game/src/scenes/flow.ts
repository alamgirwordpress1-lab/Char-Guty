import type { Room } from "colyseus.js";
import type { RoomStateMsg } from "../services/roomState.js";

/** How a game is found: matchmaking with strangers, a practice game, or a private room. */
export type PlayMode = "online" | "computer" | "friends";

export interface ArenaSceneData {
  readonly mode: PlayMode;
  readonly playerCount?: number;
}

export interface MatchmakingSceneData {
  readonly mode: PlayMode;
  readonly playerCount: number;
  /** Null when joining a friend's room by its code: that room already has its stakes. */
  readonly pot: number | null;
  readonly code?: string;
}

export interface GameStart {
  readonly room: Room;
  readonly initialState: RoomStateMsg;
}
