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
  strayFlick,
} from "@char-guty/game-core";
import type { MatchEvent, MatchState, Settlement } from "@char-guty/game-core";
import { joinOptionsSchema, pickPotPayloadSchema, tokkaPayloadSchema } from "@char-guty/shared";
import type { TokkaPayload } from "@char-guty/shared";
import { randomBytes, randomUUID } from "node:crypto";
import { verifyAuthToken } from "../auth/auth.js";
import { db } from "../db/client.js";
import { endMatch, startMatch } from "../db/matchRepository.js";
import { upsertUser } from "../db/userService.js";
import { applyLedger, canAffordAll, InsufficientCoinsError } from "../db/walletService.js";
import { CryptoRng } from "../rng/CryptoRng.js";
import { chooseComputerTokka } from "./computerPlayer.js";
import { generateRoomCode } from "./roomCode.js";

type RoomMode = "friend" | "random" | "computer";
type RoomPhase = "LOBBY" | "PLAYING" | "ENDED";

/** How long a finished game's result stays up before scores reset and the next game starts. */
const NEXT_ROUND_DELAY_MS = 10_000;
/** How long a computer player takes over each action, so its moves can be followed. */
const COMPUTER_THINK_MS = 1_200;
const LOCK_RETRY_MS = 250;
/** Vs-computer games are practice: nothing is staked, so there's nothing to settle. */
const NO_SETTLEMENT: Settlement = { stakes: [], payout: null, deltas: {} };

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
  /** A server-driven computer player: no connection, and never staked or paid. */
  readonly isComputer: boolean;
}

/**
 * Server-authoritative Char Guti room. No synced @colyseus/schema state - the full
 * MatchState has no hidden information (every piece is visible to every player), so
 * it's simply rebroadcast wholesale after each action instead of field-diffed.
 *
 * Player identity: game-core's MatchState.players holds the persistent db user id
 * (survives reconnects and is what the wallet/matches tables key on), not the
 * Colyseus sessionId - `seats` maps between the two.
 *
 * A room outlives one game: once someone reaches the pot, the result stays up for
 * NEXT_ROUND_DELAY_MS, then everyone still seated stakes again and a new game starts
 * from zero, with the first throw passing to the next seat.
 *
 * In "computer" mode the one human who opened the room is seated with computer players,
 * which take their turns from here (playComputerAction). Those games are practice only.
 */
export class GutiRoom extends Room<object, RoomMetadata, unknown, AuthenticatedPlayer> {
  private mode: RoomMode = "random";
  private code: string | null = null;
  private pot: number | null = null;
  /** Seats a game needs, computer players included. */
  private playerCount = 2;
  private hostUserId: string | null = null;
  private seats: Seat[] = [];
  private roomPhase: RoomPhase = "LOBBY";
  private matchState: MatchState | null = null;
  private matchId: string | null = null;
  private readonly rng = new CryptoRng();
  private readonly forfeited = new Set<string>();
  private actionTimer: Delayed | null = null;
  private computerTimer: Delayed | null = null;
  private nextRoundTimer: Delayed | null = null;
  /** Epoch ms by which the current player must act; null when nothing is pending. */
  private turnDeadlineAt: number | null = null;
  /** Who threw first in the previous game; the next game starts from the seat after. */
  private lastStarter: string | null = null;
  /** Serializes DB-touching mutations - message handlers are async now, so a second
   * message can otherwise arrive mid-await and race the first. */
  private busy = false;

