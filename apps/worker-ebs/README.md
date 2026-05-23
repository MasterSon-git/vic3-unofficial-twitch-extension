# Worker EBS

Cloudflare Worker Extension Backend Service for pairing, ingest validation, and Twitch Extension PubSub broadcast.

## Scripts

```bash
npm run oas:gen
npm run typecheck
npm run dev
npm run deploy
```

`oas:gen` generates TypeScript operation types and Worker route metadata from `../../spec/openapi.json`. Generated files are not committed.

JSON request bodies are defined as named schemas under `components.schemas` and referenced from operations with `$ref`.

## Endpoints
- `GET /health`
- `POST /pair/init`
- `POST /pair/status`
- `POST /pair/complete`
- `POST /pair/revoke`
- `POST /pair/revoke/channel`
- `POST /ingest`

Viewers receive state through Twitch Extension PubSub.

## Runtime
- Hono handles routing.
- AJV validates request bodies against schemas from the OpenAPI spec.
- Handler coverage is checked at TypeScript build time through generated OpenAPI operation types.
- Pairing codes allow three failed completion attempts.
- Completed pairings live for 30 days.
- Active channel slots are leased for 24 hours. Reserved channel IDs can displace the oldest non-reserved active channel, but still count toward the active channel limit.

## Secrets

Set secrets through Wrangler:

```bash
npx wrangler secret put EXT_SHARED_SECRET
```

Secrets are configured through Cloudflare, not `wrangler.toml`.
