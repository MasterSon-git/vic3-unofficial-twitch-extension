export type Env = {
  EXT_CLIENT_ID: string;
  EXT_OWNER_USER_ID: string;
  EXT_SHARED_SECRET: string;

  MAX_ACTIVE_CHANNELS: string | number;
  INGEST_BASE_INTERVAL_MS: string | number;
};

export type Bindings = Env & {
  KV: KVNamespace;
  INGEST_PAIR_SECRET?: string;
};
