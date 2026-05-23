import type { OperationHandler, RequestBodyJson, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { verifyBroadcasterOrAdminForChannel } from '../lib/twitchAuth'
import { canAdmitActiveChannel } from '../lib/activeSessions'

function randomPairingCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

/**
 * initPair: POST /pair/init
 */
export const handleInitPairOperation: OperationHandler<'initPair'> = async ({ requestBody, requestHeaders, env }) => {
  const input: RequestBodyJson<'initPair'> = requestBody
  const channelId = input.channelId

  const auth = await verifyBroadcasterOrAdminForChannel(env.EXT_SHARED_SECRET, requestHeaders.authorization, channelId)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  if (!(await canAdmitActiveChannel(env, channelId))) return json({ error: 'active_streamers_limit_reached' }, 429)

  const code = randomPairingCode()
  const expiresIn = 600
  await env.KV.put(`pair:${code}`, channelId, { expirationTtl: expiresIn })

  const response: ResponseBody<'initPair', 200> = {
    code,
    expiresIn,
  }
  return json(response)
}
