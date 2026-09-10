import type { GameConfig } from "./config.js";
import { resolveThrow, tokkaPairs } from "./resolve.js";
import type { Rng } from "./rng.js";
import { throwGutis } from "./throw.js";
import { simulateTokka } from "./tokka.js";
import type { Flick } from "./tokka.js";
import type { Guti, ThrowOutcome, ThrowResult } from "./types.js";

export type MatchPhase = "THROW" | "TOKKA" | "ENDED";
export type TurnEnd = "SCORED" | "DIE" | "TIMEOUT" | "WIN";
export type TokkaPair = readonly [number, number];

export interface TokkaRecord {
  readonly shooterId: number;
  readonly targetId: number;
  readonly hit: boolean;
}

export interface TurnInProgress {
  readonly player: string;
  readonly outcome: ThrowOutcome | null;
  readonly flatCount: number | null;
  readonly points: number;
  readonly tokkas: readonly TokkaRecord[];
}

export interface TurnRecord extends TurnInProgress {
  readonly end: TurnEnd;
}

export interface MatchState {
  readonly players: readonly string[];
  readonly pot: number;
  readonly stake: number;
  readonly phase: MatchPhase;
  readonly currentPlayer: string;
  readonly scores: Readonly<Record<string, number>>;
  readonly gutis: readonly Guti[];
  /** Distance-eligible pairs for the next flick; recomputed after every tokka. */
  readonly pendingTokkas: readonly TokkaPair[];
  readonly tokkasLeft: number;
  readonly turn: TurnInProgress | null;
  readonly turnLog: readonly TurnRecord[];
  readonly winner: string | null;
}

export type MatchEvent =
  | { readonly type: "THROW"; readonly player: string; readonly result: ThrowResult }
  | {
      readonly type: "TOKKA";
      readonly player: string;
      readonly shooterId: number;
      readonly targetId: number;
      readonly hit: boolean;
    }
  | {
      readonly type: "SCORE";
      readonly player: string;
      readonly points: number;
      readonly total: number;
    }
  | { readonly type: "DIE"; readonly player: string; readonly reason: "TOKKA_MISS" | "TIMEOUT" }
  | { readonly type: "WIN"; readonly player: string; readonly reason: "ZERO_FLAT" | "REACHED_POT" }
  | { readonly type: "TURN"; readonly player: string };

export interface ActionResult {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
}

export interface TokkaInput {
  readonly shooterId: number;
  readonly targetId: number;
  readonly flick: Flick;
}

export interface Settlement {
  /** Paid by every player when the match was created. */
  readonly stakes: readonly { readonly player: string; readonly coins: number }[];
  readonly payout: { readonly player: string; readonly coins: number } | null;
  readonly deltas: Readonly<Record<string, number>>;
}

export interface CreateMatchInput {
  readonly players: readonly string[];
  readonly pot: number;
  readonly rng: Rng;
  readonly config: GameConfig;
}

export interface Match {
  readonly state: MatchState;
  throw(): ActionResult;
  tokka(input: TokkaInput): ActionResult;
  timeout(): ActionResult;
  settle(): Settlement;
}

export class InvalidMatchConfigError extends Error {}
export class InvalidActionError extends Error {}

/** Stateful convenience wrapper over the pure reducers below; rng and config are bound once. */
export function createMatch({ players, pot, rng, config }: CreateMatchInput): Match {
  let state = createMatchState(players, pot, config);
  const apply = (result: ActionResult): ActionResult => {
    state = result.state;
    return result;
  };
  return {
    get state() {
      return state;
    },
    throw: () => apply(reduceThrow(state, rng, config)),
    tokka: (input) => apply(reduceTokka(state, input, config)),
    timeout: () => apply(reduceTimeout(state)),
    settle: () => settle(state),
  };
}

