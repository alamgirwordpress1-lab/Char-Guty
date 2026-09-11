import { describe, expect, it } from "vitest";
import {
  joinOptionsSchema,
  matchEventSchema,
  matchStateSchema,
  pickPotPayloadSchema,
  tokkaPayloadSchema,
} from "./messages.js";

describe("joinOptionsSchema", () => {
  it("accepts a random-mode join with pot and playerCount", () => {
    const result = joinOptionsSchema.safeParse({
      token: "t",
      nickname: "alice",
      mode: "random",
      playerCount: 2,
      pot: 100,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a friend-mode join without a pot", () => {
    const result = joinOptionsSchema.safeParse({
      token: "t",
      nickname: "bob",
      mode: "friend",
      playerCount: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a random-mode join missing a pot", () => {
    const result = joinOptionsSchema.safeParse({
      token: "t",
      nickname: "bob",
      mode: "random",
      playerCount: 2,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a vs-computer join with a pot, and rejects one without", () => {
    const join = { token: "t", nickname: "bob", mode: "computer", playerCount: 2 };
    expect(joinOptionsSchema.safeParse({ ...join, pot: 100 }).success).toBe(true);
    expect(joinOptionsSchema.safeParse(join).success).toBe(false);
  });

  it("rejects an empty nickname", () => {
    const result = joinOptionsSchema.safeParse({
      token: "t",
      nickname: "",
      mode: "friend",
      playerCount: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing token", () => {
    const result = joinOptionsSchema.safeParse({ nickname: "bob", mode: "friend", playerCount: 2 });
    expect(result.success).toBe(false);
  });
});

describe("pickPotPayloadSchema", () => {
  it("accepts an allowed pot", () => {
    expect(pickPotPayloadSchema.safeParse({ pot: 300 }).success).toBe(true);
  });

  it("rejects a pot outside the allowed set", () => {
    expect(pickPotPayloadSchema.safeParse({ pot: 250 }).success).toBe(false);
  });
});

describe("tokkaPayloadSchema", () => {
  it("accepts a valid tokka payload", () => {
    const result = tokkaPayloadSchema.safeParse({
      shooterId: 0,
      flick: { dx: 1, dy: 0, power: 300 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a shooterId outside 0-3", () => {
    const result = tokkaPayloadSchema.safeParse({
      shooterId: 4,
      flick: { dx: 1, dy: 0, power: 300 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative flick power", () => {
    const result = tokkaPayloadSchema.safeParse({
      shooterId: 0,
      flick: { dx: 1, dy: 0, power: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("matchEventSchema", () => {
  it("accepts a TURN event", () => {
    expect(matchEventSchema.safeParse({ type: "TURN", player: "a" }).success).toBe(true);
  });

  it("accepts a WIN event", () => {
    const result = matchEventSchema.safeParse({ type: "WIN", player: "a", reason: "REACHED_POT" });
    expect(result.success).toBe(true);
  });

  it("accepts a TOKKA event that touched nothing", () => {
    const result = matchEventSchema.safeParse({
      type: "TOKKA",
      player: "a",
      shooterId: 2,
      hitId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(matchEventSchema.safeParse({ type: "GHOST", player: "a" }).success).toBe(false);
  });
});

describe("matchStateSchema", () => {
  it("accepts a well-formed match state", () => {
    const state = {
      players: ["a", "b"],
      pot: 100,
      stake: 50,
      phase: "THROW",
      currentPlayer: "a",
      scores: { a: 0, b: 0 },
      gutis: [],
      tokkasLeft: 0,
      turn: { player: "a", outcome: null, flatCount: null, points: 0, tokkas: [] },
      turnLog: [],
      winner: null,
    };
    expect(matchStateSchema.safeParse(state).success).toBe(true);
  });
});