  override async onCreate(options: unknown): Promise<void> {
    const parsed = joinOptionsSchema.parse(options);
    this.mode = parsed.mode;
    this.playerCount = parsed.playerCount;
    // A vs-computer room admits only the human who opened it; computers take the other seats.
    this.maxClients = parsed.mode === "computer" ? 1 : parsed.playerCount;
    this.pot = parsed.pot ?? null;
    this.code = this.mode === "friend" ? generateRoomCode() : null;

    await this.setMetadata({
      mode: this.mode,
      code: this.code,
      pot: this.pot,
      playerCount: this.playerCount,
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
    // A banned account is turned away here, before it can take a seat or stake coins.
    if (user.bannedAt !== null) throw new Error("account banned");
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
      isComputer: false,
    };
    this.seats.push(seat);
    if (this.hostUserId === null) this.hostUserId = seat.userId;
    if (this.mode === "computer") this.seatComputers();
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
      const reconnected = await this.allowReconnection(client, 60);
      reconnected.send("state", this.statePayload());
    } catch {
      this.handleDeparture(this.userIdFor(client));
    }
  }

  override onDispose(): void {
    this.actionTimer?.clear();
    this.computerTimer?.clear();
    this.nextRoundTimer?.clear();
  }

  /** Vs-computer games are practice: only games between people put coins on the line. */
  private get staked(): boolean {
    return this.mode !== "computer";
  }

  private seatComputers(): void {
    while (this.seats.length < this.playerCount) {
      const id = randomUUID();
      this.seats.push({
        sessionId: `computer-${id}`,
        userId: id,
        nickname: "Computer",
        isComputer: true,
      });
    }
  }

