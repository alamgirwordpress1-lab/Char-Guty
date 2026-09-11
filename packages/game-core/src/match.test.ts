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
import { SeededRng } from "./rng.js";
import type { Rng } from "./rng.js";
import type { Guti } from "./types.js";

const config = DEFAULT_CONFIG;
const FLAT = 0.1; // below pFlat
const ROUND = 0.99; // at or above pFlat

/**
 * Scripted draws per guti: [side, x, y]. Lands at about (50,40) (200,150) (350,40) (88,232):
 * no two gutis closer than 135px.
 */
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

const at = (id: number, x: number, y: number): Guti => ({ id, side: "F", x, y });

/** 0 and 1 lie sixty px apart; 2 and 3 forty px apart, well away from them. */
const board: Guti[] = [at(0, 40, 150), at(1, 100, 150), at(2, 300, 60), at(3, 340, 60)];

function tokkaState(players: string[], gutis: Guti[], tokkasLeft = 2): MatchState {
  const base = createMatchState(players, 100, config);
  return {
    ...base,
    phase: "TOKKA",
    gutis,
    tokkasLeft,
    turn: { player: base.currentPlayer, outcome: "tokka", flatCount: 2, points: 0, tokkas: [] },
  };
}

const aimAt = (dx: number, power = 300) => ({ dx, dy: 0, power });

