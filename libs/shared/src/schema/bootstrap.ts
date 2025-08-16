import { z } from "zod";

export const BootstrapSchema = z.object({
  version: z.literal("v1"),
  countriesByTag: z.record(z.string().min(2).max(4), z.string()),
  flagsByTag: z.record(z.string().min(2).max(4), z.string().url()).optional(),
  marketsById: z.record(z.string(), z.string()),
  eTag: z.string().min(1).optional(),
});

export type Bootstrap = z.infer<typeof BootstrapSchema>;