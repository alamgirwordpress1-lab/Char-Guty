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
import type { TokkaPayload } from "@char-guty/shared";
import { randomBytes } from "node:crypto";
import { verifyAuthToken } from "../auth/auth.js";
import { db } from "../db/client.js";
import { endMatch, startMatch } from "../db/matchRepository.js";
import { upsertUser } from "../db/userService.js";
import { applyLedger, canAffordAll, InsufficientCoinsError } from "../db/walletService.js";
import { CryptoRng } from "../rng/CryptoRng.js";
import { generateRoomCode } from "./roomCode.js";

type RoomMode = "friend" | "random";
type RoomPhase = "LOBBY" | "PLAYING" | "ENDED";

interface RoomMetadata {
  mode: RoomMode;
  code: string | null;
  pot: number | null;
  playerCount: number;
}

/** What onAuth resolves to: a verified, upserted account, not just the raw join options. */
interface AuthenticatedPlayer {
  readonly userId: string;
  readonly nickname: string;
  readonly isGuest: boolean;
}

interface Seat {
  readonly sessionId: string;
  readonly userId: string;
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
 *
 * Player identity: game-core's MatchState.players holds the persistent db user id
 * (survives reconnects and is what the wallet/matches tables key on), not the
 * Colyseus sessionId - `seats` maps between the two.
 */
export class GutiRoom extends Room<object, RoomMetadata, unknown, AuthenticatedPlayer> {
  private mode: RoomMode = "random";
  private code: string | null = null;
  private pot: number | null = null;
  private hostUserId: string | null = null;
  private seats: Seat[] = [];
  private roomPhase: RoomPhase = "LOBBY";
  private matchState: MatchState | null = null;
  private matchId: string | null = null;
  private readonly rng = new CryptoRng();
  private readonly forfeited = new Set<string>();
  private actionTimer: Delayed | null = null;
  /** Serializes DB-touching mutations - message handlers are async now, so a second
   * message can otherwise arrive mid-await and race the first. */
  private busy = false;

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
      (client, message) => this.withLock(() => this.handlePickPot(client, message)),
      (raw) => pickPotPayloadSchema.parse(raw),
    );
    this.onMessage("THROW", (client) => this.withLock(() => this.handleThrow(client)));
    this.onMessage(
      "TOKKA",
      (client, message) => this.withLock(() => this.handleTokka(client, message)),
      (raw) => tokkaPayloadSchema.parse(raw),
    );
  }

  override async onAuth(_client: Client, options: unknown): Promise<AuthenticatedPlayer> {
    const parsed = joinOptionsSchema.parse(options);
    const verified = await verifyAuthToken(parsed.token);
    const user = await upsertUser(db, {
      provider: verified.provider,
      providerId: verified.providerId,
      nickname: parsed.nickname,
      isGuest: verified.isGuest,
    });
    return { userId: user.id, nickname: parsed.nickname, isGuest: verified.isGuest };
  }

  override onJoin(
    client: Client<unknown, AuthenticatedPlayer>,
    _options: unknown,
    auth?: AuthenticatedPlayer,
  ): void {
    if (auth === undefined) throw new Error("onJoin called without onAuth's result");
    const seat: Seat = {
      sessionId: client.sessionId,
      userId: auth.userId,
      nickname: auth.nickname,
    };
    this.seats.push(seat);
    if (this.hostUserId === null) this.hostUserId = seat.userId;
    void this.withLock(() => this.tryStartMatch());
    this.broadcastState();
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    if (!this.seats.some((seat) => seat.sessionId === client.sessionId)) return;
    if (consented) {
      this.handleDeparture(this.userIdFor(client));
      return;
    }
    try {
      await this.allowReconnection(client, 60);
    } catch {
      this.handleDeparture(this.userIdFor(client));
    }
  }

  override onDispose(): void {
    this.actionTimer?.clear();
  }

  private userIdFor(client: Client): string | undefined {
    return this.seats.find((s) => s.sessionId === client.sessionId)?.userId;
  }

  private clientForUser(userId: string): Client | undefined {
    const seat = this.seats.find((s) => s.userId === userId);
    return seat === undefined ? undefined : this.clients.getById(seat.sessionId);
  }

  private async withLock(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }

  private async handlePickPot(client: Client, message: { pot: number }): Promise<void> {
    const userId = this.userIdFor(client);
    const allowed = userId === this.hostUserId && this.roomPhase === "LOBBY" && this.pot === null;
    if (!allowed) {
      client.send("error", { message: "cannot set the pot now" });
      return;
    }
    this.pot = message.pot;
    await this.tryStartMatch();
    this.broadcastState();
  }

  private async handleThrow(client: Client): Promise<void> {
    const userId = this.userIdFor(client);
    if (userId === undefined) return;
    await this.runAction(userId, (state) => reduceThrow(state, this.rng, DEFAULT_CONFIG));
  }

  private async handleTokka(client: Client, message: TokkaPayload): Promise<void> {
    const userId = this.userIdFor(client);
    if (userId === undefined || this.matchState === null || this.roomPhase !== "PLAYING") return;
    if (this.matchState.currentPlayer !== userId) return;
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

    await this.runAction(userId, (state) => reduceTokka(state, message, DEFAULT_CONFIG));
  }

  private async runAction(
    userId: string,
    act: (state: MatchState) => { state: MatchState; events: readonly MatchEvent[] },
  ): Promise<void> {
    if (this.matchState === null || this.roomPhase !== "PLAYING") return;
    if (this.matchState.currentPlayer !== userId) return;
    try {
      const { state, events } = act(this.matchState);
      await this.applyMatchResult(state, events);
    } catch (err) {
      if (err instanceof InvalidActionError) {
        this.clientForUser(userId)?.send("error", { message: err.message });
        return;
      }
      throw err;
    }
  }

  private async applyMatchResult(state: MatchState, events: readonly MatchEvent[]): Promise<void> {
    this.matchState = state;
    this.broadcast("events", events);
    this.broadcastState();
    if (state.phase === "ENDED") {
      await this.finishMatch(state);
      return;
    }
    this.scheduleNextAction();
  }

  private scheduleNextAction(): void {
    this.actionTimer?.clear();
    this.actionTimer = null;
    if (this.matchState === null) return;
    if (this.forfeited.has(this.matchState.currentPlayer)) {
      void this.withLock(() => this.runTimeout());
      return;
    }
    this.actionTimer = this.clock.setTimeout(
      () => void this.withLock(() => this.runTimeout()),
      DEFAULT_CONFIG.turnTimeoutMs,
    );
  }

  private async runTimeout(): Promise<void> {
    if (this.matchState === null || this.roomPhase !== "PLAYING") return;
    const { state, events } = reduceTimeout(this.matchState);
    await this.applyMatchResult(state, events);
  }

  private async tryStartMatch(): Promise<void> {
    if (this.roomPhase !== "LOBBY") return;
    if (this.pot === null || this.seats.length < this.maxClients) return;

    const seats = this.seats;
    const playerIds = seats.map((seat) => seat.userId);
    const pot = this.pot;
    const stake = pot / playerIds.length;

    if (!(await canAffordAll(db, playerIds, stake))) {
      this.broadcast("error", { message: "a player cannot afford the stake" });
      return;
    }

    let matchState: MatchState;
    try {
      matchState = createMatchState(playerIds, pot, DEFAULT_CONFIG);
    } catch (err) {
      if (err instanceof InvalidMatchConfigError) {
        this.broadcast("error", { message: err.message });
        return;
      }
      throw err;
    }

    const matchId = await startMatch(db, {
      mode: this.mode,
      pot,
      playerCount: playerIds.length,
      players: playerIds,
      seed: randomBytes(8).toString("hex"),
    });

    const charged: string[] = [];
    try {
      for (const userId of playerIds) {
        await applyLedger(db, {
          userId,
          currency: "coin",
          delta: -stake,
          reason: "match_stake",
          refType: "match",
          refId: matchId,
        });
        charged.push(userId);
      }
    } catch (err) {
      for (const userId of charged) {
        await applyLedger(db, {
          userId,
          currency: "coin",
          delta: stake,
          reason: "match_stake_refund",
          refType: "match",
          refId: matchId,
        });
      }
      if (err instanceof InsufficientCoinsError) {
        this.broadcast("error", { message: "a player cannot afford the stake" });
        return;
      }
      throw err;
    }

    this.matchId = matchId;
    this.matchState = matchState;
    this.roomPhase = "PLAYING";
    this.scheduleNextAction();
    // tryStartMatch runs async (DB calls), so onJoin/handlePickPot's own broadcastState()
    // fires before this resolves - the client only learns PLAYING actually started here.
    this.broadcastState();
  }

  private handleDeparture(userId: string | undefined): void {
    if (userId === undefined) return;
    if (this.roomPhase !== "PLAYING" || this.matchState === null) {
      this.seats = this.seats.filter((seat) => seat.userId !== userId);
      this.broadcastState();
      return;
    }
    if (this.forfeited.has(userId)) return;
    this.forfeited.add(userId);

    const remaining = this.matchState.players.filter((p) => !this.forfeited.has(p));
    if (remaining.length <= 1) {
      const finalState: MatchState = {
        ...this.matchState,
        phase: "ENDED",
        winner: remaining[0] ?? null,
        turn: null,
      };
      void this.withLock(() => this.applyMatchResult(finalState, []));
      return;
    }
    if (this.matchState.currentPlayer === userId) void this.withLock(() => this.runTimeout());
  }

  private async finishMatch(state: MatchState): Promise<void> {
    this.roomPhase = "ENDED";
    this.actionTimer?.clear();
    this.actionTimer = null;

    const settlement = settle(state);
    if (settlement.payout !== null && this.matchId !== null) {
      const { player, coins } = settlement.payout;
      await applyLedger(db, {
        userId: player,
        currency: "coin",
        delta: coins,
        reason: "match_win",
        refType: "match",
        refId: this.matchId,
      });
      await applyLedger(db, {
        userId: player,
        currency: "wp",
        delta: coins,
        reason: "match_win",
        refType: "match",
        refId: this.matchId,
      });
    }
    if (this.matchId !== null) {
      await endMatch(db, { matchId: this.matchId, winnerId: state.winner, turnLog: state.turnLog });
    }

    this.broadcast("matchEnded", { winner: state.winner, settlement });
    this.clock.setTimeout(() => this.disconnect(), 10_000);
  }

  private broadcastState(): void {
    this.broadcast("state", {
      mode: this.mode,
      code: this.code,
      roomPhase: this.roomPhase,
      hostUserId: this.hostUserId,
      seats: this.seats,
      match: this.matchState,
    });
  }
}
