# Desktop Uploader

Windows .NET 8 WPF uploader for Victoria 3 autosaves.

The app pairs with the Worker, stores an ingest token locally, watches autosaves, parses the current game state, and sends `/ingest` snapshots.

UI resources such as names and flags belong in the Twitch Extension panel.

The EBS API client is generated from `../../spec/openapi.json` during build with NSwag.

## Build

```bash
dotnet tool restore
dotnet build src/Vic3Unofficial.Twitch.Desktop.csproj
```
