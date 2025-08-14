# Victoria 3 – Twitch Panel/Overlay (React + Vite)

Twitch-hosted frontend that listens to **PubSub** and fetches **only** `/bootstrap` (with ETag) on load.  
There is **no last-state HTTP fallback**. On first load, display “Waiting for next update…”.

## Dev
```bash
npm i
npm run dev
```

## Build & Upload
```bash
npm run build
# zip the dist/ per Twitch requirements and upload in Developer Console (Hosted Test → Release)
```
