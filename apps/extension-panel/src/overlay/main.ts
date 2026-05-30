import { html, nothing, render as litRender, type TemplateResult } from 'lit'
import { classMap } from 'lit/directives/class-map.js'
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

type OverlayViewModel = {
  state: OverlayState
  ledgerOpen: boolean
  locale: SupportedLocale
  sort: LedgerSort
  selectedCountryTag: string | null
  channelId: string | null
  layoutUi: LayoutUi | null
}

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

type LayoutUi = {
  guiScale: number
  streamAspectRatio: number
}

type OpenContent =
  | { kind: 'message'; title: string; status: string; body: TemplateResult }
  | { kind: 'ledger'; title: string; status: string; countries: Snapshot['c'] }
  | { kind: 'country'; title: string; status: string; country: Snapshot['c'][number] }

const app = requireElement<HTMLElement>('#app')
const twitch = getTwitchExt()
const queryParams = new URLSearchParams(window.location.search)
const hasQueryLocale = queryParams.has('language') || queryParams.has('locale')
const fixtureMode = queryParams.has('fixture')
const defaultStreamedContentAspectRatio = 16 / 9

// Fractions are measured inside the visible streamed video content, not inside the Twitch iframe.
// This keeps overlay hit targets aligned when Twitch adds letterboxing around non-16:9 streams.
const victoria3LedgerLayout = {
  referenceVideoHeight: 1080,
  calibratedGuiScale: 1.3,
  toggleLeft: -0.001,
  toggleBottom: 0.335,
  ledgerLeft: 0.026,
  ledgerTop: 0.074,
  ledgerWidth: 0.285,
  ledgerBottom: 0.01,
} as const

const vm: OverlayViewModel = {
  state: { kind: 'waiting', visible: true },
  ledgerOpen: false,
  locale: localeFromQuery(window.location.search),
  sort: { key: 'rank', direction: 'asc' },
  selectedCountryTag: null,
  channelId: null,
  layoutUi: null,
}
let renderedBodyKey: string | null = null

applyPreferredTheme()

twitch?.onAuthorized((auth) => {
  updateViewModel({ channelId: auth.channelId, layoutUi: null }, { updateLayout: true })
})

twitch?.onContext((context) => {
  applyTwitchTheme(context)
  if (!hasQueryLocale) {
    const nextLocale = resolveLocale(context.language ?? vm.locale)
    if (nextLocale !== vm.locale) updateViewModel({ locale: nextLocale })
  }
})

twitch?.onVisibilityChanged?.((visible) => {
  if (visible !== vm.state.visible) {
    updateViewModel({ state: { ...vm.state, visible } })
  }
})

window.addEventListener('resize', () => renderOverlay({ updateLayout: true }))
window.ResizeObserver && new ResizeObserver(() => renderOverlay({ updateLayout: true })).observe(app)

if (twitch?.listen) {
  twitch.listen('broadcast', (_target, _contentType, message) => acceptMessage(message))
} else {
  acceptMessage(fixtureMessage())
}

if (fixtureMode) {
  acceptMessage(fixtureMessage())
}

renderOverlay({ updateLayout: true })

function acceptMessage(rawMessage: string) {
  const snapshot = parsePubSubSnapshot(rawMessage)
  if (!snapshot) {
    updateViewModel({ state: { kind: 'invalid', visible: true, reason: 'Received unsupported PubSub message.' } })
    return
  }

  rememberSnapshotUi(snapshot)
  updateViewModel({ state: { kind: 'live', visible: true, snapshot, receivedAt: new Date() } })
}

function updateViewModel(
  patch: Partial<Omit<OverlayViewModel, 'sort'> & { sort: LedgerSort }>,
  options: { updateLayout?: boolean } = {}
) {
  Object.assign(vm, patch)
  renderOverlay(options)
}

function renderOverlay(options: { updateLayout?: boolean } = {}) {
  if (options.updateLayout) updateVideoLayout()

  const snapshot = vm.state.kind === 'live' ? vm.state.snapshot : null
  const uiStyle = resolveUiStyle(snapshot)
  app.className = uiStyle.className
  const bodyKey = getBodyKey()

  litRender(overlayTemplate(), app)

  if (bodyKey !== renderedBodyKey) {
    renderedBodyKey = bodyKey
    app.querySelector<HTMLElement>('.ledger-list')?.scrollTo({ top: 0 })
  }
}

function overlayTemplate() {
  if (!vm.state.visible) return nothing
  if (!vm.ledgerOpen) return closedTemplate()

  const content = getOpenContent()
  return html`
    <section class="overlay-root">
      ${toggleButtonTemplate(vm.state.kind)}
      <section
        class=${classMap({ ledger: true, 'country-panel-mode': content.kind === 'country' })}
        aria-label="Victoria 3 country ledger"
      >
        ${ledgerHeaderTemplate(content)}
        ${content.kind === 'country' ? nothing : ledgerToolbarTemplate()}
        <div class="ledger-list">${openContentBodyTemplate(content)}</div>
      </section>
    </section>
  `
}

