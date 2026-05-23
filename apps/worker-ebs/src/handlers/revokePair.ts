import type { OperationHandler, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { revokeTokenPairing } from '../lib/pairings'

/**
 * revokePair: POST /pair/revoke
 */
export const handleRevokePairOperation: OperationHandler<'revokePair'> = async ({ requestHeaders, env }) => {
  const token = requestHeaders['x-ingest-token']
  if (!token) return json({ error: 'missing_ingest_token' }, 401)

  const revoked = await revokeTokenPairing(env, token)
  if (!revoked) return json({ error: 'invalid_ingest_token' }, 401)

  const response: ResponseBody<'revokePair', 200> = { status: 'revoked' }
  return json(response)
}
