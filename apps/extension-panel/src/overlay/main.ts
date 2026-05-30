import { requireElement } from '../shared/dom'
import { fixtureMessage } from '../shared/fixtures'
import { formatCompact, formatDecimal, formatInteger, formatLedgerRank, formatTime } from '../shared/format'
import { getCountryDisplay } from '../shared/countries'
import { localeFromQuery, resolveLocale, t, type SupportedLocale } from '../shared/i18n'
import type { Snapshot } from '../shared/openapi'
import { parsePubSubSnapshot, sortCountries, type LedgerSort, type LedgerSortKey } from '../shared/snapshot'
import { applyPreferredTheme, applyTwitchTheme, getTwitchExt } from '../shared/twitch'
import { resolveUiStyle } from '../shared/uiStyle'
import './overlay.css'

type OverlayState =
  | { kind: 'waiting'; visible: boolean }
  | { kind: 'live'; visible: boolean; snapshot: Snapshot; receivedAt: Date }
  | { kind: 'invalid'; visible: boolean; reason: string }

type ViewportRect = {
  width: number
  height: number
}

type VideoContentRect = {
  left: number
  top: number
  bottom: number
  width: number
  height: number
}

let state: OverlayState = { kind: 'waiting', visible: true }
let ledgerOpen = false
const queryParams = new URLSearchParams(window.location.search)
const hasQueryLocale = queryParams.has('language') || queryParams.has('locale')
let locale: SupportedLocale = localeFromQuery(window.location.search)
let sort: LedgerSort = { key: 'rank', direction: 'asc' }
let selectedCountryTag: string | null = null
let channelId: string | null = null
const app = requireElement<HTMLElement>('#app')
const twitch = getTwitchExt()
const defaultStreamedContentAspectRatio = 16 / 9
const fixtureMode = queryParams.has('fixture')

// Fractions are measured inside the visible streamed video content, not inside the Twitch iframe.
// This keeps overlay hit targets aligned when Twitch adds letterboxing around non-16:9 streams.
const victoria3LedgerLayout = {
  referenceVideoHeight: 1080,
  calibratedGuiScale: 1.3,
  toggleLeft: -0.001,
  toggleBottom: 0.312,
  ledgerLeft: 0.026,
  ledgerTop: 0.039,
  ledgerWidth: 0.285,
  ledgerMaxHeight: 0.89,
} as const

applyPreferredTheme()
twitch?.onAuthorized((auth) => {
  channelId = auth.channelId
  updateVideoLayout()
  render()
})
twitch?.onContext((context) => {
  applyTwitchTheme(context)
  if (!hasQueryLocale) {
    locale = resolveLocale(context.language ?? locale)
  }
  render()
})
twitch?.onVisibilityChanged?.((visible) => {
  state = { ...state, visible }
  render()
})

app.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) return

  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
  if (action === 'toggle-ledger') {
    ledgerOpen = !ledgerOpen
    selectedCountryTag = null
    render()
  } else if (action === 'sort-ledger') {
    const key = target.closest<HTMLElement>('[data-sort-key]')?.dataset.sortKey
    if (isLedgerSortKey(key)) {
      sort = {
        key,
        direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc',
      }
      selectedCountryTag = null
      render()
    }
  } else if (action === 'show-country') {
    const tag = target.closest<HTMLElement>('[data-country-tag]')?.dataset.countryTag
    if (tag) {
      selectedCountryTag = tag
      render()
    }
  } else if (action === 'back-ledger') {
    selectedCountryTag = null
    render()
  }
})

window.addEventListener('resize', updateVideoLayout)
window.ResizeObserver && new ResizeObserver(updateVideoLayout).observe(app)
updateVideoLayout()

function acceptMessage(rawMessage: string) {
  const snapshot = parsePubSubSnapshot(rawMessage)
  if (!snapshot) {
    state = { kind: 'invalid', visible: true, reason: 'Received unsupported PubSub message.' }
    render()
    return
  }

  state = { kind: 'live', visible: true, snapshot, receivedAt: new Date() }
  rememberSnapshotUi(snapshot)
  updateVideoLayout()
  render()
}

