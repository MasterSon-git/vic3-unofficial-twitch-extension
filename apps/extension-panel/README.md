# Extension Panel

Twitch-hosted extension assets.

Build outputs:

- `config.html` - broadcaster pairing configuration.
- `video_overlay.html` - viewer video overlay fed only by Twitch Extension PubSub.

The config view calls the Worker for broadcaster pairing. Viewer state arrives through Twitch Extension PubSub and does not call the Worker.

UI resources such as country names, labels, flags, and later Victoria 3 UI skins are bundled with the extension assets.

```bash
npm run build --workspace apps/extension-panel
```

Serve `apps/extension-panel/dist` as the Twitch local test asset root.
