import type { OperationHandler, RequestBodyJson, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { verifyBroadcasterOrAdminForChannel } from '../lib/twitchAuth'

/**
 * getPairStatus: POST /pair/status
 */
export const handleGetPairStatusOperation: OperationHandler<'getPairStatus'> = async ({
  requestBody,
  requestHeaders,
  env,
}) => {
  const input: RequestBodyJson<'getPairStatus'> = requestBody
  const channelId = input.channelId

  const auth = await verifyBroadcasterOrAdminForChannel(env.EXT_SHARED_SECRET, requestHeaders.authorization, channelId)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  const pairState = (await env.KV.get(`paired:${channelId}`, { type: 'json' })) as {
    pairedAt?: string
  } | null

  const response: ResponseBody<'getPairStatus', 200> = pairState
    ? { paired: true, pairedAt: pairState.pairedAt }
    : { paired: false }

  return json(response)
}
