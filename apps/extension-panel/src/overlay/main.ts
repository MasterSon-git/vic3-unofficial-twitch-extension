import { requireElement } from '../shared/dom'
import { fixtureMessage } from '../shared/fixtures'
import { formatCompact, formatInteger, formatLedgerRank, formatTime } from '../shared/format'
import type { Snapshot } from '../shared/openapi'
import { parsePubSubSnapshot, sortCountriesForLedger } from '../shared/snapshot'
import { applyPreferredTheme, applyTwitchTheme, getTwitchExt } from '../shared/twitch'
import { resolveUiStyle } from '../shared/uiStyle'
import './overlay.css'

type OverlayState =
  | { kind: 'waiting'; visible: boolean }
  | { kind: 'live'; visible: boolean; snapshot: Snapshot; receivedAt: Date }
  | { kind: 'invalid'; visible: boolean; reason: string }

let state: OverlayState = { kind: 'waiting', visible: true }
let ledgerOpen = false
const app = requireElement<HTMLElement>('#app')
const twitch = getTwitchExt()
const defaultStreamedContentAspectRatio = 16 / 9
const victoria3LedgerLayout = {
  calibratedGuiScale: 1.3,
  toggleLeft: 0.011,
  toggleBottom: 0.019,
  ledgerLeft: 0.033,
  ledgerTop: 0.088,
  ledgerWidth: 0.31,
  ledgerMaxHeight: 0.89,
} as const

applyPreferredTheme()
twitch?.onContext((context) => applyTwitchTheme(context))
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
  updateVideoLayout()
  render()
}

function updateVideoLayout() {
  const viewportWidth = app.clientWidth || window.innerWidth
  const viewportHeight = app.clientHeight || window.innerHeight

  if (viewportWidth <= 0 || viewportHeight <= 0) return

  const viewportAspectRatio = viewportWidth / viewportHeight
  const streamedContentAspectRatio = getStreamedContentAspectRatio()
  let videoWidth = viewportWidth
  let videoHeight = viewportHeight

  if (viewportAspectRatio > streamedContentAspectRatio) {
    videoHeight = viewportHeight
    videoWidth = videoHeight * streamedContentAspectRatio
  } else {
    videoWidth = viewportWidth
    videoHeight = videoWidth / streamedContentAspectRatio
  }

  const videoLeft = (viewportWidth - videoWidth) / 2
  const videoTop = (viewportHeight - videoHeight) / 2
  const guiScale = getSnapshotGuiScale()
  const contentScale = videoHeight / 1080
  const uiScale = Math.min(1.35, Math.max(0.72, contentScale * (guiScale / victoria3LedgerLayout.calibratedGuiScale)))
  const px = (value: number) => `${Math.round(value * 100) / 100}px`
  const scaledPx = (value: number) => px(value * uiScale)
  const scaledContentOffset = (fraction: number, axisLength: number) =>
    axisLength * fraction * (guiScale / victoria3LedgerLayout.calibratedGuiScale)
  const ledgerWidth = Math.min(
    610,
    Math.max(Math.min(360, videoWidth - 24), videoWidth * victoria3LedgerLayout.ledgerWidth)
  )

  app.style.setProperty('--video-left', `${videoLeft}px`)
  app.style.setProperty('--video-top', `${videoTop}px`)
  app.style.setProperty('--video-width', `${videoWidth}px`)
  app.style.setProperty('--video-height', `${videoHeight}px`)
  app.style.setProperty('--ui-scale', `${uiScale}`)
  app.style.setProperty('--toggle-left', px(videoLeft + scaledContentOffset(victoria3LedgerLayout.toggleLeft, videoWidth)))
  app.style.setProperty('--toggle-bottom', px(videoTop + scaledContentOffset(victoria3LedgerLayout.toggleBottom, videoHeight)))
  app.style.setProperty('--toggle-size', scaledPx(46))
  app.style.setProperty('--toggle-border', scaledPx(2))
  app.style.setProperty('--toggle-ring-inset', scaledPx(11))
  app.style.setProperty('--toggle-line-block-inset', scaledPx(20))
  app.style.setProperty('--toggle-line-inline-inset', scaledPx(10))
  app.style.setProperty('--ledger-left', px(videoLeft + scaledContentOffset(victoria3LedgerLayout.ledgerLeft, videoWidth)))
  app.style.setProperty('--ledger-top', px(videoTop + scaledContentOffset(victoria3LedgerLayout.ledgerTop, videoHeight)))
  app.style.setProperty('--ledger-width', px(ledgerWidth))
  app.style.setProperty('--ledger-max-height', px(videoHeight * victoria3LedgerLayout.ledgerMaxHeight))
  app.style.setProperty('--ledger-header-min-height', scaledPx(58))
  app.style.setProperty('--ledger-header-block-padding', scaledPx(12))
  app.style.setProperty('--ledger-header-inline-padding', scaledPx(16))
  app.style.setProperty('--ledger-title-size', scaledPx(20))
  app.style.setProperty('--ledger-meta-size', scaledPx(12))
  app.style.setProperty('--ledger-close-size', scaledPx(28))
  app.style.setProperty('--ledger-rank-col', scaledPx(48))
  app.style.setProperty('--ledger-country-min-col', scaledPx(72))
  app.style.setProperty('--ledger-prestige-col', scaledPx(82))
  app.style.setProperty('--ledger-gdp-col', scaledPx(96))
  app.style.setProperty('--ledger-treasury-col', scaledPx(88))
  app.style.setProperty('--ledger-column-gap', scaledPx(10))
  app.style.setProperty('--ledger-toolbar-block-padding', scaledPx(9))
  app.style.setProperty('--ledger-toolbar-inline-padding', scaledPx(14))
  app.style.setProperty('--ledger-row-height', scaledPx(38))
  app.style.setProperty('--ledger-row-font-size', scaledPx(14))
  app.style.setProperty('--ledger-rank-size', scaledPx(28))
  app.style.setProperty('--ledger-empty-block-padding', scaledPx(20))
  app.style.setProperty('--ledger-empty-inline-padding', scaledPx(16))
  app.style.setProperty('--ledger-empty-font-size', scaledPx(16))
}

