import type { SupportedLocale } from './i18n'

type CountryMetadata = {
  flag: string
  name: Record<SupportedLocale, string>
}

const countries: Record<string, CountryMetadata> = {
  AUS: { flag: '🇦🇹', name: { en: 'Austria', de: 'Österreich' } },
  BAV: { flag: '🇩🇪', name: { en: 'Bavaria', de: 'Bayern' } },
  BEL: { flag: '🇧🇪', name: { en: 'Belgium', de: 'Belgien' } },
  BIC: { flag: '🇬🇧', name: { en: 'East India Company', de: 'Ostindien-Kompanie' } },
  BRZ: { flag: '🇧🇷', name: { en: 'Brazil', de: 'Brasilien' } },
  CHI: { flag: '🇨🇳', name: { en: 'Great Qing', de: 'Groß-Qing' } },
  DEN: { flag: '🇩🇰', name: { en: 'Denmark', de: 'Dänemark' } },
  FRA: { flag: '🇫🇷', name: { en: 'France', de: 'Frankreich' } },
  GBR: { flag: '🇬🇧', name: { en: 'Great Britain', de: 'Großbritannien' } },
  JAP: { flag: '🇯🇵', name: { en: 'Japan', de: 'Japan' } },
  KHN: { flag: '🇮🇳', name: { en: 'Khalsa Raj', de: 'Khalsa Raj' } },
  MEX: { flag: '🇲🇽', name: { en: 'Mexico', de: 'Mexiko' } },
  NET: { flag: '🇳🇱', name: { en: 'Netherlands', de: 'Niederlande' } },
  PAN: { flag: '🇺🇸', name: { en: 'Panama', de: 'Panama' } },
  POR: { flag: '🇵🇹', name: { en: 'Portugal', de: 'Portugal' } },
  PRU: { flag: '🇩🇪', name: { en: 'Prussia', de: 'Preußen' } },
  RUS: { flag: '🇷🇺', name: { en: 'Russia', de: 'Russland' } },
  SAR: { flag: '🇮🇹', name: { en: 'Sardinia-Piedmont', de: 'Sardinien-Piemont' } },
  SIC: { flag: '🇮🇹', name: { en: 'Two Sicilies', de: 'Sizilien' } },
  SIA: { flag: '🇹🇭', name: { en: 'Siam', de: 'Siam' } },
  SPA: { flag: '🇪🇸', name: { en: 'Spain', de: 'Spanien' } },
  SWE: { flag: '🇸🇪', name: { en: 'Sweden', de: 'Schweden' } },
  TUR: { flag: '🇹🇷', name: { en: 'Ottoman Empire', de: 'Osmanisches Reich' } },
  USA: { flag: '🇺🇸', name: { en: 'United States', de: 'Vereinigte Staaten' } },
}

export function getCountryDisplay(tag: string, locale: SupportedLocale) {
  const metadata = countries[tag]
  return {
    flag: metadata?.flag ?? '',
    name: metadata?.name[locale] ?? tag,
  }
}
