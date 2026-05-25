import { requireElement, setText } from '../shared/dom'
import { applyPreferredTheme, applyTwitchTheme, getTwitchExt, type TwitchAuth } from '../shared/twitch'
import './config.css'

const workerBase = 'https://vic3-unofficial-twitch-ebs.masterharz-ss.workers.dev'

type PairStatusResponse = {
  paired: boolean
  pairedAt?: string
}

type PairInitResponse = {
  code: string
  expiresIn: number
}

let auth: TwitchAuth | null = null
let statusTimer: number | undefined
let codePollTimer: number | undefined

const app = requireElement<HTMLElement>('#app')
app.innerHTML = `
  <section class="config-shell">
    <div class="config-card">
      <h1 class="config-title">Unofficial Victoria 3 Overlay - Configuration</h1>
      <p class="config-copy">Click "Generate code" to pair your desktop uploader with this channel.</p>
      <div class="config-actions">
        <button class="button" id="gen" disabled>Generate code</button>
        <button class="button secondary" id="unpair" disabled>Unpair</button>
        <div id="status" class="state">Waiting for Twitch</div>
      </div>
      <div id="out" class="pair-code" aria-live="polite"></div>
      <p class="hint" id="hint"></p>
    </div>
  </section>
`

const genBtn = requireElement<HTMLButtonElement>('#gen', app)
const unpairBtn = requireElement<HTMLButtonElement>('#unpair', app)
const out = requireElement<HTMLElement>('#out', app)
const statusEl = requireElement<HTMLElement>('#status', app)
const hint = requireElement<HTMLElement>('#hint', app)

applyPreferredTheme()
const twitch = getTwitchExt()
twitch?.onContext((ctx) => applyTwitchTheme(ctx))

function setStatus(text: string, state = '') {
  setText(statusEl, text)
  statusEl.className = `state ${state}`.trim()
}

function setHint(text: string) {
  setText(hint, text)
}

function authHeaders() {
  if (!auth) throw new Error('Missing Twitch authorization')
  return {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  }
}

function channelBody() {
  if (!auth) throw new Error('Missing Twitch authorization')
  return JSON.stringify({ channelId: auth.channelId })
}

function stopCodePolling() {
  if (codePollTimer) window.clearInterval(codePollTimer)
  codePollTimer = undefined
}

function renderPairStatus(data: PairStatusResponse) {
  if (data.paired) {
    stopCodePolling()
    out.textContent = ''
    genBtn.textContent = 'Generate new code'
    unpairBtn.disabled = false
    setStatus('Paired', 'paired')
    setHint(data.pairedAt ? `Desktop uploader paired at ${new Date(data.pairedAt).toLocaleString()}.` : 'Desktop uploader is paired.')
    return
  }

  genBtn.textContent = 'Generate code'
  unpairBtn.disabled = true
  setStatus('Not paired', 'unpaired')
  if (!out.textContent) setHint('Generate a code and enter it in the desktop app.')
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : `HTTP ${response.status}`
    throw new Error(error)
  }
  return data as T
}

async function refreshPairStatus() {
  if (!auth) return false
  const response = await fetch(`${workerBase}/pair/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: channelBody(),
  })
  const data = await readJson<PairStatusResponse>(response)
  renderPairStatus(data)
  return data.paired
}

function startStatusPolling() {
  if (statusTimer) window.clearInterval(statusTimer)
  statusTimer = window.setInterval(() => {
    refreshPairStatus().catch((error: unknown) => setStatus(`Error: ${messageFromError(error)}`, 'error'))
  }, 30000)
}

function startCodePolling(ttlSeconds: number) {
  stopCodePolling()
  const stopAt = Date.now() + ttlSeconds * 1000
  codePollTimer = window.setInterval(async () => {
    if (Date.now() >= stopAt) {
      stopCodePolling()
      return
    }
    try {
      await refreshPairStatus()
    } catch (error) {
      setStatus(`Error: ${messageFromError(error)}`, 'error')
    }
  }, 2000)
}

function showCode(data: PairInitResponse) {
  out.textContent = data.code
  setHint(`Valid for ${Math.round(data.expiresIn / 60)} minutes. Enter this code in the desktop app.`)
}

twitch?.onAuthorized(async (authorized) => {
  auth = authorized
  genBtn.disabled = false
  setStatus('Checking...')
  try {
    await refreshPairStatus()
    startStatusPolling()
  } catch (error) {
    setStatus(`Error: ${messageFromError(error)}`, 'error')
  }
})

if (!twitch) {
  setStatus('Twitch helper unavailable', 'error')
  setHint('Open this page through Twitch local test to configure pairing.')
}

genBtn.addEventListener('click', async () => {
  if (!auth) return
  genBtn.disabled = true
  setStatus('Generating...')
  try {
    const response = await fetch(`${workerBase}/pair/init`, {
      method: 'POST',
      headers: authHeaders(),
      body: channelBody(),
    })
    const data = await readJson<PairInitResponse>(response)
    showCode(data)
    setStatus('Code generated')
    startCodePolling(data.expiresIn || 600)
  } catch (error) {
    setStatus(`Error: ${messageFromError(error)}`, 'error')
    out.textContent = ''
    setHint('')
  } finally {
    genBtn.disabled = false
  }
})

unpairBtn.addEventListener('click', async () => {
  if (!auth) return
  unpairBtn.disabled = true
  setStatus('Unpairing...')
  try {
    const response = await fetch(`${workerBase}/pair/revoke/channel`, {
      method: 'POST',
      headers: authHeaders(),
      body: channelBody(),
    })
    await readJson(response)
    out.textContent = ''
    stopCodePolling()
    await refreshPairStatus()
  } catch (error) {
    setStatus(`Error: ${messageFromError(error)}`, 'error')
    unpairBtn.disabled = false
  }
})

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
