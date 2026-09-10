import { GUTI_COUNT } from "@char-guty/game-core";
import { z } from "zod";

export const vec2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

/** Anti-cheat bound: server rejects any flick claiming more speed than this. */
export const MAX_FLICK_SPEED = 600;

export const throwRequestSchema = z.object({
  type: z.literal("throw"),
});

export const flickRequestSchema = z.object({
  type: z.literal("flick"),
  targetGutiId: z
    .number()
    .int()
    .min(0)
    .max(GUTI_COUNT - 1),
  velocity: vec2Schema.refine((v) => Math.hypot(v.x, v.y) <= MAX_FLICK_SPEED, {
    message: `velocity magnitude must not exceed ${MAX_FLICK_SPEED}`,
  }),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  throwRequestSchema,
  flickRequestSchema,
]);

export type ThrowRequest = z.infer<typeof throwRequestSchema>;
export type FlickRequest = z.infer<typeof flickRequestSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
