# @vic3-unofficial-twitch/shared

Shared schemas and message types for worker-ebs, desktop, and extension-panel.

## Usage

```ts
import { SnapshotZ, BootstrapZ, isSnapshotMessage, type Vic3Broadcast } from "@vic3-unofficial-twitch/shared";

// Validate a snapshot payload
const parsed = SnapshotZ.parse(payload);

// Check a received broadcast
function onBroadcast(msg: Vic3Broadcast) {
  if (isSnapshotMessage(msg)) {
    // msg.payload is a validated Snapshot
  }
}
```