function updateVideoLayout() {
  const viewport = getOverlayViewport()

  const streamedContentAspectRatio = getStreamedContentAspectRatio()
  const video = resolveVideoContentRect(viewport, streamedContentAspectRatio)
  const guiScale = getSnapshotGuiScale()
  const ledgerWidth = clamp(
    video.width * victoria3LedgerLayout.ledgerWidth,
    0,
    Math.min(620, Math.max(0, video.width - 8))
  )
  const uiScale = resolveOverlayScale(video, streamedContentAspectRatio, guiScale, ledgerWidth)
  const px = (value: number) => `${Math.round(value * 100) / 100}px`
  const scaledPx = (value: number) => px(value * uiScale)

  app.style.setProperty('--video-left', px(video.left))
  app.style.setProperty('--video-top', px(video.top))
  app.style.setProperty('--video-width', px(video.width))
  app.style.setProperty('--video-height', px(video.height))
  app.style.setProperty('--ui-scale', `${uiScale}`)
  app.style.setProperty('--toggle-left', px(video.left + video.width * victoria3LedgerLayout.toggleLeft))
  app.style.setProperty('--toggle-bottom', px(video.bottom + video.height * victoria3LedgerLayout.toggleBottom))
  app.style.setProperty('--toggle-size', scaledPx(38))
  app.style.setProperty('--toggle-border', scaledPx(2))
  app.style.setProperty('--toggle-ring-inset', scaledPx(8.5))
  app.style.setProperty('--toggle-line-block-inset', scaledPx(16))
  app.style.setProperty('--toggle-line-inline-inset', scaledPx(8.5))
  app.style.setProperty('--ledger-left', px(video.left + video.width * victoria3LedgerLayout.ledgerLeft))
  app.style.setProperty('--ledger-top', px(video.top + video.height * victoria3LedgerLayout.ledgerTop))
  app.style.setProperty('--ledger-width', px(ledgerWidth))
  app.style.setProperty('--ledger-max-height', px(video.height * victoria3LedgerLayout.ledgerMaxHeight))
  app.style.setProperty('--ledger-header-min-height', scaledPx(58))
  app.style.setProperty('--ledger-header-block-padding', scaledPx(12))
  app.style.setProperty('--ledger-header-inline-padding', scaledPx(16))
  app.style.setProperty('--ledger-title-size', scaledPx(20))
  app.style.setProperty('--ledger-meta-size', scaledPx(12))
  app.style.setProperty('--ledger-close-size', scaledPx(28))
  app.style.setProperty('--ledger-rank-col', scaledPx(44))
  app.style.setProperty('--ledger-country-min-col', scaledPx(108))
  app.style.setProperty('--ledger-prestige-col', scaledPx(68))
  app.style.setProperty('--ledger-gdp-col', scaledPx(74))
  app.style.setProperty('--ledger-sol-col', scaledPx(48))
  app.style.setProperty('--ledger-population-col', scaledPx(82))
  app.style.setProperty('--ledger-column-gap', scaledPx(6))
  app.style.setProperty('--ledger-toolbar-block-padding', scaledPx(9))
  app.style.setProperty('--ledger-toolbar-inline-padding', scaledPx(14))
  app.style.setProperty('--ledger-row-height', scaledPx(38))
  app.style.setProperty('--ledger-row-font-size', scaledPx(14))
  app.style.setProperty('--ledger-rank-size', scaledPx(28))
  app.style.setProperty('--ledger-empty-block-padding', scaledPx(20))
  app.style.setProperty('--ledger-empty-inline-padding', scaledPx(16))
  app.style.setProperty('--ledger-empty-font-size', scaledPx(16))
}

function getOverlayViewport(): ViewportRect {
  return {
    width: app.clientWidth || window.innerWidth,
    height: app.clientHeight || window.innerHeight,
  }
}

