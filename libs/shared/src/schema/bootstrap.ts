import { z } from "zod";

/** Bootstrap dictionaries with ETag for caching; no flags in snapshot */
export const BootstrapZ = z.object({
  version: z.literal("v1"),
  countriesByTag: z.record(z.string().min(2).max(4), z.string()),     // "PRU": "Prussia"
  flagsByTag: z.record(z.string().min(2).max(4), z.string().url()).optional(), // optional CDN urls
  marketsById: z.record(z.string(), z.string()),                      // "german_market": "German Market"
  eTag: z.string().min(1).optional()                                  // server may set
});

export type Bootstrap = z.infer<typeof BootstrapZ>;
