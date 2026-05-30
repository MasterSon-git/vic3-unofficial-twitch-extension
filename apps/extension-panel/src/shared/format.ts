export function formatInteger(value: number | null | undefined, locale?: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

export function formatCompact(value: number | null | undefined, locale?: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatDecimal(value: number | null | undefined, locale?: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatLedgerRank(score: number | null | undefined, fallbackIndex: number) {
  return String(score ?? fallbackIndex + 1)
}

export function formatTime(value: string | number | null | undefined, locale?: string) {
  if (!value) return ''
  const date = new Date(typeof value === 'number' ? value * 1000 : value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}
