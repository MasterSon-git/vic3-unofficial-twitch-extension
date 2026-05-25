import type { Bindings } from '../types'
import { activeSessionTtlSeconds } from './lifetimes'

type AdmitResult =
  | { ok: true; evictedChannelId?: string }
  | { ok: false; error: 'active_streamers_limit_reached' }

function numberFromEnv(value: string | number | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function reservedChannelIds(env: Bindings) {
  return new Set(
    (env.RESERVED_CHANNEL_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )
}

function isReservedChannel(env: Bindings, channelId: string) {
  return reservedChannelIds(env).has(channelId)
}

function pairingState(env: Bindings) {
  return env.PAIRING_STATE.get(env.PAIRING_STATE.idFromName('global'))
}

async function activeStateRequest<T>(env: Bindings, path: string, channelId: string): Promise<T> {
  const maxActiveChannels = numberFromEnv(env.MAX_ACTIVE_CHANNELS, 100)
  const reserved = isReservedChannel(env, channelId)
  const response = await pairingState(env).fetch(`https://pairing-state.local${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channelId, maxActiveChannels, reserved, ttlSeconds: activeSessionTtlSeconds }),
  })
  if (!response.ok) throw new Error(`Active session state request failed: ${response.status}`)
  return (await response.json()) as T
}

export async function admitActiveChannel(env: Bindings, channelId: string): Promise<AdmitResult> {
  return activeStateRequest<AdmitResult>(env, '/active/admit', channelId)
}

export async function canAdmitActiveChannel(env: Bindings, channelId: string) {
  const response = await activeStateRequest<{ ok: boolean }>(env, '/active/can-admit', channelId)
  return response.ok
}
