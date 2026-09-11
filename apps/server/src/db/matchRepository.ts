import { eq } from "drizzle-orm";
import { matches } from "./schema.js";
import type { Database } from "./types.js";

export interface StartMatchInput {
  readonly mode: "friend" | "random" | "computer";
  readonly pot: number;
  readonly playerCount: number;
  readonly players: readonly string[];
  readonly seed: string;
}

export async function startMatch(db: Database, input: StartMatchInput): Promise<string> {
  const [row] = await db
    .insert(matches)
    .values({
      mode: input.mode,
      pot: input.pot,
      playerCount: input.playerCount,
      players: [...input.players],
      seed: input.seed,
    })
    .returning({ id: matches.id });
  if (row === undefined) throw new Error("failed to insert match row");
  return row.id;
}

export interface EndMatchInput {
  readonly matchId: string;
  readonly winnerId: string | null;
  readonly turnLog: unknown;
}

export async function endMatch(db: Database, input: EndMatchInput): Promise<void> {
  await db
    .update(matches)
    .set({ winnerId: input.winnerId, turnLog: input.turnLog, endedAt: new Date() })
    .where(eq(matches.id, input.matchId));
}
