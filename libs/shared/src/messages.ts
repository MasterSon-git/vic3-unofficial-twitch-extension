import { z } from "zod";
import { SnapshotSchema } from "./schema/snapshot";

/** Einziger erlaubter Broadcast: Snapshot */
export const BroadcastMessageSchema = z.object({
  type: z.literal("vic3:snapshot"),
  payload: SnapshotSchema,
});

export type BroadcastMessage = z.infer<typeof BroadcastMessageSchema>;