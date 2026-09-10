import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config.js";
import {
  createMatch,
  createMatchState,
  InvalidActionError,
  InvalidMatchConfigError,
  reduceTokka,
  settle,
} from "./match.js";
import type { Match, MatchState } from "./match.js";
import { tokkaPairs } from "./resolve.js";
import { SeededRng } from "./rng.js";
import type { Rng } from "./rng.js";
import type { Guti } from "./types.js";

const config = DEFAULT_CONFIG;
const FLAT = 0.1; // below pFlat
const ROUND = 0.99; // at or above pFlat

/** Scripted draws per guti: [side, x, y]; the four landing spots are all > 80px apart. */
function scriptedRng(sides: readonly [number, number, number, number]): Rng {
  const draws = [sides[0], 0.1, 0.1, sides[1], 0.5, 0.5, sides[2], 0.9, 0.1, sides[3], 0.2, 0.8];
  let i = 0;
  return {
    next: () => {
      const v = draws[i % draws.length];
      i += 1;
      return v ?? 0;
    },
  };
}

const at = (id: number, x: number, y = 0): Guti => ({ id, side: "F", x, y });

/** Board with two eligible pairs: 0-1 (60px apart) and 2-3 (40px apart), far from each other. */
const twoPairs: Guti[] = [at(0, 0), at(1, 60), at(2, 300, 200), at(3, 340, 200)];

function tokkaState(players: string[], gutis: Guti[], tokkasLeft = 2): MatchState {
  const base = createMatchState(players, 100, config);
  return {
    ...base,
    phase: "TOKKA",
    gutis,
    pendingTokkas: tokkaPairs(gutis, config.tokkaRadius),
    tokkasLeft,
    turn: { player: base.currentPlayer, outcome: "tokka", flatCount: 2, points: 0, tokkas: [] },
  };
}

const aimAt = (dx: number) => ({ dx, dy: 0, power: 300 });

function playFirstPendingTokka(match: Match) {
  const pair = match.state.pendingTokkas[0];
  if (pair === undefined) throw new Error("no pending tokka");
  const [shooterId, targetId] = pair;
  const shooter = match.state.gutis.find((g) => g.id === shooterId);
  const target = match.state.gutis.find((g) => g.id === targetId);
  if (shooter === undefined || target === undefined) throw new Error("missing guti");
  return match.tokka({
    shooterId,
    targetId,
    flick: { dx: target.x - shooter.x, dy: target.y - shooter.y, power: 300 },
  });
}

