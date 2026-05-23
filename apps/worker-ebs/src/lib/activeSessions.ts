import type { Bindings } from '../types'
import { activeSessionTtlSeconds } from './lifetimes'

type ActiveSession = {
  channelId: string
  pairedAt: string
  lastSeenAt: string
  activeUntil?: string
  expiresAt?: string
  reserved: boolean
}

type AdmitResult =
  | { ok: true; evictedChannelId?: string }
  | { ok: false; error: 'active_streamers_limit_reached' }

const activeSessionsKey = 'active:channels:v2'

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

async function loadSessions(env: Bindings): Promise<ActiveSession[]> {
  const sessions = (await env.KV.get(activeSessionsKey, { type: 'json' })) as ActiveSession[] | null
  const now = Date.now()
  return Array.isArray(sessions)
    ? sessions.filter((session) => {
        if (!session.channelId) return false
        const activeUntil =
          session.activeUntil ??
          session.expiresAt ??
          new Date(Date.parse(session.pairedAt) + activeSessionTtlSeconds * 1000).toISOString()
        return Date.parse(activeUntil) > now
      })
    : []
}

async function saveSessions(env: Bindings, sessions: ActiveSession[]) {
  await env.KV.put(activeSessionsKey, JSON.stringify(sessions), { expirationTtl: activeSessionTtlSeconds })
}

function oldestNonReservedIndex(sessions: ActiveSession[]) {
  let index = -1
  for (let i = 0; i < sessions.length; i += 1) {
    if (sessions[i].reserved) continue
    if (index === -1 || sessions[i].lastSeenAt < sessions[index].lastSeenAt) index = i
  }
  return index
}

export async function admitActiveChannel(env: Bindings, channelId: string): Promise<AdmitResult> {
  const now = new Date().toISOString()
  const activeUntil = new Date(Date.now() + activeSessionTtlSeconds * 1000).toISOString()
  const maxActiveChannels = numberFromEnv(env.MAX_ACTIVE_CHANNELS, 100)
  const reserved = isReservedChannel(env, channelId)
  const sessions = await loadSessions(env)
  const existing = sessions.find((session) => session.channelId === channelId)

  if (existing) {
    existing.lastSeenAt = now
    existing.activeUntil ??= activeUntil
    delete existing.expiresAt
    existing.reserved = reserved
    await saveSessions(env, sessions)
    return { ok: true }
  }

  if (sessions.length < maxActiveChannels) {
    sessions.push({ channelId, pairedAt: now, lastSeenAt: now, activeUntil, reserved })
    await saveSessions(env, sessions)
    return { ok: true }
  }

  if (!reserved) return { ok: false, error: 'active_streamers_limit_reached' }

  const evictedIndex = oldestNonReservedIndex(sessions)
  if (evictedIndex === -1) return { ok: false, error: 'active_streamers_limit_reached' }

  const [evicted] = sessions.splice(evictedIndex, 1)
  sessions.push({ channelId, pairedAt: now, lastSeenAt: now, activeUntil, reserved })
  await saveSessions(env, sessions)
  return { ok: true, evictedChannelId: evicted.channelId }
}

export async function canAdmitActiveChannel(env: Bindings, channelId: string) {
  const maxActiveChannels = numberFromEnv(env.MAX_ACTIVE_CHANNELS, 100)
  const reserved = isReservedChannel(env, channelId)
  const sessions = await loadSessions(env)

  if (sessions.some((session) => session.channelId === channelId)) return true
  if (sessions.length < maxActiveChannels) return true
  return reserved && oldestNonReservedIndex(sessions) !== -1
}

export async function removeActiveChannel(env: Bindings, channelId: string) {
  const sessions = await loadSessions(env)
  const remaining = sessions.filter((session) => session.channelId !== channelId)
  if (remaining.length !== sessions.length) await saveSessions(env, remaining)
}
