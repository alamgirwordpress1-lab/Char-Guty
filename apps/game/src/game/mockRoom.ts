import {
  DEFAULT_CONFIG,
  resolveThrow,
  SeededRng,
  simulateTokka,
  strayFlick,
  throwGutis,
} from "@char-guty/game-core";
import type { Guti } from "@char-guty/game-core";
import { tokkaPayloadSchema } from "@char-guty/shared";
import Phaser from "phaser";
import type { GameSceneData } from "../scenes/GameScene.js";
import type {
  MatchEndedMsg,
  MatchEventMsg,
  MatchStateMsg,
  RoomStateMsg,
} from "../services/roomState.js";
import { setSession } from "../state/session.js";
import type { GameRoom } from "./GameRoom.js";

const ME = "me-mock";
const RIVAL = "rival-mock";
const POT = 100;
const NEXT_GAME_MS = 5000;

/**
 * Dev-only stand-in for a live room (`?mock=game`): a snapshot one tokka away from
 * winning, THROW/TOKKA replies driven by the real game-core sim, and - like GutiRoom -
 * a result followed by the next game dealt in the same room.
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
      scores: { [ME]: POT - 1, [RIVAL]: 71 },
      gutis: [...gutis],
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
    const ended = this.state.phase === "ENDED";
    return {
      mode: "random",
      code: null,
      roomPhase: ended ? "ENDED" : "PLAYING",
      hostUserId: ME,
      seats: [
        { sessionId: "mock", userId: ME, nickname: "You", isComputer: false },
        { sessionId: "rival", userId: RIVAL, nickname: "Rahim", isComputer: false },
      ],
      playerCount: 2,
      pot: POT,
      match: this.state,
      turnDeadlineAt: ended ? null : Date.now() + DEFAULT_CONFIG.turnTimeoutMs,
      serverNow: Date.now(),
    };
  }

  private mockThrow(): void {
    if (this.state.phase !== "THROW") return;
    const gutis = throwGutis(this.rng, DEFAULT_CONFIG);
    const result = resolveThrow(gutis);
    const events: MatchEventMsg[] = [
      { type: "THROW", player: ME, result: { ...result, gutis: [...gutis] } },
    ];
    let scores = this.state.scores;
    if (result.outcome === "four") {
      const total = (scores[ME] ?? 0) + result.points;
      scores = { ...scores, [ME]: total };
      events.push({ type: "SCORE", player: ME, points: result.points, total });
    }
    this.state = { ...this.state, gutis: [...gutis], scores };

    if (result.outcome === "instantWin" || (scores[ME] ?? 0) >= POT) {
      const reason = result.outcome === "instantWin" ? "ZERO_FLAT" : "REACHED_POT";
      events.push({ type: "WIN", player: ME, reason });
      this.endGame(events, 30);
      return;
    }

    const tokka = result.outcome === "tokka";
    this.state = {
      ...this.state,
      phase: tokka ? "TOKKA" : "THROW",
      tokkasLeft: tokka ? result.requiredTokkas : 0,
    };
    this.emit("events", events);
    this.emit("state", this.wrap(), 60);
  }

  private mockTokka(message: unknown): void {
    if (this.state.phase !== "TOKKA") return;
    const { shooterId, flick: aimed } = tokkaPayloadSchema.parse(message);
    if (!this.state.gutis.some((g) => g.id === shooterId)) return;
    const flick = strayFlick(aimed, this.rng, DEFAULT_CONFIG);
    const sim = simulateTokka(this.state.gutis, shooterId, flick, {
      ...DEFAULT_CONFIG,
      recordFrames: true,
    });
    const events: MatchEventMsg[] = [{ type: "TOKKA", player: ME, shooterId, hitId: sim.hitId }];
    let scores = this.state.scores;
    if (sim.hitId !== null) {
      const total = (scores[ME] ?? 0) + 1;
      scores = { ...scores, [ME]: total };
      events.push({ type: "SCORE", player: ME, points: 1, total });
    } else {
      events.push({ type: "DIE", player: ME, reason: "TOKKA_MISS" });
    }
    if (sim.frames !== undefined) this.emit("tokkaFrames", sim.frames);
    const hitId = sim.hitId;
    // The two gutis that met go out; a miss leaves the mat as the flick left it.
    const gutis = sim.finalGutis.filter(
      (g) => hitId === null || (g.id !== shooterId && g.id !== hitId),
    );
    this.state = { ...this.state, gutis, scores };

    if ((scores[ME] ?? 0) >= POT) {
      events.push({ type: "WIN", player: ME, reason: "REACHED_POT" });
      this.endGame(events, 40);
      return;
    }

    const tokkasLeft = sim.hitId === null ? 0 : this.state.tokkasLeft - 1;
    this.state = { ...this.state, phase: tokkasLeft > 0 ? "TOKKA" : "THROW", tokkasLeft };
    this.emit("events", events, 40);
    this.emit("state", this.wrap(), 80);
  }

  private endGame(events: MatchEventMsg[], delay: number): void {
    this.state = { ...this.state, phase: "ENDED", winner: ME, tokkasLeft: 0, turn: null };
    this.emit("events", events, delay);
    this.emit("state", this.wrap(), delay + 40);
    this.emit(
      "matchEnded",
      {
        winner: ME,
        settlement: {
          stakes: [
            { player: ME, coins: -POT / 2 },
            { player: RIVAL, coins: -POT / 2 },
          ],
          payout: { player: ME, coins: POT },
          deltas: { [ME]: POT / 2, [RIVAL]: -POT / 2 },
        },
        nextRoundInMs: NEXT_GAME_MS,
      } satisfies MatchEndedMsg,
      delay + 80,
    );
    window.setTimeout(() => this.dealNextGame(), delay + 80 + NEXT_GAME_MS);
  }

  private dealNextGame(): void {
    this.state = {
      ...this.state,
      phase: "THROW",
      currentPlayer: ME,
      scores: { [ME]: 0, [RIVAL]: 0 },
      gutis: [],
      tokkasLeft: 0,
      turn: { player: ME, outcome: null, flatCount: null, points: 0, tokkas: [] },
      turnLog: [],
      winner: null,
    };
    this.emitter.emit("state", this.wrap());
  }
}

export function createMockGame(): GameSceneData {
  setSession({ userId: ME, token: "", nickname: "You", isGuest: true, coins: 250, winPoints: 0 });
  const room = new MockRoom();
  return { room, initialState: room.initialState, offline: true };
}
