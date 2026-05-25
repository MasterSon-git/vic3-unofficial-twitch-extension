import type { PubSubSnapshotMessage, Snapshot } from './openapi'

export function parsePubSubSnapshot(rawMessage: string): Snapshot | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawMessage)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const message = parsed as Partial<PubSubSnapshotMessage>
  if (message.type !== 'vic3:snapshot' || !isRecord(message.payload)) return null
  if (!Array.isArray(message.payload.countries)) return null
  if (typeof message.payload.channelId !== 'string') return null
  if (typeof message.payload.saveHash !== 'string') return null
  if (typeof message.payload.seq !== 'number') return null
  return message.payload as Snapshot
}

export function sortCountriesForLedger(snapshot: Snapshot) {
  return [...snapshot.countries].sort((a, b) => {
    const scoreA = a.score ?? Number.MAX_SAFE_INTEGER
    const scoreB = b.score ?? Number.MAX_SAFE_INTEGER
    if (scoreA !== scoreB) return scoreA - scoreB
    const prestigeA = a.prestige ?? Number.NEGATIVE_INFINITY
    const prestigeB = b.prestige ?? Number.NEGATIVE_INFINITY
    if (prestigeA !== prestigeB) return prestigeB - prestigeA
    return a.tag.localeCompare(b.tag, 'en')
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
