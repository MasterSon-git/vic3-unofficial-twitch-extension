# Architecture

## Components
- **Desktop**: watches autosaves → parses → pushes `/bootstrap` + `/ingest`.
- **EBS (Worker)**: validates, rate-limits, stores meta, broadcasts via **Extensions PubSub**.
- **Panel/Overlay**: Twitch-hosted iFrame → subscribes to PubSub; fetches **bootstrap** only.

## Data Flow (high level)
1) Broadcaster (Config View) → `POST /pair/init` → 6-char code.
2) Desktop → `POST /pair/complete` → `{ ingestToken, channelId }`.
3) Desktop → `PUT /bootstrap` once (names, flags, markets) → ETag.
4) Desktop → `POST /ingest` **every ≥ 5 minutes** and only when `save_hash` **changed** (new autosave).
5) EBS stores meta and **broadcasts** `{ type: "vic3:snapshot", payload }` (≤ 5 KB string).
6) Panel receives broadcasts; on reload it **waits for next broadcast** (bootstrap is ETag-cached).

## Security
- No secrets in desktop/frontend.
- `/pair/init` validates Twitch Extension JWT (HS256 with Extension Secret).
- EBS signs EBS-JWT (`role=external`) for PubSub.
- Secrets set via `wrangler secret put`.

## Size strategy
- Snapshots: numeric/ID-only; names/flags/markets in **bootstrap** (ETag cached).
- Enforce 5 KB message cap; reject larger payloads.
