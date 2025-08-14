# Victoria 3 – unofficial Twitch Extension Monorepo

A production-focused monorepo for a **Twitch Extension** that lets viewers explore live **Victoria 3** country data (treasury, GDP, tech, armies, markets, construction, …) independently of the streamer.

## Apps
- `apps/worker-ebs/` – Cloudflare Workers **EBS** (Extension Backend Service): pairing, ingest, PubSub, **bootstrap dictionaries** (names/flags/markets), active streamer cap.
- `apps/desktop/` – Windows **.NET 8** tray app (skeleton): autosave watcher → parse → push `/bootstrap` + `/ingest`.
- `apps/extension-panel/` – Twitch **Panel/Overlay** (skeleton, React + Vite): **PubSub-only** UI + `/bootstrap` fetch for dictionaries.

## Packages
- `packages/shared/` – Shared TypeScript schemas & message types (Zod) used by Worker and (later) the Frontend.

## Features
- Streamer-friendly pairing (**6-char code**).
- **Active streamer cap** (default 100).
- **Strict ingest policy**: update **only every ≥ 5 minutes** **and** only when **`save_hash` changed** (new autosave). Strictly increasing `seq`.
- Viewers are **PubSub-only** (no last-state HTTP endpoint). On first load, show “Waiting for next update…”. Use `/bootstrap` (ETag) to resolve labels/flags/markets.
- **Compact payloads** (< **5 KB**) via `bootstrap` dictionaries + numeric/ID-based snapshots.
- **Serverless** EBS on Cloudflare Workers + KV.

## Quickstart

**Prereqs**: Node 18+, npm, Cloudflare Wrangler, .NET 8 SDK.

```bash
# clone
git clone <this-repo>.git
cd vic3-unofficial-twitch-extension

# JS deps (workspaces)
npm i

# Worker: configure KV & secrets, then deploy
cd apps/worker-ebs
npx wrangler login
# create KV namespace, set IDs in wrangler.toml
npx wrangler secret put EXT_SHARED_SECRET     # Base64 from Twitch (Extensions → Secrets)
# optional: pairing guard
npx wrangler secret put INGEST_PAIR_SECRET
npm run deploy

# Panel (skeleton)
cd ../../apps/extension-panel
npm i
npm run build
# upload dist ZIP to Twitch Dev Console (Hosted Test → Release)

# Desktop (.NET skeleton)
cd ../../apps/desktop
dotnet restore
dotnet build -c Release
```

## Secrets & Safety
- **Never** commit secrets. Use `wrangler secret put …` for Worker.
- Twitch hosts your **frontend assets**; EBS handles **data & PubSub** only.
- No Extension secrets in the desktop app.

## License
Use a permissive license. Recommended: **Apache-2.0** (explicit patent grant). Alternatively **MIT**. Add a `LICENSE` file and set `"license"` in `package.json`.

## Contributing
Read `docs/CONTRIBUTING.md` (coding style, commit messages, DCO/Sign-off).
