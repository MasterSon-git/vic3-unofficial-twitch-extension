# Victoria 3 – unofficial Twitch EBS (Cloudflare Workers)

Serverless **Extension Backend Service** for pairing, ingest, PubSub broadcast, bootstrap dictionaries, and rate limiting.

## Endpoints
- `POST /pair/init?channelId=<id>` – Broadcaster generates 6-char code (validates Twitch JWT).
- `POST /pair/complete` – Desktop exchanges `{ code }` for `{ ingestToken, channelId }`.
- `POST /ingest` – Desktop sends validated snapshot (broadcasted later; must be ≤ **5 KB**).
- `PUT  /bootstrap` – Desktop uploads dictionaries (names/flags/markets) with ETag.
- `GET  /bootstrap/:channelId` – Viewer fetches dictionaries (ETag/304 caching).
- `GET  /health` – Health probe.

## Policies
- **Active streamer cap**: `MAX_ACTIVE_CHANNELS` (default 100).
- **Ingest (strict)**: requires **new autosave** (`save_hash` changed) **AND** at least **5 minutes** since the last accepted update. Reject **non-increasing** `seq`. Enforce PubSub payload ≤ **5 KB**.
- **Viewers**: PubSub-only (no `/last` endpoint). On initial load, the panel waits for the next broadcast.

## Config
- `wrangler.toml`: KV binding, env vars.
- Secrets via `wrangler secret put`:
  - `EXT_SHARED_SECRET` (Base64; Twitch → Extensions → Secrets)
  - optional `INGEST_PAIR_SECRET`

## Deploy
```bash
cd apps/worker-ebs
npm i
npx wrangler login
# set KV ids in wrangler.toml
npx wrangler secret put EXT_SHARED_SECRET
npm run deploy
```

## Smoke test
See `docs/API.md` for curl examples.
