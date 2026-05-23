import type { OperationHandler, RequestBodyJson, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { admitActiveChannel } from '../lib/activeSessions'
import { pairingTtlSeconds } from '../lib/lifetimes'
import { clearPairCodeFailures, isPairCodeLocked, recordPairCodeFailure } from '../lib/pairAttempts'
import { revokeChannelPairing, saveChannelToken } from '../lib/pairings'

/**
 * completePair: POST /pair/complete
 */
export const handleCompletePairOperation: OperationHandler<'completePair'> = async ({ requestBody, env }) => {
  const input: RequestBodyJson<'completePair'> = requestBody
  const code = input.code.trim().toUpperCase()
  if (!code) return json({ error: 'code_missing' }, 400)
  if (await isPairCodeLocked(env, code)) return json({ error: 'invalid_or_expired_code' }, 400)

  const channelId = await env.KV.get(`pair:${code}`)
  if (!channelId) {
    await recordPairCodeFailure(env, code)
    return json({ error: 'invalid_or_expired_code' }, 400)
  }

  const admission = await admitActiveChannel(env, channelId)
  if (!admission.ok) return json({ error: admission.error }, 429)
  if (admission.evictedChannelId) await revokeChannelPairing(env, admission.evictedChannelId)

  const ingestToken = crypto.randomUUID()
  await saveChannelToken(env, channelId, ingestToken)
  await env.KV.delete(`pair:${code}`)
  await clearPairCodeFailures(env, code)

  const response: ResponseBody<'completePair', 200> = {
    channelId,
    ingestToken,
    expiresIn: pairingTtlSeconds,
  }
  return json(response)
}
