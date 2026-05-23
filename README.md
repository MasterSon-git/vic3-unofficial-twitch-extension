# Victoria 3 Unofficial Twitch Extension

Monorepo for an unofficial Victoria 3 Twitch Extension.

The desktop uploader sends game-state snapshots to the Worker. The Worker validates snapshots and forwards accepted state through Twitch Extension PubSub. Twitch delivers broadcasts to viewers.

## Apps
- `apps/worker-ebs/` - Cloudflare Workers EBS: pairing, ingest validation, active streamer cap, Twitch PubSub broadcast.
- `apps/desktop/` - Windows .NET 8 uploader: watches Victoria 3 autosaves, parses state, sends `/ingest`.
- `apps/extension-panel/` - Twitch-hosted config/panel files. Viewer UI receives state through Twitch Extension PubSub and uses bundled/static UI resources.

## API Contract
- `spec/openapi.json` defines the API reference and contract.
- Generated code is not committed. Each app generates what it needs from the OpenAPI spec.
- The Worker generates TypeScript operation types with `npm run oas:gen`.

## Worker Endpoints
- `GET /health`
- `POST /pair/init`
- `POST /pair/complete`
- `POST /ingest`

## Quickstart

Prereqs: Node.js, npm, Cloudflare Wrangler, .NET 8 SDK.

```bash
npm install
dotnet tool restore

npm run typecheck --workspace apps/worker-ebs
dotnet build apps/desktop/src/Vic3Unofficial.Twitch.Desktop.csproj
```

Worker deployment:

```bash
cd apps/worker-ebs
npm run deploy
```

Set Worker secrets with Wrangler, never in committed files:

```bash
npx wrangler secret put EXT_SHARED_SECRET
```

## Public Repo Safety
- Twitch extension secrets, ingest tokens, `.dev.vars`, and local settings containing tokens stay out of version control.
- Worker secrets are configured through Cloudflare.

## License
Apache-2.0.
