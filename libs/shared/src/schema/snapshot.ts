import { z } from "zod";

/** Country entry is compact: use tags/ids; names/flags live in Bootstrap */
export const CountryZ = z.object({
  tag: z.string().min(2).max(4),              // e.g. "PRU"
  treasury: z.number().int().optional(),      // in pounds
  gdp: z.number().optional(),
  market: z.string().optional()               // ETag/ID to bootstrap market
});

/** Snapshot pushed by desktop; broadcast must stay <= 5KB stringified */
export const SnapshotZ = z.object({
  channelId: z.string().min(1),
  saveHash: z.string().min(1),
  seq: z.number().int().nonnegative(),
  countries: z.array(CountryZ).max(300),
  updatedAt: z.string().datetime().optional()
});

export type Snapshot = z.infer<typeof SnapshotZ>;
export type Country  = z.infer<typeof CountryZ>;