  private isComputer(userId: string): boolean {
    return this.seats.some((seat) => seat.userId === userId && seat.isComputer);
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

  /** A timer that runs fn under the lock, waiting for the lock rather than being dropped as busy. */
  private runLockedSoon(fn: () => Promise<void>, delayMs: number): Delayed {
    return this.clock.setTimeout(() => {
      if (this.busy) this.runLockedSoon(fn, LOCK_RETRY_MS);
      else void this.withLock(fn);
    }, delayMs);
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
    if (userId !== undefined) await this.playTokka(userId, message);
  }

  private async playTokka(userId: string, tokka: TokkaPayload): Promise<void> {
    const state = this.matchState;
    if (state === null || this.roomPhase !== "PLAYING") return;
    if (state.currentPlayer !== userId || state.phase !== "TOKKA") return;
    // A stale client can still send a guti that has already gone out.
    if (!state.gutis.some((g) => g.id === tokka.shooterId)) return;

    // The flick as played: it strays from the aim that was sent, more the harder it is.
    const played = { ...tokka, flick: strayFlick(tokka.flick, this.rng, DEFAULT_CONFIG) };
    // Re-run the (pure, deterministic) sim standalone purely to capture replay frames -
    // reduceTokka below performs the authoritative hit/position calculation itself.
    const { frames } = simulateTokka(state.gutis, played.shooterId, played.flick, {
      ...DEFAULT_CONFIG,
      recordFrames: true,
    });
    if (frames !== undefined) this.broadcast("tokkaFrames", frames);

    await this.runAction(userId, (current) => reduceTokka(current, played, DEFAULT_CONFIG));
  }

  private async playComputerAction(): Promise<void> {
    const state = this.matchState;
    if (state === null || this.roomPhase !== "PLAYING") return;
    const player = state.currentPlayer;
    if (!this.isComputer(player)) return;
    if (state.phase === "THROW") {
      await this.runAction(player, (current) => reduceThrow(current, this.rng, DEFAULT_CONFIG));
    } else if (state.phase === "TOKKA") {
      await this.playTokka(player, chooseComputerTokka(state.gutis, this.rng));
    }
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
    if (state.phase === "ENDED") {
      this.turnDeadlineAt = null;
      this.broadcast("events", events);
      this.broadcastState();
      await this.finishMatch(state);
      return;
    }
    // Schedule first so the new deadline rides along in this state broadcast.
    this.scheduleNextAction();
    this.broadcast("events", events);
    this.broadcastState();
  }

  private scheduleNextAction(): void {
    this.actionTimer?.clear();
    this.actionTimer = null;
    this.computerTimer?.clear();
    this.computerTimer = null;
    this.turnDeadlineAt = null;
    if (this.matchState === null) return;
    const current = this.matchState.currentPlayer;
    if (this.forfeited.has(current)) {
      // Deferred a tick: this runs inside the lock that produced the current state,
      // so an immediate withLock() call would be dropped as busy.
      this.clock.setTimeout(() => void this.withLock(() => this.runTimeout()), 0);
      return;
    }
    if (this.isComputer(current)) {
      this.computerTimer = this.runLockedSoon(() => this.playComputerAction(), COMPUTER_THINK_MS);
    }
    this.turnDeadlineAt = Date.now() + DEFAULT_CONFIG.turnTimeoutMs;
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
    if (this.pot === null || this.seats.length < this.playerCount) return;

    const playerIds = this.seats.map((seat) => seat.userId);
    const pot = this.pot;
    const stake = pot / playerIds.length;

    if (this.staked && !(await canAffordAll(db, playerIds, stake))) {
      this.broadcast("error", { message: "a player cannot afford the stake" });
      return;
    }

    let matchState: MatchState;
    try {
      matchState = createMatchState(playerIds, pot, DEFAULT_CONFIG, this.nextStarter(playerIds));
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

    if (this.staked) {
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
    }

    this.matchId = matchId;
    this.matchState = matchState;
    this.lastStarter = matchState.currentPlayer;
    this.roomPhase = "PLAYING";
    // Locked explicitly (Colyseus would auto-unlock on any leave) so a seat freed mid-game
    // isn't matchmade into a game already under way; seats reopen between games.
    await this.lock();
    this.scheduleNextAction();
    // tryStartMatch runs async (DB calls), so onJoin/handlePickPot's own broadcastState()
    // fires before this resolves - the client only learns PLAYING actually started here.
    this.broadcastState();
  }

  /** The seat after the previous game's first thrower; seat 0 for a first game or if they left. */
  private nextStarter(playerIds: readonly string[]): string | undefined {
    if (this.lastStarter === null) return undefined;
    const index = playerIds.indexOf(this.lastStarter);
    return playerIds[(index + 1) % playerIds.length];
  }

  private handleDeparture(userId: string | undefined): void {
    if (userId === undefined) return;
    if (this.roomPhase !== "PLAYING" || this.matchState === null) {
      this.seats = this.seats.filter((seat) => seat.userId !== userId);
      // Reopen the freed seat; between games (ENDED) startNextRound decides that instead.
      if (this.roomPhase === "LOBBY") void this.unlock();
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
    this.computerTimer?.clear();
    this.computerTimer = null;

    const settlement = this.staked ? settle(state) : NO_SETTLEMENT;
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

    this.broadcast("matchEnded", {
      winner: state.winner,
      settlement,
      nextRoundInMs: NEXT_ROUND_DELAY_MS,
    });
    this.nextRoundTimer = this.runLockedSoon(() => this.startNextRound(), NEXT_ROUND_DELAY_MS);
  }

  /** Deals a fresh game, scores back at zero, to whoever is still seated. */
  private async startNextRound(): Promise<void> {
    if (this.roomPhase !== "ENDED") return;
    this.nextRoundTimer = null;
    this.seats = this.seats.filter((seat) => !this.forfeited.has(seat.userId));
    this.forfeited.clear();
    this.matchState = null;
    this.matchId = null;
    this.roomPhase = "LOBBY";

    await this.tryStartMatch();
    if (this.roomPhase !== "LOBBY") return;
    // Short of players (someone left) or of coins: wait in LOBBY, empty seats open again.
    if (this.seats.length < this.playerCount) await this.unlock();
    this.broadcastState();
  }

  private statePayload() {
    return {
      mode: this.mode,
      code: this.code,
      roomPhase: this.roomPhase,
      hostUserId: this.hostUserId,
      seats: this.seats,
      playerCount: this.playerCount,
      pot: this.pot,
      match: this.matchState,
      turnDeadlineAt: this.turnDeadlineAt,
      serverNow: Date.now(),
    };
  }

  private broadcastState(): void {
    this.broadcast("state", this.statePayload());
  }
}