function closedTemplate() {
  return html`
    <section class="overlay-root overlay-root-closed">
      ${toggleButtonTemplate(vm.state.kind)}
    </section>
  `
}

function getOpenContent(): OpenContent {
  if (vm.state.kind === 'waiting') {
    return {
      kind: 'message',
      title: t(vm.locale, 'waitingTitle'),
      status: t(vm.locale, 'waitingStatus'),
      body: html`<div class="empty">${t(vm.locale, 'waitingMessage')}</div>`,
    }
  }

  if (vm.state.kind === 'invalid') {
    return {
      kind: 'message',
      title: t(vm.locale, 'invalidTitle'),
      status: t(vm.locale, 'invalidStatus'),
      body: html`<div class="empty">${vm.state.reason}</div>`,
    }
  }

  const selectedCountry = vm.selectedCountryTag
    ? vm.state.snapshot.c.find(country => country.t === vm.selectedCountryTag) ?? null
    : null
  const updatedAt = formatTime(vm.state.snapshot.d, vm.locale)
  const status = updatedAt
    ? `${t(vm.locale, 'updated')} ${updatedAt}`
    : `${t(vm.locale, 'sequence')} ${vm.state.snapshot.q}`

  if (selectedCountry) {
    return {
      kind: 'country',
      title: getCountryDisplay(selectedCountry.t, vm.locale).name,
      status,
      country: selectedCountry,
    }
  }

  return {
    kind: 'ledger',
    title: t(vm.locale, 'ledgerTitle'),
    status,
    countries: sortCountries(vm.state.snapshot, vm.sort).slice(0, 30),
  }
}

function ledgerHeaderTemplate(content: OpenContent) {
  return html`
    <header class="ledger-header">
      <div>
        <h1 class="ledger-title">${content.title}</h1>
        <div class="ledger-subtitle">${t(vm.locale, 'appName')}</div>
      </div>
      <div class="ledger-header-actions">
        <div class="ledger-status">${content.status}</div>
        ${content.kind === 'country'
          ? html`<button class="ledger-back" type="button" @click=${showLedger} aria-label=${t(vm.locale, 'backToLedger')}>‹</button>`
          : nothing}
        <button class="ledger-close" type="button" @click=${toggleLedger} aria-label=${t(vm.locale, 'closeLedger')}>x</button>
      </div>
    </header>
  `
}

function ledgerToolbarTemplate() {
  return html`
    <div class="ledger-toolbar">
      ${sortButtonTemplate('rank', t(vm.locale, 'rank'))}
      ${sortButtonTemplate('country', t(vm.locale, 'country'))}
      ${sortButtonTemplate('prestige', t(vm.locale, 'prestige'), true)}
      ${sortButtonTemplate('gdp', t(vm.locale, 'gdp'), true)}
      ${sortButtonTemplate('sol', t(vm.locale, 'sol'), true)}
      ${sortButtonTemplate('population', t(vm.locale, 'population'), true)}
    </div>
  `
}

function sortButtonTemplate(key: LedgerSortKey, label: string, numeric = false) {
  const active = vm.sort.key === key
  const marker = active ? (vm.sort.direction === 'asc' ? '▲' : '▼') : ''
  return html`
    <button
      class=${classMap({ 'ledger-sort': true, 'ledger-value': numeric, active })}
      type="button"
      @click=${() => sortLedger(key)}
    >
      <span>${label}</span><span class="sort-marker">${marker}</span>
    </button>
  `
}

function openContentBodyTemplate(content: OpenContent) {
  if (content.kind === 'message') return content.body
  if (content.kind === 'country') return countryPanelTemplate(content.country)
  if (content.countries.length === 0) return html`<div class="empty">${t(vm.locale, 'noCountries')}</div>`
  return content.countries.map((country, index) => ledgerRowTemplate(country, index))
}

function toggleButtonTemplate(kind: OverlayState['kind']) {
  const label = kind === 'live' ? t(vm.locale, 'openLedger') : t(vm.locale, 'openLedgerWaiting')
  return html`
    <button class=${`ledger-toggle ${kind}`} type="button" @click=${toggleLedger} aria-label=${label}>
      <span class="visually-hidden">${label}</span>
    </button>
  `
}

function ledgerRowTemplate(country: Snapshot['c'][number], index: number) {
  return html`
    <button class="ledger-row" type="button" @click=${() => showCountry(country.t)}>
      <div><span class="ledger-rank">${formatLedgerRank(country.s, index)}</span></div>
      <div class="ledger-country">${countryNameTemplate(country.t)}</div>
      <div class="ledger-value">${formatInteger(country.p, vm.locale)}</div>
      <div class="ledger-value">${formatCompact(country.g, vm.locale)}</div>
      <div class="ledger-value">${formatDecimal(country.l, vm.locale)}</div>
      <div class="ledger-value">${formatCompact(country.o, vm.locale)}</div>
    </button>
  `
}

