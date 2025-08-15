import { z } from "zod";

// Tight primitives
const Tag = z.string().regex(/^[A-Z]{2,3}$/);
const SafeInt = z.number().int().min(0).max(2_147_483_647);
const SafeNum = z.number().min(0).max(Number.MAX_SAFE_INTEGER);

// Country payload in snapshots: NO display "name", NO "flag", NO free-text "market".
// Frontend resolves these via /bootstrap dictionaries.
export const CountrySchema = z.object({
  tag: Tag,
  prestige: SafeInt.optional(),
  gdp: SafeNum.optional(),
  treasury: SafeNum.optional(),
  debt: SafeNum.optional(),
  population: SafeInt.optional(),

  // Reference to bootstrap mapping:
  // e.g., "german_market" -> resolved name in bootstrap.marketsById
  marketId: z.string().min(1).max(64).optional(),

  military: z
    .object({
      battalions: SafeInt.optional(),
      flotillas: SafeInt.optional(),
      power: SafeNum.optional(),
    })
    .partial()
    .optional(),

  tech: z
    .object({
      tier: SafeInt.max(10).optional(),
      unlocked: z.array(z.string().min(1).max(64)).max(256).optional(),
    })
    .partial()
    .optional(),

  construction: z
    .object({
      sectors: SafeInt.max(10000).optional(),
      throughput: SafeNum.optional(),
    })
    .partial()
    .optional(),
});

export const SnapshotSchema = z.object({
  // Twitch numeric id
  channelId: z.string().regex(/^[0-9]+$/),

  session: z.string().max(64).optional(),
  gameDate: z.string().max(32).optional(),

  // Identify autosave generation (change whenever a new autosave appears)
  save_hash: z.string().regex(/^[A-Za-z0-9_.-]{6,64}$/),

  // Monotonic sequence per channel (strictly increasing)
  seq: SafeInt,

  countries: z.array(CountrySchema).max(500),

  updatedAt: z.string().optional(),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

// One-time/rare mappings, versioned via ETag.
export const BootstrapSchema = z.object({
  // Global ETag/version for this bootstrap payload
  version: z.string().min(1),

  // Country display names by tag: { "PRU": "Preußen", ... }
  countriesByTag: z.record(z.string().min(1).max(128)),

  // Flags by tag (URL or small data URI). Recommend CDN URLs.
  // Example: { "PRU": "https://cdn.example/flags/PRU.png" }
  flagsByTag: z.record(z.string().min(1).max(512)),

  // Markets: { "german_market": "German Market", ... }
  marketsById: z.record(z.string().min(1).max(128)),
});

export type Bootstrap = z.infer<typeof BootstrapSchema>;
