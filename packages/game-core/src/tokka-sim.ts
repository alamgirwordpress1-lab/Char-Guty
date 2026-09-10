import { circlesOverlap, speedOf, stepBody } from "./sim.js";
import type { Body } from "./sim.js";
import type { Vec2 } from "./types.js";

export interface FlickInput {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
}

export interface TokkaTarget {
  readonly position: Vec2;
  readonly radius: number;
}

export interface TokkaSimTuning {
  readonly friction: number;
  readonly dt: number;
  readonly restSpeed: number;
  readonly maxSteps: number;
}

export interface TokkaFlickResult {
  readonly success: boolean;
  readonly finalPosition: Vec2;
  readonly steps: number;
}

/**
 * Deterministically simulates a flicked guti sliding toward a stationary target,
 * stepping at a fixed dt until it either overlaps the target (hit) or comes to
 * rest first (miss). Pure function of its inputs: same inputs, same result.
 */
export function simulateTokkaFlick(
  flicked: FlickInput,
  target: TokkaTarget,
  tuning: TokkaSimTuning,
): TokkaFlickResult {
  let body: Body = {
    position: flicked.position,
    velocity: flicked.velocity,
    radius: flicked.radius,
  };
  const targetBody: Body = {
    position: target.position,
    velocity: { x: 0, y: 0 },
    radius: target.radius,
  };

  let steps = 0;
  while (steps < tuning.maxSteps) {
    body = stepBody(body, tuning.friction, tuning.dt);
    steps += 1;

    if (circlesOverlap(body, targetBody)) {
      return { success: true, finalPosition: body.position, steps };
    }
    if (speedOf(body.velocity) <= tuning.restSpeed) {
      break;
    }
  }

  return { success: false, finalPosition: body.position, steps };
}