function resolveVideoContentRect(viewport: ViewportRect, aspectRatio: number): VideoContentRect {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { left: 0, top: 0, bottom: 0, width: 0, height: 0 }
  }

  const viewportAspectRatio = viewport.width / viewport.height
  let width = viewport.width
  let height = viewport.height

  if (viewportAspectRatio > aspectRatio) {
    height = viewport.height
    width = height * aspectRatio
  } else {
    width = viewport.width
    height = width / aspectRatio
  }

  const left = (viewport.width - width) / 2
  const top = (viewport.height - height) / 2
  return {
    left,
    top,
    bottom: viewport.height - top - height,
    width,
    height,
  }
}

function resolveOverlayScale(
  video: VideoContentRect,
  aspectRatio: number,
  guiScale: number,
  ledgerWidth: number
) {
  const guiScaleFactor = guiScale / victoria3LedgerLayout.calibratedGuiScale
  const heightScale = video.height / victoria3LedgerLayout.referenceVideoHeight
  const referenceLedgerWidth =
    victoria3LedgerLayout.referenceVideoHeight *
    aspectRatio *
    victoria3LedgerLayout.ledgerWidth
  const widthFitScale = referenceLedgerWidth > 0 ? ledgerWidth / referenceLedgerWidth : heightScale

  return clamp(Math.min(heightScale, widthFitScale) * guiScaleFactor, 0.45, 1.35)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getSnapshotGuiScale() {
  if (state.kind !== 'live') return getCachedSnapshotUi().guiScale ?? victoria3LedgerLayout.calibratedGuiScale

  const guiScale = state.snapshot.u?.g
  return typeof guiScale === 'number' && Number.isFinite(guiScale)
    ? Math.min(3, Math.max(0.5, guiScale))
    : victoria3LedgerLayout.calibratedGuiScale
}

function getStreamedContentAspectRatio() {
  if (state.kind !== 'live') return getCachedSnapshotUi().streamAspectRatio ?? defaultStreamedContentAspectRatio

  const streamAspectRatio = state.snapshot.u?.a
  return typeof streamAspectRatio === 'number' && Number.isFinite(streamAspectRatio)
    ? Math.min(4, Math.max(1, streamAspectRatio))
    : defaultStreamedContentAspectRatio
}

function rememberSnapshotUi(snapshot: Snapshot) {
  const cacheKey = getUiCacheKey()
  if (!cacheKey) return

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({
      guiScale: snapshot.u?.g,
      streamAspectRatio: snapshot.u?.a,
    }))
  } catch {
    // Storage may be unavailable in some Twitch embed contexts.
  }
}

function getCachedSnapshotUi() {
  const cacheKey = getUiCacheKey()
  if (!cacheKey) return { guiScale: null, streamAspectRatio: null }

  try {
    const cached = JSON.parse(window.localStorage.getItem(cacheKey) ?? '{}')
    return {
      guiScale: typeof cached.guiScale === 'number' && Number.isFinite(cached.guiScale)
        ? Math.min(3, Math.max(0.5, cached.guiScale))
        : null,
      streamAspectRatio: typeof cached.streamAspectRatio === 'number' && Number.isFinite(cached.streamAspectRatio)
        ? Math.min(4, Math.max(1, cached.streamAspectRatio))
        : null,
    }
  } catch {
    return { guiScale: null, streamAspectRatio: null }
  }
}

function getUiCacheKey() {
  if (channelId) return `vic3-overlay:${channelId}:last-ui`
  return fixtureMode ? 'vic3-overlay:fixture:last-ui' : null
}

if (twitch?.listen) {
  twitch.listen('broadcast', (_target, _contentType, message) => acceptMessage(message))
} else {
  acceptMessage(fixtureMessage())
}

if (fixtureMode) {
  acceptMessage(fixtureMessage())
}

render()

