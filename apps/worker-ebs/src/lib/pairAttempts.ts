import type { Bindings } from '../types'

const maxPairAttempts = 3
const ttlSeconds = 10 * 60

function attemptsKey(code: string) {
  return `pair_attempts:${code}`
}

export async function isPairCodeLocked(env: Bindings, code: string) {
  const attempts = Number((await env.KV.get(attemptsKey(code))) ?? '0')
  return attempts >= maxPairAttempts
}

export async function recordPairCodeFailure(env: Bindings, code: string) {
  const key = attemptsKey(code)
  const attempts = Number((await env.KV.get(key)) ?? '0') + 1
  await env.KV.put(key, String(attempts), { expirationTtl: ttlSeconds })
}

export async function clearPairCodeFailures(env: Bindings, code: string) {
  await env.KV.delete(attemptsKey(code))
}
