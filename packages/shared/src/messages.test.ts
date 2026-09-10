import { describe, expect, it } from "vitest";
import { clientMessageSchema, MAX_FLICK_SPEED } from "./messages.js";

describe("clientMessageSchema", () => {
  it("accepts a throw message", () => {
    expect(clientMessageSchema.safeParse({ type: "throw" }).success).toBe(true);
  });

  it("accepts a valid flick message", () => {
    const result = clientMessageSchema.safeParse({
      type: "flick",
      targetGutiId: 0,
      velocity: { x: 100, y: 0 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a targetGutiId outside 0-3", () => {
    const result = clientMessageSchema.safeParse({
      type: "flick",
      targetGutiId: 4,
      velocity: { x: 100, y: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a velocity magnitude over the anti-cheat cap", () => {
    const result = clientMessageSchema.safeParse({
      type: "flick",
      targetGutiId: 0,
      velocity: { x: MAX_FLICK_SPEED + 1, y: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a velocity magnitude exactly at the cap", () => {
    const result = clientMessageSchema.safeParse({
      type: "flick",
      targetGutiId: 0,
      velocity: { x: MAX_FLICK_SPEED, y: 0 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown message type", () => {
    expect(clientMessageSchema.safeParse({ type: "explode" }).success).toBe(false);
  });
});
