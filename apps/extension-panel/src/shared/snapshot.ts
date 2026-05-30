import type { PubSubSnapshotMessage, Snapshot } from './openapi'

type SnapshotCountry = Snapshot['c'][number]

export type LedgerSortKey = 'rank' | 'country' | 'prestige' | 'gdp' | 'sol' | 'population'
export type LedgerSortDirection = 'asc' | 'desc'

export type LedgerSort = {
  key: LedgerSortKey
  direction: LedgerSortDirection
}

export function parsePubSubSnapshot(rawMessage: string): Snapshot | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawMessage)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const message = parsed as Partial<PubSubSnapshotMessage>
  if (message.t !== 'vic3:snapshot' || !isRecord(message.p)) return null
  if (!Array.isArray(message.p.c)) return null
  if (typeof message.p.q !== 'number') return null
  return message.p as Snapshot
}

export function sortCountriesForLedger(snapshot: Snapshot) {
  return sortCountries(snapshot, { key: 'rank', direction: 'asc' })
}

export function sortCountries(snapshot: Snapshot, sort: LedgerSort) {
  return [...snapshot.c].sort((a, b) => {
    const direction = sort.direction === 'asc' ? 1 : -1
    const primary = compareBySortKey(a, b, sort.key)
    if (primary !== 0) return primary * direction

    const scoreA = a.s ?? Number.MAX_SAFE_INTEGER
    const scoreB = b.s ?? Number.MAX_SAFE_INTEGER
    if (scoreA !== scoreB) return scoreA - scoreB
    const prestigeA = a.p ?? Number.NEGATIVE_INFINITY
    const prestigeB = b.p ?? Number.NEGATIVE_INFINITY
    if (prestigeA !== prestigeB) return prestigeB - prestigeA
    return a.t.localeCompare(b.t, 'en')
  })
}

function compareBySortKey(a: SnapshotCountry, b: SnapshotCountry, key: LedgerSortKey) {
  if (key === 'country') return a.t.localeCompare(b.t, 'en')
  if (key === 'rank') return compareNumber(a.s, b.s, true)
  const fieldByKey = {
    prestige: 'p',
    gdp: 'g',
    sol: 'l',
    population: 'o',
  } as const
  return compareNumber(a[fieldByKey[key]], b[fieldByKey[key]], false)
}

function compareNumber(a: number | null | undefined, b: number | null | undefined, missingLastOnAsc: boolean) {
  const aMissing = a === null || a === undefined || !Number.isFinite(a)
  const bMissing = b === null || b === undefined || !Number.isFinite(b)
  if (aMissing && bMissing) return 0
  if (aMissing) return missingLastOnAsc ? 1 : -1
  if (bMissing) return missingLastOnAsc ? -1 : 1
  return a - b
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