function countryPanelTemplate(country: Snapshot['c'][number]) {
  const display = getCountryDisplay(country.t, vm.locale)
  return html`
    <article class="country-panel">
      <div class="country-hero">
        <div class="country-flag">${display.flag || country.t}</div>
        <div>
          <h2>${display.name}</h2>
          <div class="country-tag">${country.t}</div>
        </div>
      </div>
      <dl class="country-stats">
        ${statTemplate(t(vm.locale, 'rank'), formatLedgerRank(country.s, 0))}
        ${statTemplate(t(vm.locale, 'powerRank'), localizeRank(country.r))}
        ${statTemplate(t(vm.locale, 'prestige'), formatInteger(country.p, vm.locale))}
        ${statTemplate(t(vm.locale, 'gdp'), formatCompact(country.g, vm.locale))}
        ${statTemplate(t(vm.locale, 'sol'), formatDecimal(country.l, vm.locale))}
        ${statTemplate(t(vm.locale, 'population'), formatCompact(country.o, vm.locale))}
        ${statTemplate(t(vm.locale, 'treasury'), formatCompact(country.x, vm.locale))}
        ${statTemplate(t(vm.locale, 'market'), country.m ?? t(vm.locale, 'notAvailable'))}
      </dl>
    </article>
  `
}

function statTemplate(label: string, value: string) {
  return html`<div><dt>${label}</dt><dd>${value}</dd></div>`
}

function countryNameTemplate(tag: string) {
  const display = getCountryDisplay(tag, vm.locale)
  return html`
    ${display.flag ? html`<span class="country-flag-inline">${display.flag}</span>` : nothing}
    <span class="country-name">${display.name}</span>
  `
}

function toggleLedger() {
  updateViewModel({
    ledgerOpen: !vm.ledgerOpen,
    selectedCountryTag: null,
  })
}

function showLedger() {
  if (vm.selectedCountryTag === null) return
  updateViewModel({ selectedCountryTag: null })
}

function showCountry(tag: string) {
  if (vm.selectedCountryTag === tag) return
  updateViewModel({ selectedCountryTag: tag })
}

function sortLedger(key: LedgerSortKey) {
  updateViewModel({
    selectedCountryTag: null,
    sort: {
      key,
      direction: vm.sort.key === key && vm.sort.direction === 'asc' ? 'desc' : 'asc',
    },
  })
}

function getBodyKey() {
  if (!vm.state.visible) return 'hidden'
  if (!vm.ledgerOpen) return `closed:${vm.state.kind}`
  if (vm.state.kind !== 'live') return `open:${vm.state.kind}`
  return `open:live:${vm.selectedCountryTag ?? 'ledger'}:${vm.sort.key}:${vm.sort.direction}`
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
  const ledgerHeight = Math.max(0, video.height * (1 - victoria3LedgerLayout.ledgerTop - victoria3LedgerLayout.ledgerBottom))
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
  app.style.setProperty('--ledger-height', px(ledgerHeight))
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
  app.style.setProperty('--ledger-list-bottom-padding', scaledPx(96))
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
  return getLayoutUi().guiScale
}

function getStreamedContentAspectRatio() {
  return getLayoutUi().streamAspectRatio
}

function getLayoutUi(): LayoutUi {
  if (vm.layoutUi) return vm.layoutUi

  const cached = getCachedSnapshotUi()
  vm.layoutUi = {
    guiScale: cached.guiScale ?? victoria3LedgerLayout.calibratedGuiScale,
    streamAspectRatio: cached.streamAspectRatio ?? defaultStreamedContentAspectRatio,
  }
  return vm.layoutUi
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
  if (vm.channelId) return `vic3-overlay:${vm.channelId}:last-ui`
  return fixtureMode ? 'vic3-overlay:fixture:last-ui' : null
}

function localizeRank(rank: string | null | undefined) {
  if (!rank) return t(vm.locale, 'notAvailable')
  const labels: Record<string, Record<SupportedLocale, string>> = {
    great_power: { en: 'Great Power', de: 'Großmacht' },
    major_power: { en: 'Major Power', de: 'Großmacht' },
    minor_power: { en: 'Minor Power', de: 'Mittelmacht' },
    insignificant_power: { en: 'Insignificant Power', de: 'Unbedeutende Macht' },
    unrecognized_major_power: { en: 'Unrecognized Major Power', de: 'Unanerkannte Großmacht' },
    unrecognized_regional_power: { en: 'Unrecognized Regional Power', de: 'Unanerkannte Regionalmacht' },
    unrecognized_power: { en: 'Unrecognized Power', de: 'Unanerkannte Macht' },
  }
  return labels[rank]?.[vm.locale] ?? rank.replaceAll('_', ' ')
}