function render() {
  updateVideoLayout()
  const snapshot = state.kind === 'live' ? state.snapshot : null
  const uiStyle = resolveUiStyle(snapshot)
  app.className = uiStyle.className

  if (!state.visible) {
    app.innerHTML = ''
    return
  }

  if (!ledgerOpen) {
    app.innerHTML = closedHtml(state.kind)
    return
  }

  if (state.kind === 'waiting') {
    app.innerHTML = shellHtml(t(locale, 'waitingTitle'), t(locale, 'waitingStatus'), `<div class="empty">${escapeHtml(t(locale, 'waitingMessage'))}</div>`)
    return
  }

  if (state.kind === 'invalid') {
    app.innerHTML = shellHtml(t(locale, 'invalidTitle'), t(locale, 'invalidStatus'), `<div class="empty">${escapeHtml(state.reason)}</div>`)
    return
  }

  const countries = sortCountries(state.snapshot, sort).slice(0, 30)
  const selectedCountry = selectedCountryTag
    ? state.snapshot.c.find(country => country.t === selectedCountryTag) ?? null
    : null
  const updatedAt = formatTime(state.snapshot.d, locale)
  app.innerHTML = shellHtml(
    selectedCountry ? getCountryDisplay(selectedCountry.t, locale).name : t(locale, 'ledgerTitle'),
    updatedAt ? `${t(locale, 'updated')} ${updatedAt}` : `${t(locale, 'sequence')} ${state.snapshot.q}`,
    selectedCountry ? countryPanelHtml(selectedCountry) : ledgerRowsHtml(countries),
    selectedCountry !== null
  )
}

function shellHtml(title: string, status: string, content: string, countryPanel = false) {
  return `
    <section class="overlay-root">
      ${toggleButtonHtml(state.kind)}
      <section class="ledger ${countryPanel ? 'country-panel-mode' : ''}" aria-label="Victoria 3 country ledger">
        <header class="ledger-header">
          <div>
            <h1 class="ledger-title">${escapeHtml(title)}</h1>
            <div class="ledger-subtitle">${escapeHtml(t(locale, 'appName'))}</div>
          </div>
          <div class="ledger-header-actions">
            <div class="ledger-status">${escapeHtml(status)}</div>
            ${countryPanel ? `<button class="ledger-back" type="button" data-action="back-ledger" aria-label="${escapeHtml(t(locale, 'backToLedger'))}">‹</button>` : ''}
            <button class="ledger-close" type="button" data-action="toggle-ledger" aria-label="${escapeHtml(t(locale, 'closeLedger'))}">x</button>
          </div>
        </header>
        ${countryPanel ? '' : ledgerToolbarHtml()}
        <div class="ledger-list">${content}</div>
      </section>
    </section>
  `
}

function ledgerToolbarHtml() {
  return `
    <div class="ledger-toolbar">
      ${sortButtonHtml('rank', t(locale, 'rank'))}
      ${sortButtonHtml('country', t(locale, 'country'))}
      ${sortButtonHtml('prestige', t(locale, 'prestige'), true)}
      ${sortButtonHtml('gdp', t(locale, 'gdp'), true)}
      ${sortButtonHtml('sol', t(locale, 'sol'), true)}
      ${sortButtonHtml('population', t(locale, 'population'), true)}
    </div>
  `
}

function sortButtonHtml(key: LedgerSortKey, label: string, numeric = false) {
  const active = sort.key === key
  const marker = active ? (sort.direction === 'asc' ? '▲' : '▼') : ''
  return `
    <button class="ledger-sort ${numeric ? 'ledger-value' : ''} ${active ? 'active' : ''}" type="button" data-action="sort-ledger" data-sort-key="${key}">
      <span>${escapeHtml(label)}</span><span class="sort-marker">${marker}</span>
    </button>
  `
}

function closedHtml(kind: OverlayState['kind']) {
  return `
    <section class="overlay-root overlay-root-closed">
      ${toggleButtonHtml(kind)}
    </section>
  `
}

