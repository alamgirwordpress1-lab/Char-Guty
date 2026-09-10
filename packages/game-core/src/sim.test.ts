import { describe, expect, it } from "vitest";
import { applyFriction, circlesOverlap, speedOf, stepBody } from "./sim.js";

describe("speedOf", () => {
  it("returns the euclidean magnitude", () => {
    expect(speedOf({ x: 3, y: 4 })).toBe(5);
  });
});

describe("applyFriction", () => {
  it("reduces speed by friction * dt while preserving direction", () => {
    const result = applyFriction({ x: 100, y: 0 }, 50, 1);
    expect(result).toEqual({ x: 50, y: 0 });
  });

  it("clamps at zero instead of reversing direction", () => {
    const result = applyFriction({ x: 10, y: 0 }, 50, 1);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("leaves a zero velocity unchanged", () => {
    expect(applyFriction({ x: 0, y: 0 }, 50, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe("stepBody", () => {
  it("integrates position using the post-friction velocity", () => {
    const body = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 }, radius: 15 };
    const next = stepBody(body, 0, 1);
    expect(next.position).toEqual({ x: 100, y: 0 });
    expect(next.velocity).toEqual({ x: 100, y: 0 });
  });

  it("decelerates and moves in the same step", () => {
    const body = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 }, radius: 15 };
    const next = stepBody(body, 40, 1);
    expect(next.velocity).toEqual({ x: 60, y: 0 });
    expect(next.position).toEqual({ x: 60, y: 0 });
  });
});

describe("circlesOverlap", () => {
  it("is true when circles overlap", () => {
    const a = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 15 };
    const b = { position: { x: 20, y: 0 }, velocity: { x: 0, y: 0 }, radius: 15 };
    expect(circlesOverlap(a, b)).toBe(true);
  });

  it("is true when exactly touching", () => {
    const a = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 15 };
    const b = { position: { x: 30, y: 0 }, velocity: { x: 0, y: 0 }, radius: 15 };
    expect(circlesOverlap(a, b)).toBe(true);
  });

  it("is false when apart", () => {
    const a = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 15 };
    const b = { position: { x: 100, y: 0 }, velocity: { x: 0, y: 0 }, radius: 15 };
    expect(circlesOverlap(a, b)).toBe(false);
  });
});
