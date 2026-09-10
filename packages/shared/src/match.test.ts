import { describe, expect, it } from "vitest";
import { matchSetupSchema } from "./match.js";

describe("matchSetupSchema", () => {
  it("accepts a valid pot and player count", () => {
    expect(matchSetupSchema.safeParse({ pot: 100, playerCount: 4 }).success).toBe(true);
  });

  it("rejects a pot outside the allowed set", () => {
    expect(matchSetupSchema.safeParse({ pot: 150, playerCount: 2 }).success).toBe(false);
  });

  it("rejects a player count below 2", () => {
    expect(matchSetupSchema.safeParse({ pot: 100, playerCount: 1 }).success).toBe(false);
  });

  it("rejects a player count above 4", () => {
    expect(matchSetupSchema.safeParse({ pot: 100, playerCount: 5 }).success).toBe(false);
  });

  it("rejects a non-integer player count", () => {
    expect(matchSetupSchema.safeParse({ pot: 100, playerCount: 2.5 }).success).toBe(false);
  });
});