export function createMatchState(
  players: readonly string[],
  pot: number,
  config: GameConfig,
): MatchState {
  const first = players[0];
  if (first === undefined || players.length < 2 || players.length > 4) {
    throw new InvalidMatchConfigError(`need 2-4 players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) {
    throw new InvalidMatchConfigError("player ids must be unique");
  }
  if (!config.potValues.includes(pot)) {
    throw new InvalidMatchConfigError(`pot ${pot} is not one of ${config.potValues.join(", ")}`);
  }
  if (pot % players.length !== 0) {
    throw new InvalidMatchConfigError(
      `pot ${pot} does not divide evenly by ${players.length} players`,
    );
  }
  const scores: Record<string, number> = {};
  for (const player of players) scores[player] = 0;
  return {
    players: [...players],
    pot,
    stake: pot / players.length,
    phase: "THROW",
    currentPlayer: first,
    scores,
    gutis: [],
    pendingTokkas: [],
    tokkasLeft: 0,
    turn: startTurn(first),
    turnLog: [],
    winner: null,
  };
}

export function reduceThrow(state: MatchState, rng: Rng, config: GameConfig): ActionResult {
  const turn = activeTurn(state, "throw", ["THROW"]);
  const player = state.currentPlayer;
  const gutis = throwGutis(rng, config);
  const result = resolveThrow(gutis);
  const events: MatchEvent[] = [{ type: "THROW", player, result }];
  const thrown: TurnInProgress = { ...turn, outcome: result.outcome, flatCount: result.flatCount };
  const base: MatchState = { ...state, gutis };

  if (result.outcome === "instantWin") {
    events.push({ type: "WIN", player, reason: "ZERO_FLAT" });
    return { state: finishMatch(base, thrown), events };
  }
  if (result.outcome === "four") {
    const scored = addPoints(base, thrown, result.points, events);
    if (hasReachedPot(scored.state)) {
      events.push({ type: "WIN", player, reason: "REACHED_POT" });
      return { state: finishMatch(scored.state, scored.turn), events };
    }
    return { state: passTurn(scored.state, scored.turn, "SCORED", events), events };
  }

  const pendingTokkas = tokkaPairs(gutis, config.tokkaRadius);
  if (pendingTokkas.length === 0) {
    return { state: passTurn(base, thrown, "SCORED", events), events };
  }
  return {
    state: {
      ...base,
      phase: "TOKKA",
      pendingTokkas,
      tokkasLeft: result.requiredTokkas,
      turn: thrown,
    },
    events,
  };
}

export function reduceTokka(
  state: MatchState,
  { shooterId, targetId, flick }: TokkaInput,
  config: GameConfig,
): ActionResult {
  const turn = activeTurn(state, "tokka", ["TOKKA"]);
  if (!isPending(state.pendingTokkas, shooterId, targetId)) {
    throw new InvalidActionError(
      `gutis ${shooterId} and ${targetId} are not an eligible tokka pair`,
    );
  }
  const player = state.currentPlayer;
  const sim = simulateTokka(state.gutis, shooterId, targetId, flick, config);
  const events: MatchEvent[] = [{ type: "TOKKA", player, shooterId, targetId, hit: sim.hit }];
  const attempted: TurnInProgress = {
    ...turn,
    tokkas: [...turn.tokkas, { shooterId, targetId, hit: sim.hit }],
  };
  const base: MatchState = { ...state, gutis: sim.finalGutis };

  if (!sim.hit) {
    events.push({ type: "DIE", player, reason: "TOKKA_MISS" });
    return { state: passTurn(base, attempted, "DIE", events), events };
  }

  const scored = addPoints(base, attempted, 1, events);
  if (hasReachedPot(scored.state)) {
    events.push({ type: "WIN", player, reason: "REACHED_POT" });
    return { state: finishMatch(scored.state, scored.turn), events };
  }
  const tokkasLeft = state.tokkasLeft - 1;
  const pendingTokkas = tokkaPairs(sim.finalGutis, config.tokkaRadius);
  if (tokkasLeft === 0 || pendingTokkas.length === 0) {
    return { state: passTurn(scored.state, scored.turn, "SCORED", events), events };
  }
  return { state: { ...scored.state, pendingTokkas, tokkasLeft, turn: scored.turn }, events };
}

export function reduceTimeout(state: MatchState): ActionResult {
  const turn = activeTurn(state, "timeout", ["THROW", "TOKKA"]);
  const events: MatchEvent[] = [{ type: "DIE", player: state.currentPlayer, reason: "TIMEOUT" }];
  return { state: passTurn(state, turn, "TIMEOUT", events), events };
}

export function settle(state: MatchState): Settlement {
  const stakes = state.players.map((player) => ({ player, coins: -state.stake }));
  const payout = state.winner === null ? null : { player: state.winner, coins: state.pot };
  const deltas: Record<string, number> = {};
  for (const stake of stakes) deltas[stake.player] = stake.coins;
  if (payout !== null) deltas[payout.player] = (deltas[payout.player] ?? 0) + payout.coins;
  return { stakes, payout, deltas };
}

function startTurn(player: string): TurnInProgress {
  return { player, outcome: null, flatCount: null, points: 0, tokkas: [] };
}

function activeTurn(
  state: MatchState,
  action: string,
  phases: readonly MatchPhase[],
): TurnInProgress {
  if (state.turn === null || !phases.includes(state.phase)) {
    throw new InvalidActionError(`cannot ${action} in phase ${state.phase}`);
  }
  return state.turn;
}

function isPending(pairs: readonly TokkaPair[], shooterId: number, targetId: number): boolean {
  return pairs.some(
    ([a, b]) => (a === shooterId && b === targetId) || (a === targetId && b === shooterId),
  );
}

function addPoints(
  state: MatchState,
  turn: TurnInProgress,
  points: number,
  events: MatchEvent[],
): { state: MatchState; turn: TurnInProgress } {
  const player = state.currentPlayer;
  const total = (state.scores[player] ?? 0) + points;
  events.push({ type: "SCORE", player, points, total });
  return {
    state: { ...state, scores: { ...state.scores, [player]: total } },
    turn: { ...turn, points: turn.points + points },
  };
}

function hasReachedPot(state: MatchState): boolean {
  return (state.scores[state.currentPlayer] ?? 0) >= state.pot;
}

function passTurn(
  state: MatchState,
  turn: TurnInProgress,
  end: Exclude<TurnEnd, "WIN">,
  events: MatchEvent[],
): MatchState {
  const index = state.players.indexOf(state.currentPlayer);
  const next = state.players[(index + 1) % state.players.length] ?? state.currentPlayer;
  events.push({ type: "TURN", player: next });
  return {
    ...state,
    phase: "THROW",
    currentPlayer: next,
    pendingTokkas: [],
    tokkasLeft: 0,
    turn: startTurn(next),
    turnLog: [...state.turnLog, { ...turn, end }],
  };
}

function finishMatch(state: MatchState, turn: TurnInProgress): MatchState {
  return {
    ...state,
    phase: "ENDED",
    winner: state.currentPlayer,
    pendingTokkas: [],
    tokkasLeft: 0,
    turn: null,
    turnLog: [...state.turnLog, { ...turn, end: "WIN" }],
  };
}
