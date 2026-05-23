import type { OperationHandler, RequestBodyJson, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { verifyBroadcasterOrAdminForChannel } from '../lib/twitchAuth'

function randomPairingCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function numberFromEnv(value: string | number | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * initPair: POST /pair/init
 */
export const handleInitPairOperation: OperationHandler<'initPair'> = async ({ requestBody, requestHeaders, env }) => {
  const input: RequestBodyJson<'initPair'> = requestBody
  const channelId = input.channelId

  const auth = await verifyBroadcasterOrAdminForChannel(env.EXT_SHARED_SECRET, requestHeaders.authorization, channelId)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  const maxActiveChannels = numberFromEnv(env.MAX_ACTIVE_CHANNELS, 100)
  const activeKey = 'active:channels'
  const activeRaw = await env.KV.get(activeKey)
  const activeChannels = new Set<string>(activeRaw ? JSON.parse(activeRaw) : [])
  if (!activeChannels.has(channelId) && activeChannels.size >= maxActiveChannels) {
    return json({ error: 'active_streamers_limit_reached', max: maxActiveChannels }, 429)
  }
  activeChannels.add(channelId)
  await env.KV.put(activeKey, JSON.stringify([...activeChannels]), { expirationTtl: 24 * 3600 })

  const code = randomPairingCode()
  const expiresIn = 600
  await env.KV.put(`pair:${code}`, channelId, { expirationTtl: expiresIn })

  const response: ResponseBody<'initPair', 200> = {
    code,
    expiresIn,
  }
  return json(response)
}
