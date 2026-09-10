import {
  DEFAULT_CONFIG,
  resolveThrow,
  SeededRng,
  simulateTokka,
  throwGutis,
  tokkaPairs,
} from "@char-guty/game-core";
import type { Guti } from "@char-guty/game-core";
import { tokkaPayloadSchema } from "@char-guty/shared";
import Phaser from "phaser";
import type { GameSceneData } from "../scenes/GameScene.js";
import type { MatchEventMsg, MatchStateMsg, RoomStateMsg } from "../services/roomState.js";
import { setSession } from "../state/session.js";
import type { GameRoom } from "./GameRoom.js";

const ME = "me-mock";
const RIVAL = "rival-mock";
const POT = 100;

function pairsOf(gutis: readonly Guti[]): [number, number][] {
  return tokkaPairs(gutis, DEFAULT_CONFIG.tokkaRadius).map(([a, b]): [number, number] => [a, b]);
}

/**
 * Dev-only stand-in for a live room (`?mock=game`): a mid-match snapshot with an
 * eligible tokka pair, and THROW/TOKKA replies driven by the real game-core sim.
 */
class MockRoom implements GameRoom {
  readonly sessionId = "mock";
  readonly reconnectionToken = "mock:mock";
  private readonly emitter = new Phaser.Events.EventEmitter();
  private readonly rng = new SeededRng(7);
  private state: MatchStateMsg;

  constructor() {
    const gutis: Guti[] = [
      { id: 0, side: "F", x: 120, y: 100 },
      { id: 1, side: "R", x: 180, y: 130 },
      { id: 2, side: "F", x: 300, y: 210 },
      { id: 3, side: "R", x: 80, y: 240 },
    ];
    this.state = {
      players: [ME, RIVAL],
      pot: POT,
      stake: POT / 2,
      phase: "TOKKA",
      currentPlayer: ME,
      scores: { [ME]: 12, [RIVAL]: 7 },
      gutis: [...gutis],
      pendingTokkas: pairsOf(gutis),
      tokkasLeft: 2,
      turn: { player: ME, outcome: "tokka", flatCount: 2, points: 0, tokkas: [] },
      turnLog: [],
      winner: null,
    };
  }

  get initialState(): RoomStateMsg {
    return this.wrap();
  }

  onMessage<T>(type: string, callback: (message: T) => void): void {
    this.emitter.on(type, callback);
  }

  onLeave(): void {}

  onError(): void {}

  send(type: string, message?: unknown): void {
    if (type === "THROW") this.mockThrow();
    else if (type === "TOKKA") this.mockTokka(message);
  }

  leave(): Promise<number> {
    return Promise.resolve(1000);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  private emit(type: string, payload: unknown, delay = 30): void {
    window.setTimeout(() => this.emitter.emit(type, payload), delay);
  }

  private wrap(): RoomStateMsg {
    return {
      mode: "random",
      code: null,
      roomPhase: "PLAYING",
      hostUserId: ME,
      seats: [
        { sessionId: "mock", userId: ME, nickname: "You" },
        { sessionId: "rival", userId: RIVAL, nickname: "Rahim" },
      ],
      match: this.state,
      turnDeadlineAt: Date.now() + DEFAULT_CONFIG.turnTimeoutMs,
      serverNow: Date.now(),
    };
  }

  private mockThrow(): void {
    if (this.state.phase !== "THROW") return;
    const gutis = throwGutis(this.rng, DEFAULT_CONFIG);
    const result = resolveThrow(gutis);
    const pending = pairsOf(gutis);
    const events: MatchEventMsg[] = [
      { type: "THROW", player: ME, result: { ...result, gutis: [...gutis] } },
    ];
    let scores = this.state.scores;
    if (result.outcome === "four") {
      const total = (scores[ME] ?? 0) + result.points;
      scores = { ...scores, [ME]: total };
      events.push({ type: "SCORE", player: ME, points: result.points, total });
    }
    const tokka = result.outcome === "tokka" && pending.length > 0;
    this.state = {
      ...this.state,
      gutis: [...gutis],
      scores,
      phase: tokka ? "TOKKA" : "THROW",
      pendingTokkas: tokka ? pending : [],
      tokkasLeft: tokka ? result.requiredTokkas : 0,
    };
    this.emit("events", events);
    this.emit("state", this.wrap(), 60);
  }

  private mockTokka(message: unknown): void {
    if (this.state.phase !== "TOKKA") return;
    const { shooterId, targetId, flick } = tokkaPayloadSchema.parse(message);
    const sim = simulateTokka(this.state.gutis, shooterId, targetId, flick, {
      ...DEFAULT_CONFIG,
      recordFrames: true,
    });
    const events: MatchEventMsg[] = [
      { type: "TOKKA", player: ME, shooterId, targetId, hit: sim.hit },
    ];
    let scores = this.state.scores;
    if (sim.hit) {
      const total = (scores[ME] ?? 0) + 1;
      scores = { ...scores, [ME]: total };
      events.push({ type: "SCORE", player: ME, points: 1, total });
    } else {
      events.push({ type: "DIE", player: ME, reason: "TOKKA_MISS" });
    }
    const tokkasLeft = sim.hit ? this.state.tokkasLeft - 1 : 0;
    const pending = tokkasLeft > 0 ? pairsOf(sim.finalGutis) : [];
    this.state = {
      ...this.state,
      gutis: [...sim.finalGutis],
      scores,
      phase: pending.length > 0 ? "TOKKA" : "THROW",
      pendingTokkas: pending,
      tokkasLeft: pending.length > 0 ? tokkasLeft : 0,
    };
    if (sim.frames !== undefined) this.emit("tokkaFrames", sim.frames);
    this.emit("events", events, 40);
    this.emit("state", this.wrap(), 80);
  }
}

export function createMockGame(): GameSceneData {
  setSession({ userId: ME, token: "", nickname: "You", isGuest: true, coins: 250, winPoints: 0 });
  const room = new MockRoom();
  return { room, initialState: room.initialState, offline: true };
}
