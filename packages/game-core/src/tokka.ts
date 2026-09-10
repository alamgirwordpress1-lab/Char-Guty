import type { Vec2 } from "./types.js";

export interface GutiPosition {
  readonly id: number;
  readonly position: Vec2;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Pairs of guti ids within tokkaRadius of each other (server picks tokka targets from this). */
export function eligibleTokkaPairs(
  gutis: readonly GutiPosition[],
  tokkaRadius: number,
): Array<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = [];
  for (let i = 0; i < gutis.length; i++) {
    for (let j = i + 1; j < gutis.length; j++) {
      const a = gutis[i];
      const b = gutis[j];
      if (a === undefined || b === undefined) continue;
      if (distance(a.position, b.position) <= tokkaRadius) {
        pairs.push([a.id, b.id]);
      }
    }
  }
  return pairs;
}