function toggleButtonHtml(kind: OverlayState['kind']) {
  const label = kind === 'live' ? t(locale, 'openLedger') : t(locale, 'openLedgerWaiting')
  return `
    <button class="ledger-toggle ${kind}" type="button" data-action="toggle-ledger" aria-label="${escapeHtml(label)}">
      <span class="visually-hidden">${escapeHtml(label)}</span>
    </button>
  `
}

function ledgerRowsHtml(countries: Snapshot['c']) {
  if (countries.length === 0) return `<div class="empty">${escapeHtml(t(locale, 'noCountries'))}</div>`

  return countries.map((country, index) => `
    <button class="ledger-row" type="button" data-action="show-country" data-country-tag="${escapeHtml(country.t)}">
      <div><span class="ledger-rank">${escapeHtml(formatLedgerRank(country.s, index))}</span></div>
      <div class="ledger-country">${countryNameHtml(country.t)}</div>
      <div class="ledger-value">${escapeHtml(formatInteger(country.p, locale))}</div>
      <div class="ledger-value">${escapeHtml(formatCompact(country.g, locale))}</div>
      <div class="ledger-value">${escapeHtml(formatDecimal(country.l, locale))}</div>
      <div class="ledger-value">${escapeHtml(formatCompact(country.o, locale))}</div>
    </button>
  `).join('')
}

function countryPanelHtml(country: Snapshot['c'][number]) {
  const display = getCountryDisplay(country.t, locale)
  return `
    <article class="country-panel">
      <div class="country-hero">
        <div class="country-flag">${escapeHtml(display.flag || country.t)}</div>
        <div>
          <h2>${escapeHtml(display.name)}</h2>
          <div class="country-tag">${escapeHtml(country.t)}</div>
        </div>
      </div>
      <dl class="country-stats">
        ${statHtml(t(locale, 'rank'), formatLedgerRank(country.s, 0))}
        ${statHtml(t(locale, 'powerRank'), localizeRank(country.r))}
        ${statHtml(t(locale, 'prestige'), formatInteger(country.p, locale))}
        ${statHtml(t(locale, 'gdp'), formatCompact(country.g, locale))}
        ${statHtml(t(locale, 'sol'), formatDecimal(country.l, locale))}
        ${statHtml(t(locale, 'population'), formatCompact(country.o, locale))}
        ${statHtml(t(locale, 'treasury'), formatCompact(country.x, locale))}
        ${statHtml(t(locale, 'market'), country.m ?? t(locale, 'notAvailable'))}
      </dl>
    </article>
  `
}

function statHtml(label: string, value: string) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
}

function countryNameHtml(tag: string) {
  const display = getCountryDisplay(tag, locale)
  const flag = display.flag ? `<span class="country-flag-inline">${escapeHtml(display.flag)}</span>` : ''
  return `${flag}<span class="country-name">${escapeHtml(display.name)}</span>`
}

function localizeRank(rank: string | null | undefined) {
  if (!rank) return t(locale, 'notAvailable')
  const labels: Record<string, Record<SupportedLocale, string>> = {
    great_power: { en: 'Great Power', de: 'Großmacht' },
    major_power: { en: 'Major Power', de: 'Großmacht' },
    minor_power: { en: 'Minor Power', de: 'Mittelmacht' },
    insignificant_power: { en: 'Insignificant Power', de: 'Unbedeutende Macht' },
    unrecognized_major_power: { en: 'Unrecognized Major Power', de: 'Unanerkannte Großmacht' },
    unrecognized_regional_power: { en: 'Unrecognized Regional Power', de: 'Unanerkannte Regionalmacht' },
    unrecognized_power: { en: 'Unrecognized Power', de: 'Unanerkannte Macht' },
  }
  return labels[rank]?.[locale] ?? rank.replaceAll('_', ' ')
}

function isLedgerSortKey(value: string | undefined): value is LedgerSortKey {
  return value === 'rank' || value === 'country' || value === 'prestige' || value === 'gdp' || value === 'sol' || value === 'population'
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
