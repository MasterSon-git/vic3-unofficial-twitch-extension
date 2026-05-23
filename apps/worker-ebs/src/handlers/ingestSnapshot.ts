import type { OperationHandler, RequestBodyJson, ResponseBody } from '../lib/types'
import { json } from '../lib/responses'
import { sendPubSubBroadcast } from '../twitch'
import { admitActiveChannel } from '../lib/activeSessions'
import { revokeChannelPairing, validateIngestToken } from '../lib/pairings'

function numberFromEnv(value: string | number | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function encodedSize(value: string) {
  return new TextEncoder().encode(value).length
}

/**
 * ingestSnapshot: POST /ingest
 */
export const handleIngestSnapshotOperation: OperationHandler<'ingestSnapshot'> = async ({
  requestBody,
  requestHeaders,
  env,
}) => {
  const snapshot: RequestBodyJson<'ingestSnapshot'> = requestBody
  const token = requestHeaders['x-ingest-token']
  if (!token) return json({ error: 'missing_ingest_token' }, 401)

  const channelId = await validateIngestToken(env, token)
  if (!channelId) return json({ error: 'invalid_ingest_token' }, 401)
  if (snapshot.channelId !== channelId) return json({ error: 'channel_mismatch' }, 400)
  const admission = await admitActiveChannel(env, channelId)
  if (!admission.ok) return json({ error: admission.error }, 429)
  if (admission.evictedChannelId) await revokeChannelPairing(env, admission.evictedChannelId)

  const metaKey = `meta:${channelId}`
  const meta = (await env.KV.get(metaKey, { type: 'json' })) as {
    ts?: number
    seq?: number
    saveHash?: string
  } | null

  const now = Date.now()
  const lastAcceptedAt = meta?.ts ?? 0
  const lastSeq = meta?.seq ?? -1
  const lastSaveHash = meta?.saveHash ?? ''

  if (snapshot.seq <= lastSeq) return json({ error: 'stale_sequence', lastSeq }, 409)
  if (snapshot.saveHash === lastSaveHash) return json({ error: 'needs_new_autosave' }, 409)

  const baseIntervalMs = numberFromEnv(env.INGEST_BASE_INTERVAL_MS, 300000)
  const elapsedMs = now - lastAcceptedAt
  if (elapsedMs < baseIntervalMs) {
    return json({ error: 'too_soon', retryInMs: baseIntervalMs - elapsedMs }, 429)
  }

  const message = JSON.stringify({ type: 'vic3:snapshot', payload: snapshot })
  if (encodedSize(message) > 4800) {
    return json(
      { error: 'payload_too_large', hint: 'Reduce the broadcasted snapshot size below the Twitch PubSub limit.' },
      413
    )
  }

  await env.KV.put(metaKey, JSON.stringify({ ts: now, seq: snapshot.seq, saveHash: snapshot.saveHash }), {
    expirationTtl: 24 * 3600,
  })

  try {
    await sendPubSubBroadcast(env, channelId, message)
  } catch {
    return json({ error: 'pubsub_failed' }, 502)
  }

  const response: ResponseBody<'ingestSnapshot', 200> = { status: 'ok' }
  return json(response)
}