function getSnapshotGuiScale() {
  if (state.kind !== 'live') return victoria3LedgerLayout.calibratedGuiScale

  const guiScale = state.snapshot.ui?.guiScale
  return typeof guiScale === 'number' && Number.isFinite(guiScale)
    ? Math.min(3, Math.max(0.5, guiScale))
    : victoria3LedgerLayout.calibratedGuiScale
}

function getStreamedContentAspectRatio() {
  if (state.kind !== 'live') return defaultStreamedContentAspectRatio

  const streamAspectRatio = state.snapshot.ui?.streamAspectRatio
  return typeof streamAspectRatio === 'number' && Number.isFinite(streamAspectRatio)
    ? Math.min(4, Math.max(1, streamAspectRatio))
    : defaultStreamedContentAspectRatio
}

if (twitch?.listen) {
  twitch.listen('broadcast', (_target, _contentType, message) => acceptMessage(message))
} else {
  acceptMessage(fixtureMessage())
}

if (new URLSearchParams(window.location.search).has('fixture')) {
  acceptMessage(fixtureMessage())
}

render()

function render() {
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
    app.innerHTML = shellHtml('Waiting for game state', 'No snapshot received yet.', `<div class="empty">Waiting for the desktop uploader to broadcast the first Victoria 3 snapshot.</div>`)
    return
  }

  if (state.kind === 'invalid') {
    app.innerHTML = shellHtml('Unsupported message', 'PubSub data ignored.', `<div class="empty">${escapeHtml(state.reason)}</div>`)
    return
  }

  const countries = sortCountriesForLedger(state.snapshot).slice(0, 30)
  const updatedAt = formatTime(state.snapshot.updatedAt)
  app.innerHTML = shellHtml(
    'Countries - Ledger',
    updatedAt ? `Updated ${updatedAt}` : `Sequence ${state.snapshot.seq}`,
    ledgerRowsHtml(countries)
  )
}

function shellHtml(title: string, status: string, content: string) {
  return `
    <section class="overlay-root">
      ${toggleButtonHtml(state.kind)}
      <section class="ledger" aria-label="Victoria 3 country ledger">
        <header class="ledger-header">
          <div>
            <h1 class="ledger-title">${escapeHtml(title)}</h1>
            <div class="ledger-subtitle">Unofficial Victoria 3 Overlay</div>
          </div>
          <div class="ledger-header-actions">
            <div class="ledger-status">${escapeHtml(status)}</div>
            <button class="ledger-close" type="button" data-action="toggle-ledger" aria-label="Close ledger">x</button>
          </div>
        </header>
        <div class="ledger-toolbar">
          <div>Rank</div>
          <div>Country</div>
          <div class="ledger-value">Prestige</div>
          <div class="ledger-value">GDP</div>
          <div class="ledger-value">Treasury</div>
        </div>
        <div class="ledger-list">${content}</div>
      </section>
    </section>
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
  const label = kind === 'live' ? 'Open country ledger' : 'Open country ledger, waiting for game state'
  return `
    <button class="ledger-toggle ${kind}" type="button" data-action="toggle-ledger" aria-label="${escapeHtml(label)}">
      <span class="visually-hidden">${escapeHtml(label)}</span>
    </button>
  `
}

function ledgerRowsHtml(countries: Snapshot['countries']) {
  if (countries.length === 0) return '<div class="empty">No countries in the current snapshot.</div>'

  return countries.map((country, index) => `
    <div class="ledger-row">
      <div><span class="ledger-rank">${escapeHtml(formatLedgerRank(country.score, index))}</span></div>
      <div class="ledger-tag">${escapeHtml(country.tag)}</div>
      <div class="ledger-value">${escapeHtml(formatInteger(country.prestige))}</div>
      <div class="ledger-value">${escapeHtml(formatCompact(country.gdp))}</div>
      <div class="ledger-value">${escapeHtml(formatCompact(country.treasury))}</div>
    </div>
  `).join('')
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
