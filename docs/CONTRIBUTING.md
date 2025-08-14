
---

# `apps/worker-ebs/README.md`

```md
# Victoria 3 – Twitch EBS (Cloudflare Workers)

Serverless **Extension Backend Service** for pairing, ingest, PubSub broadcast, bootstrap dictionaries, and rate limiting.

## Endpoints
- `POST /pair/init?channelId=<id>` – Broadcaster generates 6-char code (validates Twitch JWT).
- `POST /pair/complete` – Desktop exchanges `{ code }` for `{ ingestToken, channelId }`.
- `POST /ingest` – Desktop sends validated snapshot (later broadcasted ≤ **5 KB**).
- `GET  /last/:channelId` – Viewer fetches last snapshot (token-bucket throttled).
- `PUT  /bootstrap` – Desktop uploads dictionaries (names/flags/markets) with ETag.
- `GET  /bootstrap/:channelId` – Viewer fetches dictionaries (ETag/304 caching).
- `GET  /health` – Health probe.

## Policies
- **Active streamer cap**: `MAX_ACTIVE_CHANNELS` (default 100).
- **Ingest**: ≥ `INGEST_BASE_INTERVAL_MS` (default 5 min) unless `save_hash` changed; bounded by `INGEST_MIN_INTERVAL_MS` (default 10 s). Reject **non-increasing** `seq`.
- **Viewer GETs**: token bucket per **IP+channel** (default 6 tokens, refill 1/6s). Optional Origin enforcement for `*.ext-twitch.tv`.
- **Payloads**: broadcast message must be **string ≤ 5 KB** → use bootstrap mappings.

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
