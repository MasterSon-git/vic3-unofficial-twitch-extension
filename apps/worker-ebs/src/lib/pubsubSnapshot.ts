import type { RequestBodyJson } from './types'

type Snapshot = RequestBodyJson<'ingestSnapshot'>

export function buildPubSubSnapshotMessage(snapshot: Snapshot) {
  return JSON.stringify({
    t: 'vic3:snapshot',
    v: 1,
    p: {
      q: snapshot.q,
      d: snapshot.d,
      u: snapshot.u,
      c: snapshot.c,
    },
  })
}
