import type { OperationHandler, RequestBodyJson, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { verifyBroadcasterOrAdminForChannel } from '../lib/twitchAuth'
import { revokeChannelPairing } from '../lib/pairings'

/**
 * revokeChannelPair: POST /pair/revoke/channel
 */
export const handleRevokeChannelPairOperation: OperationHandler<'revokeChannelPair'> = async ({
  requestBody,
  requestHeaders,
  env,
}) => {
  const input: RequestBodyJson<'revokeChannelPair'> = requestBody
  const channelId = input.channelId

  const auth = await verifyBroadcasterOrAdminForChannel(env.EXT_SHARED_SECRET, requestHeaders.authorization, channelId)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  await revokeChannelPairing(env, channelId)

  const response: ResponseBody<'revokeChannelPair', 200> = { status: 'revoked' }
  return json(response)
}
