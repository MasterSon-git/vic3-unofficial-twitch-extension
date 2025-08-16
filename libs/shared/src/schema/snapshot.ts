import { z } from "zod";

export const CountrySchema = z.object({
  tag: z.string().min(2).max(4),
  treasury: z.number().optional(),
  gdp: z.number().optional(),
  market: z.string().optional(),
});

export const SnapshotSchema = z.object({
  channelId: z.string().min(1),
  saveHash: z.string().min(1),
  seq: z.number().min(0),
  countries: z.array(CountrySchema).max(300),
  updatedAt: z.string().datetime().optional(),
});

export type Country = z.infer<typeof CountrySchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;