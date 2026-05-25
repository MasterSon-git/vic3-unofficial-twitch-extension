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
const app = requireElement<HTMLElement>('#app')
const twitch = getTwitchExt()

applyPreferredTheme()
twitch?.onContext((context) => applyTwitchTheme(context))
twitch?.onVisibilityChanged?.((visible) => {
  state = { ...state, visible }
  render()
})

function acceptMessage(rawMessage: string) {
  const snapshot = parsePubSubSnapshot(rawMessage)
  if (!snapshot) {
    state = { kind: 'invalid', visible: true, reason: 'Received unsupported PubSub message.' }
    render()
    return
  }

  state = { kind: 'live', visible: true, snapshot, receivedAt: new Date() }
  render()
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
      <section class="ledger" aria-label="Victoria 3 country ledger">
        <header class="ledger-header">
          <div>
            <h1 class="ledger-title">${escapeHtml(title)}</h1>
            <div class="ledger-subtitle">Unofficial Victoria 3 Overlay</div>
          </div>
          <div class="ledger-status">${escapeHtml(status)}</div>
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
