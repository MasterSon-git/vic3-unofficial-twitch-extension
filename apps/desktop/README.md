# Victoria 3 – Desktop Uploader (.NET 8 WPF)

Windows tray app that watches **Victoria 3 autosaves**, parses the save, and pushes:
- **/bootstrap** dictionaries at startup or when mappings change.
- **/ingest** snapshots **only** every **5 minutes** and **only** on **new autosave** (`save_hash` changed).

## User flow
1. Start the app → **Enter pairing code** (from Extension Config view) → receive `ingestToken`.
2. App auto-detects autosave folder (can be changed in **Settings**).
3. App sends data according to policy; status visible in tray tooltip/window.
