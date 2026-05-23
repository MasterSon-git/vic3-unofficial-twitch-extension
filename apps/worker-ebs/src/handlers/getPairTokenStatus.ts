import type { OperationHandler, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { admitActiveChannel } from '../lib/activeSessions'
import { revokeChannelPairing, validateIngestToken } from '../lib/pairings'

/**
 * getPairTokenStatus: POST /pair/status/token
 */
export const handleGetPairTokenStatusOperation: OperationHandler<'getPairTokenStatus'> = async ({
  requestHeaders,
  env,
}) => {
  const token = requestHeaders['x-ingest-token']
  if (!token) return json({ error: 'missing_ingest_token' }, 401)

  const channelId = await validateIngestToken(env, token)
  if (!channelId) return json({ error: 'invalid_ingest_token' }, 401)

  const admission = await admitActiveChannel(env, channelId)
  if (!admission.ok) return json({ error: admission.error }, 429)
  if (admission.evictedChannelId) await revokeChannelPairing(env, admission.evictedChannelId)

  const response: ResponseBody<'getPairTokenStatus', 200> = { paired: true, channelId }
  return json(response)
}
