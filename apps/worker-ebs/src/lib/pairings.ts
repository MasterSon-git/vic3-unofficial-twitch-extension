import type { Bindings } from '../types'
import { pairingTtlSeconds } from './lifetimes'

type PairStatus = {
  paired: boolean
  pairedAt?: string
}

type ValidateTokenResponse = {
  channelId: string | null
}

type RevokeTokenResponse = {
  revoked: boolean
}

function pairingState(env: Bindings) {
  return env.PAIRING_STATE.get(env.PAIRING_STATE.idFromName('global'))
}

async function stateRequest<T>(env: Bindings, path: string, body: unknown): Promise<T> {
  const response = await pairingState(env).fetch(`https://pairing-state.local${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Pairing state request failed: ${response.status}`)
  return (await response.json()) as T
}

export async function saveChannelToken(env: Bindings, channelId: string, ingestToken: string) {
  await stateRequest(env, '/save', { channelId, token: ingestToken, ttlSeconds: pairingTtlSeconds })
}

export async function getChannelPairStatus(env: Bindings, channelId: string) {
  return stateRequest<PairStatus>(env, '/status', { channelId })
}

export async function validateIngestToken(env: Bindings, token: string) {
  const response = await stateRequest<ValidateTokenResponse>(env, '/validate-token', { token })
  return response.channelId
}

export async function revokeChannelPairing(env: Bindings, channelId: string) {
  await stateRequest(env, '/revoke-channel', { channelId })
}

export async function revokeTokenPairing(env: Bindings, token: string) {
  const response = await stateRequest<RevokeTokenResponse>(env, '/revoke-token', { token })
  return response.revoked
}
