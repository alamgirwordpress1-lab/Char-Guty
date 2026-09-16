import { DEFAULT_CONFIG, resolveThrow, simulateTokka } from "@char-guty/game-core";
import type { Guti } from "@char-guty/game-core";
import { tokkaPayloadSchema } from "@char-guty/shared";
import Phaser from "phaser";
import type { GameSceneData } from "../scenes/GameScene.js";
import type { MatchEventMsg, MatchStateMsg, RoomStateMsg } from "../services/roomState.js";
import { getSession } from "../state/session.js";
import type { GameRoom } from "./GameRoom.js";

const SEEN_KEY = "char-guty.tutorial";
const POT = 100;
/** The scripted throw: two flat, two round, in a loose square with every neighbour 100px off. */
const THROWN: readonly Guti[] = [
  { id: 0, side: "F", x: 150, y: 105 },
  { id: 1, side: "F", x: 250, y: 105 },
  { id: 2, side: "R", x: 150, y: 195 },
  { id: 3, side: "R", x: 250, y: 195 },
];

/** What the coach should show next; tokka steps name a pair to act the flick out on. */
export type CoachStep =
  | { readonly step: "throw" }
  | {
      readonly step: "tokka" | "again" | "miss";
      readonly shooterId: number;
      readonly targetId: number;
    }
  | { readonly step: "done" };

let seenThisVisit = false;

/** True once the tutorial was finished or skipped, on this device. */
export function hasSeenTutorial(): boolean {
  if (seenThisVisit) return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  seenThisVisit = true;
  try {
    localStorage.setItem(SEEN_KEY, "seen");
  } catch {
    // Remembered for this visit only.
  }
}

/** The tutorial, played in the Game scene against a TutorialRoom instead of the server. */
export function createTutorialGame(): GameSceneData {
  const room = new TutorialRoom();
  return { room, initialState: room.initialState, tutorial: true };
}

/**
 * A stand-in room for the first-launch lesson, with no server and no opponent: one scripted
 * throw (two flat) and its two tokkas, which fly exactly where they are aimed. A miss puts
 * the gutis back for another try. "coach" messages tell the Game scene what to point at.
 */
class TutorialRoom implements GameRoom {
  readonly sessionId = "tutorial";
  readonly reconnectionToken = "tutorial:tutorial";
  private readonly emitter = new Phaser.Events.EventEmitter();
  private readonly me: string;
  private readonly nickname: string;
  private state: MatchStateMsg;
  private closed = false;

  constructor() {
    const session = getSession();
    this.me = session.userId;
    this.nickname = session.nickname;
    this.state = {
      players: [this.me],
      pot: POT,
      stake: 0,
      phase: "THROW",
      currentPlayer: this.me,
      scores: { [this.me]: 0 },
      gutis: [],
      tokkasLeft: 0,
      turn: { player: this.me, outcome: null, flatCount: null, points: 0, tokkas: [] },
      turnLog: [],
      winner: null,
    };
  }

  get initialState(): RoomStateMsg {
    return this.wrap();
  }

  onMessage<T>(type: string, callback: (message: T) => void): void {
    this.emitter.on(type, callback);
    // The lesson opens as soon as the scene is listening for it.
    if (type === "coach") this.emit("coach", { step: "throw" } satisfies CoachStep, 300);
  }

  onLeave(): void {}

  onError(): void {}

  send(type: string, message?: unknown): void {
    if (this.closed) return;
    if (type === "THROW") this.throwGutis();
    else if (type === "TOKKA") this.playTokka(message);
  }

  leave(): Promise<number> {
    this.closed = true;
    this.emitter.removeAllListeners();
    return Promise.resolve(1000);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  private emit(type: string, payload: unknown, delay = 30): void {
    window.setTimeout(() => {
      if (!this.closed) this.emitter.emit(type, payload);
    }, delay);
  }

  private wrap(): RoomStateMsg {
    return {
      mode: "computer",
      code: null,
      roomPhase: "PLAYING",
      hostUserId: this.me,
      seats: [
        { sessionId: this.sessionId, userId: this.me, nickname: this.nickname, isComputer: false },
      ],
      playerCount: 1,
      pot: POT,
      match: this.state,
      turnDeadlineAt: null,
      serverNow: Date.now(),
    };
  }

  private throwGutis(): void {
    if (this.state.phase !== "THROW") return;
    const result = resolveThrow(THROWN);
    this.state = {
      ...this.state,
      phase: "TOKKA",
      gutis: [...THROWN],
      tokkasLeft: result.requiredTokkas,
      turn: {
        player: this.me,
        outcome: result.outcome,
        flatCount: result.flatCount,
        points: 0,
        tokkas: [],
      },
    };
    const events: MatchEventMsg[] = [
      { type: "THROW", player: this.me, result: { ...result, gutis: [...THROWN] } },
    ];
    this.emit("events", events);
    this.emit("state", this.wrap(), 60);
    this.emit("coach", this.pairStep("tokka"), 90);
  }

  private playTokka(message: unknown): void {
    if (this.state.phase !== "TOKKA") return;
    const parsed = tokkaPayloadSchema.safeParse(message);
    if (!parsed.success) return;
    const { shooterId, flick } = parsed.data;
    const before = this.state.gutis;
    if (!before.some((g) => g.id === shooterId)) return;

    // Unlike a real game, no stray: while learning, a flick goes exactly where it was aimed.
    const sim = simulateTokka(before, shooterId, flick, { ...DEFAULT_CONFIG, recordFrames: true });
    if (sim.frames !== undefined) this.emit("tokkaFrames", sim.frames);
    const events: MatchEventMsg[] = [
      { type: "TOKKA", player: this.me, shooterId, hitId: sim.hitId },
    ];
    const hitId = sim.hitId;
    if (hitId === null) {
      this.state = { ...this.state, gutis: [...before] };
      this.emit("events", events, 40);
      this.emit("state", this.wrap(), 80);
      this.emit("coach", this.pairStep("miss"), 110);
      return;
    }

    const total = (this.state.scores[this.me] ?? 0) + 1;
    events.push({ type: "SCORE", player: this.me, points: 1, total });
    const tokkasLeft = this.state.tokkasLeft - 1;
    this.state = {
      ...this.state,
      phase: tokkasLeft > 0 ? "TOKKA" : "ENDED",
      gutis: sim.finalGutis.filter((g) => g.id !== shooterId && g.id !== hitId),
      scores: { [this.me]: total },
      tokkasLeft,
    };
    this.emit("events", events, 40);
    this.emit("state", this.wrap(), 80);
    this.emit("coach", tokkasLeft > 0 ? this.pairStep("again") : { step: "done" }, 110);
  }

  /** The two gutis lying closest together, for the coach to act a flick out on. */
  private pairStep(step: "tokka" | "again" | "miss"): CoachStep {
    let pair: readonly [Guti, Guti] | null = null;
    let closest = Infinity;
    for (const a of this.state.gutis) {
      for (const b of this.state.gutis) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (a.id < b.id && distance < closest) {
          pair = [a, b];
          closest = distance;
        }
      }
    }
    return { step, shooterId: pair?.[0].id ?? 0, targetId: pair?.[1].id ?? 1 };
  }
}
