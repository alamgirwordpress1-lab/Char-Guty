import { GUTI_COUNT } from "@char-guty/game-core";
import { z } from "zod";
import { playerCountSchema, potSchema } from "./match.js";

const gutiIdSchema = z
  .number()
  .int()
  .min(0)
  .max(GUTI_COUNT - 1);

// ---- Room join options: client -> server, passed to joinOrCreate/create/joinById ----
// (Colyseus validates these in onAuth/onCreate; there's no separate "JOIN" room message —
// joining a room *is* the connection handshake.)

export const roomModeSchema = z.enum(["friend", "random"]);

export const joinOptionsSchema = z
  .object({
    /** Guest JWT (from POST /auth/guest) or a real Firebase ID token. */
    token: z.string().min(1),
    nickname: z.string().min(1).max(20),
    mode: roomModeSchema,
    /** Seat count; always required so the room knows its capacity upfront. */
    playerCount: playerCountSchema,
    /** Required for random matchmaking (used in filterBy); friend hosts may defer via PICK_POT. */
    pot: potSchema.optional(),
  })
  .refine((o) => o.mode !== "random" || o.pot !== undefined, {
    message: "pot is required for random matchmaking",
  });

export type JoinOptions = z.infer<typeof joinOptionsSchema>;

// ---- In-room client -> server action payloads (room.onMessage(type, ...)) ----
// Colyseus routes by the message `type` string itself, so payloads below carry no
// redundant "type" field - onMessage("PICK_POT", ...) etc. is the discriminant.

export const flickSchema = z.object({
  dx: z.number().finite(),
  dy: z.number().finite(),
  power: z.number().finite().min(0),
});

export const pickPotPayloadSchema = z.object({
  pot: potSchema,
});

export const tokkaPayloadSchema = z.object({
  shooterId: gutiIdSchema,
  targetId: gutiIdSchema,
  flick: flickSchema,
});

export type Flick = z.infer<typeof flickSchema>;
export type PickPotPayload = z.infer<typeof pickPotPayloadSchema>;
export type TokkaPayload = z.infer<typeof tokkaPayloadSchema>;

// ---- Server -> client broadcast payloads (room.broadcast(type, ...)) ----
// Mirrors of game-core's Guti/MatchState/MatchEvent shapes, for client-side typing
// and optional runtime validation. The server itself broadcasts its trusted
// game-core output directly rather than re-validating its own data.

export const gutiSchema = z.object({
  id: z.number().int(),
  side: z.enum(["F", "R"]),
  x: z.number(),
  y: z.number(),
});

const throwOutcomeSchema = z.enum(["four", "tokka", "instantWin"]);

export const throwResultSchema = z.object({
  gutis: z.array(gutiSchema),
  flatCount: z.number().int(),
  outcome: throwOutcomeSchema,
  points: z.number().int(),
  requiredTokkas: z.number().int(),
});

export const matchEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("THROW"), player: z.string(), result: throwResultSchema }),
  z.object({
    type: z.literal("TOKKA"),
    player: z.string(),
    shooterId: z.number().int(),
    targetId: z.number().int(),
    hit: z.boolean(),
  }),
  z.object({
    type: z.literal("SCORE"),
    player: z.string(),
    points: z.number(),
    total: z.number(),
  }),
  z.object({
    type: z.literal("DIE"),
    player: z.string(),
    reason: z.enum(["TOKKA_MISS", "TIMEOUT"]),
  }),
  z.object({
    type: z.literal("WIN"),
    player: z.string(),
    reason: z.enum(["ZERO_FLAT", "REACHED_POT"]),
  }),
  z.object({ type: z.literal("TURN"), player: z.string() }),
]);

const tokkaRecordSchema = z.object({
  shooterId: z.number().int(),
  targetId: z.number().int(),
  hit: z.boolean(),
});

const turnInProgressSchema = z.object({
  player: z.string(),
  outcome: throwOutcomeSchema.nullable(),
  flatCount: z.number().int().nullable(),
  points: z.number(),
  tokkas: z.array(tokkaRecordSchema),
});

export const turnRecordSchema = turnInProgressSchema.extend({
  end: z.enum(["SCORED", "DIE", "TIMEOUT", "WIN"]),
});

export const matchStateSchema = z.object({
  players: z.array(z.string()),
  pot: z.number(),
  stake: z.number(),
  phase: z.enum(["THROW", "TOKKA", "ENDED"]),
  currentPlayer: z.string(),
  scores: z.record(z.string(), z.number()),
  gutis: z.array(gutiSchema),
  pendingTokkas: z.array(z.tuple([z.number().int(), z.number().int()])),
  tokkasLeft: z.number().int(),
  turn: turnInProgressSchema.nullable(),
  turnLog: z.array(turnRecordSchema),
  winner: z.string().nullable(),
});

/** Broadcast alongside "state" whenever a tokka is resolved, for client-side replay. */
export const tokkaFramesSchema = z.array(z.array(gutiSchema));

export const errorPayloadSchema = z.object({ message: z.string() });

export type MatchEventMsg = z.infer<typeof matchEventSchema>;
export type MatchStateMsg = z.infer<typeof matchStateSchema>;
export type TokkaFramesMsg = z.infer<typeof tokkaFramesSchema>;