/** Flicks the first guti left on the mat straight at its nearest neighbour, hard enough to reach. */
function playNearestTokka(match: Match) {
  const [shooter, ...others] = match.state.gutis;
  if (shooter === undefined) throw new Error("no gutis on the board");
  const distance = (g: Guti) => Math.hypot(g.x - shooter.x, g.y - shooter.y);
  const target = others.reduce((best, g) => (distance(g) < distance(best) ? g : best));
  const power = Math.sqrt(2 * config.friction * distance(target)) * 1.3;
  return match.tokka({
    shooterId: shooter.id,
    flick: { dx: target.x - shooter.x, dy: target.y - shooter.y, power },
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

  it("starts with the given first player when one is passed, and rejects an unseated one", () => {
    const state = createMatchState(["a", "b", "c"], 300, config, "c");
    expect(state.currentPlayer).toBe("c");
    expect(state.turn?.player).toBe("c");
    expect(() => createMatchState(["a", "b"], 100, config, "z")).toThrow(InvalidMatchConfigError);
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

  it("4F scores 4 and the same player throws again", () => {
    const match = createMatch({
      players: ["a", "b"],
      pot: 100,
      rng: scriptedRng([FLAT, FLAT, FLAT, FLAT]),
      config,
    });
    const { state, events } = match.throw();
    expect(events.map((e) => e.type)).toEqual(["THROW", "SCORE", "TURN"]);
    expect(events[1]).toEqual({ type: "SCORE", player: "a", points: 4, total: 4 });
    expect(events[2]).toEqual({ type: "TURN", player: "a" });
    expect(state.scores).toEqual({ a: 4, b: 0 });
    expect(state.currentPlayer).toBe("a");
    expect(state.phase).toBe("THROW");
    expect(state.turnLog.at(-1)).toMatchObject({
      player: "a",
      outcome: "four",
      points: 4,
      end: "SCORED",
    });
  });

  it("3F opens two tokkas, however far apart the gutis landed", () => {
    const match = createMatch({
      players: ["a", "b"],
      pot: 100,
      rng: scriptedRng([FLAT, FLAT, FLAT, ROUND]),
      config,
    });
    const { state, events } = match.throw();
    expect(events.map((e) => e.type)).toEqual(["THROW"]);
    expect(state.phase).toBe("TOKKA");
    expect(state.currentPlayer).toBe("a");
    expect(state.tokkasLeft).toBe(2);
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

  it("a tokka that touches no guti is a DIE that passes the turn", () => {
    const { state, events } = reduceTokka(
      tokkaState(["a", "b"], board),
      { shooterId: 0, flick: aimAt(-1) },
      config,
    );
    expect(events.map((e) => e.type)).toEqual(["TOKKA", "DIE", "TURN"]);
    expect(state.scores).toEqual({ a: 0, b: 0 });
    expect(state.currentPlayer).toBe("b");
    expect(state.phase).toBe("THROW");
  });
});

describe("tokka", () => {
  it("scores for touching any guti, and both gutis that met go out", () => {
    const { state, events } = reduceTokka(
      tokkaState(["a", "b"], board),
      { shooterId: 1, flick: aimAt(-1) },
      config,
    );
    expect(events).toEqual([
      { type: "TOKKA", player: "a", shooterId: 1, hitId: 0 },
      { type: "SCORE", player: "a", points: 1, total: 1 },
    ]);
    expect(state.gutis.map((g) => g.id)).toEqual([2, 3]);
    expect(state.phase).toBe("TOKKA");
    expect(state.tokkasLeft).toBe(1);
  });

  it("won't let a guti that went out be flicked again", () => {
    const first = reduceTokka(
      tokkaState(["a", "b"], board),
      { shooterId: 1, flick: aimAt(-1) },
      config,
    );
    expect(() => reduceTokka(first.state, { shooterId: 0, flick: aimAt(1) }, config)).toThrow(
      InvalidActionError,
    );
  });

  it("landing the second tokka on the two left scores again, and the same player throws again", () => {
    const first = reduceTokka(
      tokkaState(["a", "b"], board),
      { shooterId: 1, flick: aimAt(-1) },
      config,
    );
    const second = reduceTokka(first.state, { shooterId: 2, flick: aimAt(1) }, config);
    expect(second.events.map((e) => e.type)).toEqual(["TOKKA", "SCORE", "TURN"]);
    expect(second.state.scores).toEqual({ a: 2, b: 0 });
    expect(second.state.gutis).toEqual([]);
    expect(second.state.phase).toBe("THROW");
    expect(second.state.currentPlayer).toBe("a");
    expect(second.state.turnLog.at(-1)).toMatchObject({ player: "a", points: 2, end: "SCORED" });
  });

  it("keeps points from a completed tokka when the next one misses", () => {
    const first = reduceTokka(
      tokkaState(["a", "b"], board),
      { shooterId: 0, flick: aimAt(1) },
      config,
    );
    const second = reduceTokka(
      first.state,
      { shooterId: 2, flick: { dx: 0, dy: 1, power: 300 } },
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
        { shooterId: 0, hitId: 1 },
        { shooterId: 2, hitId: null },
      ],
    });
  });

  it("reaching the pot wins even with tokkas left", () => {
    const state = { ...tokkaState(["a", "b"], board), scores: { a: 99, b: 0 } };
    const { state: next, events } = reduceTokka(state, { shooterId: 0, flick: aimAt(1) }, config);
    expect(events.map((e) => e.type)).toEqual(["TOKKA", "SCORE", "WIN"]);
    expect(next.phase).toBe("ENDED");
    expect(next.winner).toBe("a");
    expect(settle(next).deltas).toEqual({ a: 50, b: -50 });
  });

  it("rejects a tokka outside the TOKKA phase, or with a guti that isn't on the board", () => {
    const match = createMatch({ players: ["a", "b"], pot: 100, rng: new SeededRng(1), config });
    expect(() => match.tokka({ shooterId: 0, flick: aimAt(1) })).toThrow(InvalidActionError);
    const withoutGuti3 = tokkaState(["a", "b"], board.slice(0, 3));
    expect(() => reduceTokka(withoutGuti3, { shooterId: 3, flick: aimAt(1) }, config)).toThrow(
      InvalidActionError,
    );
  });
});

describe("full game", () => {
  it("plays a seeded 2-player match to a win and settles it", () => {
    const players = ["a", "b"];
    const match = createMatch({ players, pot: 100, rng: new SeededRng(2024), config });
    let actions = 0;
    while (match.state.phase !== "ENDED" && actions < 5000) {
      if (match.state.phase === "THROW") match.throw();
      else playNearestTokka(match);
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
