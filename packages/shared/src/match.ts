import { z } from "zod";

export const potSchema = z.union([
  z.literal(100),
  z.literal(200),
  z.literal(300),
  z.literal(400),
  z.literal(500),
]);

export const playerCountSchema = z.number().int().min(2).max(4);

export const matchSetupSchema = z.object({
  pot: potSchema,
  playerCount: playerCountSchema,
});

export type Pot = z.infer<typeof potSchema>;
export type MatchSetup = z.infer<typeof matchSetupSchema>;
