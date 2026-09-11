import { DEFAULT_CONFIG } from "@char-guty/game-core";
import type { Guti, Rng } from "@char-guty/game-core";
import type { TokkaPayload } from "@char-guty/shared";

/** Radians either side of dead-on that a computer player aims; the flick then strays like anyone's. */
export const COMPUTER_AIM_ERROR = 0.12;
/** Speed over the bare minimum needed to reach the target, so a flick doesn't stop short. */
const POWER_MARGIN = 1.3;

/**
 * A computer player's tokka, played the way a person would: take the two gutis lying
 * closest together and flick one at the other, hard enough to get there (v^2 = 2ad
 * under constant friction), with a random aim error so it can still miss.
 */
export function chooseComputerTokka(gutis: readonly Guti[], rng: Rng): TokkaPayload {
  let best: { shooter: Guti; target: Guti; distance: number } | undefined;
  for (const shooter of gutis) {
    for (const target of gutis) {
      if (target === shooter) continue;
      const distance = Math.hypot(target.x - shooter.x, target.y - shooter.y);
      if (best === undefined || distance < best.distance) best = { shooter, target, distance };
    }
  }
  if (best === undefined) throw new Error("a tokka needs at least two gutis");

  const { shooter, target, distance } = best;
  const aim = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  const angle = aim + (rng.next() * 2 - 1) * COMPUTER_AIM_ERROR;
  const power = Math.sqrt(2 * DEFAULT_CONFIG.friction * distance) * POWER_MARGIN;
  return { shooterId: shooter.id, flick: { dx: Math.cos(angle), dy: Math.sin(angle), power } };
}
