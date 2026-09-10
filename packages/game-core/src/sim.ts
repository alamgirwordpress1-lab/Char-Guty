import type { Vec2 } from "./types.js";

export interface Body {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
}

export function speedOf(velocity: Vec2): number {
  return Math.hypot(velocity.x, velocity.y);
}

/** Constant deceleration opposing motion (Coulomb-style friction), clamped at zero speed. */
export function applyFriction(velocity: Vec2, friction: number, dt: number): Vec2 {
  const speed = speedOf(velocity);
  if (speed === 0) return velocity;
  const nextSpeed = Math.max(0, speed - friction * dt);
  const scale = nextSpeed / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}

export function stepBody(body: Body, friction: number, dt: number): Body {
  const velocity = applyFriction(body.velocity, friction, dt);
  const position: Vec2 = {
    x: body.position.x + velocity.x * dt,
    y: body.position.y + velocity.y * dt,
  };
  return { position, velocity, radius: body.radius };
}

export function circlesOverlap(a: Body, b: Body): boolean {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const radiusSum = a.radius + b.radius;
  return dx * dx + dy * dy <= radiusSum * radiusSum;
}
