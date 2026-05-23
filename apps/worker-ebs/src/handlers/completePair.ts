import type { OperationHandler, RequestBodyJson, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'

/**
 * completePair: POST /pair/complete
 */
export const handleCompletePairOperation: OperationHandler<'completePair'> = async ({ requestBody, env }) => {
  const input: RequestBodyJson<'completePair'> = requestBody
  const code = input.code.trim().toUpperCase()
  if (!code) return json({ error: 'code_missing' }, 400)

  const channelId = await env.KV.get(`pair:${code}`)
  if (!channelId) return json({ error: 'invalid_or_expired_code' }, 400)

  const ingestToken = crypto.randomUUID()
  const expiresIn = 7 * 24 * 3600
  await env.KV.put(`ingest:${ingestToken}`, channelId, { expirationTtl: expiresIn })
  await env.KV.put(`paired:${channelId}`, JSON.stringify({ pairedAt: new Date().toISOString() }), {
    expirationTtl: expiresIn,
  })
  await env.KV.delete(`pair:${code}`)

  const response: ResponseBody<'completePair', 200> = {
    channelId,
    ingestToken,
    expiresIn,
  }
  return json(response)
}
