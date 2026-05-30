export type SupportedLocale = 'en' | 'de'

type TranslationKey =
  | 'appName'
  | 'waitingTitle'
  | 'waitingStatus'
  | 'waitingMessage'
  | 'invalidTitle'
  | 'invalidStatus'
  | 'openLedger'
  | 'openLedgerWaiting'
  | 'closeLedger'
  | 'backToLedger'
  | 'ledgerTitle'
  | 'updated'
  | 'sequence'
  | 'noCountries'
  | 'rank'
  | 'country'
  | 'prestige'
  | 'gdp'
  | 'sol'
  | 'population'
  | 'treasury'
  | 'powerRank'
  | 'market'
  | 'notAvailable'

const translations: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: {
    appName: 'Unofficial Victoria 3 Overlay',
    waitingTitle: 'Waiting for game state',
    waitingStatus: 'No snapshot received yet.',
    waitingMessage: 'Waiting for the desktop uploader to broadcast the first Victoria 3 snapshot.',
    invalidTitle: 'Unsupported message',
    invalidStatus: 'PubSub data ignored.',
    openLedger: 'Open country ledger',
    openLedgerWaiting: 'Open country ledger, waiting for game state',
    closeLedger: 'Close ledger',
    backToLedger: 'Back to ledger',
    ledgerTitle: 'Countries - At Peace Ledger',
    updated: 'Updated',
    sequence: 'Sequence',
    noCountries: 'No countries in the current snapshot.',
    rank: 'Rank',
    country: 'Country',
    prestige: 'Prestige',
    gdp: 'GDP',
    sol: 'SoL',
    population: 'Population',
    treasury: 'Treasury',
    powerRank: 'Power rank',
    market: 'Market',
    notAvailable: '-',
  },
  de: {
    appName: 'Inoffizielles Victoria 3 Overlay',
    waitingTitle: 'Warte auf Spielstand',
    waitingStatus: 'Noch kein Snapshot empfangen.',
    waitingMessage: 'Warte darauf, dass der Desktop-Uploader den ersten Victoria-3-Snapshot sendet.',
    invalidTitle: 'Nicht unterstützte Nachricht',
    invalidStatus: 'PubSub-Daten ignoriert.',
    openLedger: 'Länder-Ledger öffnen',
    openLedgerWaiting: 'Länder-Ledger öffnen, warte auf Spielstand',
    closeLedger: 'Ledger schließen',
    backToLedger: 'Zurück zum Ledger',
    ledgerTitle: 'Länder - Friedens-Ledger',
    updated: 'Aktualisiert',
    sequence: 'Sequenz',
    noCountries: 'Keine Länder im aktuellen Snapshot.',
    rank: 'Rang',
    country: 'Land',
    prestige: 'Prestige',
    gdp: 'BIP',
    sol: 'SoL',
    population: 'Bevölkerung',
    treasury: 'Staatskasse',
    powerRank: 'Machtrang',
    market: 'Markt',
    notAvailable: '-',
  },
}

export function resolveLocale(value: string | null | undefined): SupportedLocale {
  const normalized = value?.toLowerCase() ?? ''
  return normalized.startsWith('de') ? 'de' : 'en'
}

export function localeFromQuery(search: string): SupportedLocale {
  const params = new URLSearchParams(search)
  return resolveLocale(params.get('language') ?? params.get('locale'))
}

export function t(locale: SupportedLocale, key: TranslationKey) {
  return translations[locale][key]
}
