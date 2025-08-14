# API

## Conventions
- JSON everywhere. `Content-Type: application/json`.
- Errors: `{ "error": "string", "details"?: any }`.

## POST /pair/init?channelId=<id>
Auth: `Authorization: Bearer <Twitch Extension JWT>` (role=`broadcaster`/`admin`), HS256 with `EXT_SHARED_SECRET`.
Resp: `200 { "code": "ABC123", "expiresIn": 600 }`
Errors: `400 channelId_missing|channel_mismatch`, `401 invalid_twitch_jwt`, `403 active_streamers_limit_reached|forbidden`

## POST /pair/complete
Body: `{ "code": "ABC123" }`
Resp: `200 { "channelId": "141981764", "ingestToken": "<uuid>", "expiresIn": 604800 }`
Errors: `400 code_missing|invalid_or_expired_code`

## POST /ingest
Headers: `x-ingest-token: <token>`
Body: `Snapshot`
Policies:
- `seq` strictly increasing (else `409 stale_sequence`).
- **Requires new autosave** (`save_hash` changed vs last accepted) **AND** at least **5 minutes** since the last accepted update:
  - same save_hash → `409 needs_new_autosave`
  - < 5 minutes → `429 too_soon` with `{ "retryInMs": number }`
- Broadcast message ≤ **5 KB** (`413 payload_too_large`).
Resp: `200 { "status": "ok" }`
Errors: `401 missing_ingest_token|invalid_ingest_token`, `400 channel_mismatch`, `409 needs_new_autosave|stale_sequence`, `429 too_soon`, `502 pubsub_failed`

## PUT /bootstrap
Headers: `x-ingest-token: <token>`
Body: `Bootstrap` with `"version"` (used as ETag)
Resp: `204` with `ETag: W/"<version>"`
Errors: `401 missing_ingest_token|invalid_ingest_token`, `413 if too large`

## GET /bootstrap/:channelId
Resp: `200 <Bootstrap>` with `ETag` + `Cache-Control: public, max-age=86400`, or `304` if `If-None-Match` matches.
Errors: `404 not_found`

## GET /health
Resp: `200 ok`
