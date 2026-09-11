import type { GameConfig } from "./config.js";
import type { Rng } from "./rng.js";
import type { Guti, Side } from "./types.js";

export interface Flick {
  readonly dx: number;
  readonly dy: number;
  readonly power: number;
}

export type SpreadConfig = Pick<GameConfig, "flickSpread" | "maxFlickPower">;

/** How far a flick of this power can veer off its aim, either side: sideways px per px travelled. */
export function flickSpread(power: number, config: SpreadConfig): number {
  return (config.flickSpread * clampPower(power, config.maxFlickPower)) / config.maxFlickPower;
}

/**
 * No hand is perfectly steady: turns the flick off its aim by a random amount within its
 * spread, so the harder a guti is flicked the less sure the shot. The server applies it to
 * every flick before simulating; like the sim, it avoids trig (it adds a sideways part).
 */
export function strayFlick(flick: Flick, rng: Rng, config: SpreadConfig): Flick {
  const veer = (rng.next() * 2 - 1) * flickSpread(flick.power, config);
  return { dx: flick.dx - flick.dy * veer, dy: flick.dy + flick.dx * veer, power: flick.power };
}

export type TokkaConfig = Pick<
  GameConfig,
  | "gutiRadius"
  | "friction"
  | "dt"
  | "restSpeed"
  | "maxFlickPower"
  | "maxSimSeconds"
  | "fieldWidth"
  | "fieldHeight"
> & {
  /** Record every guti after each step (frames[0] is the initial state) for client replay. */
  readonly recordFrames?: boolean;
};

export interface TokkaResult {
  /** The first guti the shooter touched - any guti counts - or null if it touched none. */
  readonly hitId: number | null;
  readonly finalGutis: Guti[];
  readonly frames?: Guti[][];
}

interface MovingGuti {
  readonly id: number;
  readonly side: Side;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Deterministic tokka: the shooter is flicked; any guti it (or a struck guti) touches
 * responds with an equal-mass elastic bounce under linear friction, and the first guti
 * the shooter itself touches is the hit. The mat's edge stops whatever slides into it.
 * Only IEEE-754-deterministic ops are used (+ - * / sqrt, no hypot/trig/random/Date)
 * so a client preview reproduces the server result exactly.
 */
export function simulateTokka(
  gutis: readonly Guti[],
  shooterId: number,
  flick: Flick,
  config: TokkaConfig,
): TokkaResult {
  const bodies: MovingGuti[] = gutis.map((g) => ({
    id: g.id,
    side: g.side,
    x: g.x,
    y: g.y,
    vx: 0,
    vy: 0,
  }));
  const shooter = bodies.find((b) => b.id === shooterId);
  if (shooter === undefined) throw new Error(`shooter ${shooterId} is not among the gutis`);

  const power = clampPower(flick.power, config.maxFlickPower);
  const length = Math.sqrt(flick.dx * flick.dx + flick.dy * flick.dy);
  if (length > 0) {
    shooter.vx = (flick.dx / length) * power;
    shooter.vy = (flick.dy / length) * power;
  }

  const frames: Guti[][] | undefined = config.recordFrames ? [snapshot(bodies)] : undefined;
  const maxSteps = Math.round(config.maxSimSeconds / config.dt);
  // maxFlickPower * dt must stay below this diameter or fast gutis could tunnel through each other.
  const diameter = config.gutiRadius * 2;
  let hitId: number | null = null;

  for (let step = 0; step < maxSteps; step++) {
    for (const body of bodies) {
      applyFriction(body, config.friction, config.dt);
      body.x += body.vx * config.dt;
      body.y += body.vy * config.dt;
      stopAtEdge(body, config);
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (a === undefined || b === undefined) continue;
        if (collide(a, b, diameter) && hitId === null) {
          if (a === shooter) hitId = b.id;
          else if (b === shooter) hitId = a.id;
        }
      }
    }

    frames?.push(snapshot(bodies));
    if (bodies.every((body) => speedOf(body) < config.restSpeed)) break;
  }

  const result: TokkaResult = { hitId, finalGutis: snapshot(bodies) };
  return frames === undefined ? result : { ...result, frames };
}

function speedOf(body: MovingGuti): number {
  return Math.sqrt(body.vx * body.vx + body.vy * body.vy);
}

/** Flick power as the sim uses it: never negative, never past maxFlickPower. */
function clampPower(power: number, maxFlickPower: number): number {
  return Math.min(Math.max(power, 0), maxFlickPower);
}

/** Constant deceleration opposing motion, clamped at zero so a guti never reverses. */
function applyFriction(body: MovingGuti, friction: number, dt: number): void {
  const speed = speedOf(body);
  if (speed === 0) return;
  const scale = Math.max(0, speed - friction * dt) / speed;
  body.vx *= scale;
  body.vy *= scale;
}

/** The mat's edge is a dead cushion: a guti sliding over it stops there, with no rebound. */
function stopAtEdge(body: MovingGuti, config: TokkaConfig): void {
  const r = config.gutiRadius;
  let stopped = false;
  if (body.x < r && body.vx < 0) {
    body.x = r;
    stopped = true;
  }
  if (body.x > config.fieldWidth - r && body.vx > 0) {
    body.x = config.fieldWidth - r;
    stopped = true;
  }
  if (body.y < r && body.vy < 0) {
    body.y = r;
    stopped = true;
  }
  if (body.y > config.fieldHeight - r && body.vy > 0) {
    body.y = config.fieldHeight - r;
    stopped = true;
  }
  if (stopped) {
    body.vx = 0;
    body.vy = 0;
  }
}

/** Resolves an overlapping, approaching pair (equal-mass elastic bounce + separation). */
function collide(a: MovingGuti, b: MovingGuti, diameter: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  if (distSq > diameter * diameter) return false;

  const dist = Math.sqrt(distSq);
  const nx = dist > 0 ? dx / dist : 1;
  const ny = dist > 0 ? dy / dist : 0;
  const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (approach >= 0) return false;

  a.vx += approach * nx;
  a.vy += approach * ny;
  b.vx -= approach * nx;
  b.vy -= approach * ny;

  const push = (diameter - dist) / 2;
  a.x -= push * nx;
  a.y -= push * ny;
  b.x += push * nx;
  b.y += push * ny;
  return true;
}

function snapshot(bodies: readonly MovingGuti[]): Guti[] {
  return bodies.map((b): Guti => ({ id: b.id, side: b.side, x: b.x, y: b.y }));
}