describe("createMatch", () => {
  it("rejects a pot that is not allowed or does not divide evenly", () => {
    const rng = new SeededRng(1);
    expect(() => createMatch({ players: ["a", "b", "c"], pot: 100, rng, config })).toThrow(
      InvalidMatchConfigError,
    );
    expect(() => createMatch({ players: ["a", "b"], pot: 150, rng, config })).toThrow(
      InvalidMatchConfigError,
    );
    expect(() => createMatch({ players: ["a"], pot: 100, rng, config })).toThrow(
      InvalidMatchConfigError,
    );
  });

  it("charges stake = pot / players and starts with the first player throwing", () => {
    const match = createMatch({
      players: ["a", "b", "c", "d"],
      pot: 200,
      rng: new SeededRng(1),
      config,
    });
    expect(match.state.stake).toBe(50);
    expect(match.state.phase).toBe("THROW");
    expect(match.state.currentPlayer).toBe("a");
    expect(match.state.scores).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});

describe("throw", () => {
  it("0F wins the match instantly and settles the pot to the winner", () => {
    const match = createMatch({
      players: ["a", "b"],
      pot: 100,
      rng: scriptedRng([ROUND, ROUND, ROUND, ROUND]),
      config,
    });
    const { state, events } = match.throw();
    expect(events.map((e) => e.type)).toEqual(["THROW", "WIN"]);
    expect(state.phase).toBe("ENDED");
    expect(state.winner).toBe("a");
    expect(state.turnLog.at(-1)).toMatchObject({ player: "a", outcome: "instantWin", end: "WIN" });
    expect(settle(state)).toEqual({
      stakes: [
        { player: "a", coins: -50 },
        { player: "b", coins: -50 },
      ],
      payout: { player: "a", coins: 100 },
      deltas: { a: 50, b: -50 },
    });
  });

  it("4F scores 4 and passes the turn", () => {
    const match = createMatch({
      players: ["a", "b"],
      pot: 100,
      rng: scriptedRng([FLAT, FLAT, FLAT, FLAT]),
      config,
    });
    const { state, events } = match.throw();
    expect(events.map((e) => e.type)).toEqual(["THROW", "SCORE", "TURN"]);
    expect(events[1]).toEqual({ type: "SCORE", player: "a", points: 4, total: 4 });
    expect(state.scores).toEqual({ a: 4, b: 0 });
    expect(state.currentPlayer).toBe("b");
    expect(state.phase).toBe("THROW");
    expect(state.turnLog.at(-1)).toMatchObject({
      player: "a",
      outcome: "four",
      points: 4,
      end: "SCORED",
    });
  });

  it("a tokka outcome with no eligible pairs passes the turn with 0 points", () => {
    const match = createMatch({
      players: ["a", "b"],
      pot: 100,
      rng: scriptedRng([FLAT, FLAT, ROUND, ROUND]),
      config,
    });
    const { state, events } = match.throw();
    expect(events.map((e) => e.type)).toEqual(["THROW", "TURN"]);
    expect(state.scores).toEqual({ a: 0, b: 0 });
    expect(state.currentPlayer).toBe("b");
    expect(state.turnLog.at(-1)).toMatchObject({ outcome: "tokka", points: 0, end: "SCORED" });
  });
});

describe("die", () => {
  it.each([3, 4])("timeouts rotate through %i players and wrap around", (n) => {
    const players = ["p0", "p1", "p2", "p3"].slice(0, n);
    const match = createMatch({ players, pot: n === 3 ? 300 : 400, rng: new SeededRng(1), config });
    const seen = [match.state.currentPlayer];
    for (let i = 0; i < n; i++) {
      const { state, events } = match.timeout();
      expect(events.map((e) => e.type)).toEqual(["DIE", "TURN"]);
      seen.push(state.currentPlayer);
    }
    expect(seen).toEqual([...players, players[0]]);
    expect(match.state.turnLog.every((t) => t.end === "TIMEOUT")).toBe(true);
  });

  it("a missed tokka is a DIE that passes the turn", () => {
    const state = tokkaState(["a", "b"], twoPairs);
    const { state: next, events } = reduceTokka(
      state,
      { shooterId: 0, targetId: 1, flick: aimAt(-1) },
      config,
    );
    expect(events.map((e) => e.type)).toEqual(["TOKKA", "DIE", "TURN"]);
    expect(next.scores).toEqual({ a: 0, b: 0 });
    expect(next.currentPlayer).toBe("b");
    expect(next.phase).toBe("THROW");
  });
});

describe("tokka", () => {
  it("keeps points from completed tokkas when a later tokka in the same turn fails", () => {
    const state = tokkaState(["a", "b"], twoPairs);
    expect(state.pendingTokkas).toEqual([
      [0, 1],
      [2, 3],
    ]);

    const first = reduceTokka(state, { shooterId: 0, targetId: 1, flick: aimAt(1) }, config);
    expect(first.events).toContainEqual({ type: "SCORE", player: "a", points: 1, total: 1 });
    expect(first.state.phase).toBe("TOKKA");
    expect(first.state.tokkasLeft).toBe(1);

    const second = reduceTokka(
      first.state,
      { shooterId: 2, targetId: 3, flick: aimAt(-1) },
      config,
    );
    expect(second.events.map((e) => e.type)).toEqual(["TOKKA", "DIE", "TURN"]);
    expect(second.state.scores).toEqual({ a: 1, b: 0 });
    expect(second.state.currentPlayer).toBe("b");
    expect(second.state.turnLog.at(-1)).toMatchObject({
      player: "a",
      points: 1,
      end: "DIE",
      tokkas: [
        { shooterId: 0, targetId: 1, hit: true },
        { shooterId: 2, targetId: 3, hit: false },
      ],
    });
  });

  it("two successful tokkas score 2 and end the turn", () => {
    const first = reduceTokka(
      tokkaState(["a", "b"], twoPairs),
      { shooterId: 0, targetId: 1, flick: aimAt(1) },
      config,
    );
    const second = reduceTokka(first.state, { shooterId: 2, targetId: 3, flick: aimAt(1) }, config);
    expect(second.events.map((e) => e.type)).toEqual(["TOKKA", "SCORE", "TURN"]);
    expect(second.state.scores).toEqual({ a: 2, b: 0 });
    expect(second.state.phase).toBe("THROW");
    expect(second.state.currentPlayer).toBe("b");
  });

  it("reaching the pot wins even with tokkas left", () => {
    const state = { ...tokkaState(["a", "b"], twoPairs), scores: { a: 99, b: 0 } };
    const { state: next, events } = reduceTokka(
      state,
      { shooterId: 0, targetId: 1, flick: aimAt(1) },
      config,
    );
    expect(events.map((e) => e.type)).toEqual(["TOKKA", "SCORE", "WIN"]);
    expect(next.phase).toBe("ENDED");
    expect(next.winner).toBe("a");
    expect(settle(next).deltas).toEqual({ a: 50, b: -50 });
  });

  it("rejects a tokka outside the TOKKA phase or on a non-eligible pair", () => {
    const match = createMatch({ players: ["a", "b"], pot: 100, rng: new SeededRng(1), config });
    expect(() => match.tokka({ shooterId: 0, targetId: 1, flick: aimAt(1) })).toThrow(
      InvalidActionError,
    );
    const state = tokkaState(["a", "b"], twoPairs);
    expect(() =>
      reduceTokka(state, { shooterId: 0, targetId: 2, flick: aimAt(1) }, config),
    ).toThrow(InvalidActionError);
  });
});

describe("full game", () => {
  it("plays a seeded 2-player match to a win and settles it", () => {
    const players = ["a", "b"];
    const match = createMatch({ players, pot: 100, rng: new SeededRng(2024), config });
    let actions = 0;
    while (match.state.phase !== "ENDED" && actions < 5000) {
      if (match.state.phase === "THROW") match.throw();
      else playFirstPendingTokka(match);
      actions += 1;
    }

    const { state } = match;
    expect(state.phase).toBe("ENDED");
    expect(state.winner === null ? [] : players).toContain(state.winner);
    const lastTurn = state.turnLog.at(-1);
    expect(lastTurn?.end).toBe("WIN");
    const winnerScore = state.winner === null ? 0 : (state.scores[state.winner] ?? 0);
    expect(winnerScore >= 100 || lastTurn?.outcome === "instantWin").toBe(true);
    expect(() => match.throw()).toThrow(InvalidActionError);

    const settlement = settle(state);
    expect(settlement.payout).toEqual({ player: state.winner, coins: 100 });
    expect((settlement.deltas.a ?? 0) + (settlement.deltas.b ?? 0)).toBe(0);
  });
});
