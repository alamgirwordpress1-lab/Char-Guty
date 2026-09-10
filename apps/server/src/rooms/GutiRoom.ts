import type { Client, Delayed } from "colyseus";
import { Room } from "colyseus";
import {
  createMatchState,
  DEFAULT_CONFIG,
  InvalidActionError,
  InvalidMatchConfigError,
  reduceThrow,
  reduceTimeout,
  reduceTokka,
  settle,
  simulateTokka,
} from "@char-guty/game-core";
import type { MatchEvent, MatchState } from "@char-guty/game-core";
import { joinOptionsSchema, pickPotPayloadSchema, tokkaPayloadSchema } from "@char-guty/shared";
import type { JoinOptions, TokkaPayload } from "@char-guty/shared";
import { CryptoRng } from "../rng/CryptoRng.js";
import { applySettlement, canAffordAll, ensureAccount } from "../wallet.js";
import { generateRoomCode } from "./roomCode.js";

type RoomMode = "friend" | "random";
type RoomPhase = "LOBBY" | "PLAYING" | "ENDED";

interface RoomMetadata {
  mode: RoomMode;
  code: string | null;
  pot: number | null;
  playerCount: number;
}

interface Seat {
  readonly id: string;
  readonly nickname: string;
}

function isPendingPair(
  pending: readonly (readonly [number, number])[],
  a: number,
  b: number,
): boolean {
  return pending.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Server-authoritative Char Guti room. No synced @colyseus/schema state - the full
 * MatchState has no hidden information (every piece is visible to every player), so
 * it's simply rebroadcast wholesale after each action instead of field-diffed.
 */
export class GutiRoom extends Room<object, RoomMetadata, unknown, JoinOptions> {
  private mode: RoomMode = "random";
  private code: string | null = null;
  private pot: number | null = null;
  private hostId: string | null = null;
  private seats: Seat[] = [];
  private roomPhase: RoomPhase = "LOBBY";
  private matchState: MatchState | null = null;
  private readonly rng = new CryptoRng();
  private readonly forfeited = new Set<string>();
  private actionTimer: Delayed | null = null;

  override async onCreate(options: unknown): Promise<void> {
    const parsed = joinOptionsSchema.parse(options);
    this.mode = parsed.mode;
    this.maxClients = parsed.playerCount;
    this.pot = parsed.pot ?? null;
    this.code = this.mode === "friend" ? generateRoomCode() : null;

    await this.setMetadata({
      mode: this.mode,
      code: this.code,
      pot: this.pot,
      playerCount: this.maxClients,
    });

    this.onMessage(
      "PICK_POT",
      (client, message) => this.handlePickPot(client, message),
      (raw) => pickPotPayloadSchema.parse(raw),
    );
    this.onMessage("THROW", (client) => this.handleThrow(client));
    this.onMessage(
      "TOKKA",
      (client, message) => this.handleTokka(client, message),
      (raw) => tokkaPayloadSchema.parse(raw),
    );
  }

  override onAuth(_client: Client, options: unknown): JoinOptions {
    return joinOptionsSchema.parse(options);
  }

  override onJoin(
    client: Client<unknown, JoinOptions>,
    _options: unknown,
    auth: JoinOptions,
  ): void {
    const seat: Seat = { id: client.sessionId, nickname: auth.nickname };
    this.seats.push(seat);
    if (this.hostId === null) this.hostId = seat.id;
    ensureAccount(seat.id);
    this.tryStartMatch();
    this.broadcastState();
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    if (!this.seats.some((seat) => seat.id === client.sessionId)) return;
    if (consented) {
      this.handleDeparture(client.sessionId);
      return;
    }
    try {
      await this.allowReconnection(client, 60);
    } catch {
      this.handleDeparture(client.sessionId);
    }
  }

  override onDispose(): void {
    this.actionTimer?.clear();
  }

  private handlePickPot(client: Client, message: { pot: number }): void {
    const allowed =
      client.sessionId === this.hostId && this.roomPhase === "LOBBY" && this.pot === null;
    if (!allowed) {
      client.send("error", { message: "cannot set the pot now" });
      return;
    }
    this.pot = message.pot;
    this.tryStartMatch();
    this.broadcastState();
  }

  private handleThrow(client: Client): void {
    this.runAction(client.sessionId, (state) => reduceThrow(state, this.rng, DEFAULT_CONFIG));
  }

  private handleTokka(client: Client, message: TokkaPayload): void {
    if (this.matchState === null || this.roomPhase !== "PLAYING") return;
    if (this.matchState.currentPlayer !== client.sessionId) return;
    if (!isPendingPair(this.matchState.pendingTokkas, message.shooterId, message.targetId)) {
      client.send("error", { message: "not an eligible tokka pair" });
      return;
    }

    // Re-run the (pure, deterministic) sim standalone purely to capture replay frames -
    // reduceTokka below performs the authoritative hit/position calculation itself.
    const frames = simulateTokka(
      this.matchState.gutis,
      message.shooterId,
      message.targetId,
      message.flick,
      { ...DEFAULT_CONFIG, recordFrames: true },
    ).frames;
    if (frames !== undefined) this.broadcast("tokkaFrames", frames);

    this.runAction(client.sessionId, (state) => reduceTokka(state, message, DEFAULT_CONFIG));
  }

  private runAction(
    playerId: string,
    act: (state: MatchState) => { state: MatchState; events: readonly MatchEvent[] },
  ): void {
    if (this.matchState === null || this.roomPhase !== "PLAYING") return;
    if (this.matchState.currentPlayer !== playerId) return;
    try {
      const { state, events } = act(this.matchState);
      this.applyMatchResult(state, events);
    } catch (err) {
      if (err instanceof InvalidActionError) {
        this.clients.getById(playerId)?.send("error", { message: err.message });
        return;
      }
      throw err;
    }
  }

  private applyMatchResult(state: MatchState, events: readonly MatchEvent[]): void {
    this.matchState = state;
    this.broadcast("events", events);
    this.broadcastState();
    if (state.phase === "ENDED") {
      this.finishMatch(state);
      return;
    }
    this.scheduleNextAction();
  }

  private scheduleNextAction(): void {
    this.actionTimer?.clear();
    this.actionTimer = null;
    if (this.matchState === null) return;
    if (this.forfeited.has(this.matchState.currentPlayer)) {
      this.runTimeout();
      return;
    }
    this.actionTimer = this.clock.setTimeout(() => this.runTimeout(), DEFAULT_CONFIG.turnTimeoutMs);
  }

  private runTimeout(): void {
    if (this.matchState === null || this.roomPhase !== "PLAYING") return;
    const { state, events } = reduceTimeout(this.matchState);
    this.applyMatchResult(state, events);
  }

  private tryStartMatch(): void {
    if (this.roomPhase !== "LOBBY") return;
    if (this.pot === null || this.seats.length < this.maxClients) return;

    const playerIds = this.seats.map((seat) => seat.id);
    const stake = this.pot / playerIds.length;
    if (!canAffordAll(playerIds, stake)) {
      this.broadcast("error", { message: "a player cannot afford the stake" });
      return;
    }

    try {
      this.matchState = createMatchState(playerIds, this.pot, DEFAULT_CONFIG);
    } catch (err) {
      if (err instanceof InvalidMatchConfigError) {
        this.broadcast("error", { message: err.message });
        return;
      }
      throw err;
    }

    this.roomPhase = "PLAYING";
    applySettlement({
      stakes: playerIds.map((player) => ({ player, coins: -stake })),
      payout: null,
      deltas: Object.fromEntries(playerIds.map((player) => [player, -stake])),
    });
    this.scheduleNextAction();
  }

  private handleDeparture(playerId: string): void {
    if (this.roomPhase !== "PLAYING" || this.matchState === null) {
      this.seats = this.seats.filter((seat) => seat.id !== playerId);
      this.broadcastState();
      return;
    }
    if (this.forfeited.has(playerId)) return;
    this.forfeited.add(playerId);

    const remaining = this.matchState.players.filter((p) => !this.forfeited.has(p));
    if (remaining.length <= 1) {
      const finalState: MatchState = {
        ...this.matchState,
        phase: "ENDED",
        winner: remaining[0] ?? null,
        turn: null,
      };
      this.applyMatchResult(finalState, []);
      return;
    }
    if (this.matchState.currentPlayer === playerId) this.runTimeout();
  }

  private finishMatch(state: MatchState): void {
    this.roomPhase = "ENDED";
    this.actionTimer?.clear();
    this.actionTimer = null;
    const settlement = settle(state);
    applySettlement(settlement);
    this.broadcast("matchEnded", { winner: state.winner, settlement });
    this.clock.setTimeout(() => this.disconnect(), 10_000);
  }

  private broadcastState(): void {
    this.broadcast("state", {
      mode: this.mode,
      code: this.code,
      roomPhase: this.roomPhase,
      hostId: this.hostId,
      seats: this.seats,
      match: this.matchState,
    });
  }
}
