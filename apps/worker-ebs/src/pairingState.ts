type ChannelPairing = {
  token: string
  pairedAt: string
  expiresAt: string
}

type SavePairingRequest = {
  channelId: string
  token: string
  ttlSeconds: number
}

type TokenRequest = {
  token: string
}

type ChannelRequest = {
  channelId: string
}

type RevokeTokenResponse = {
  revoked: boolean
}

type ActiveSession = {
  channelId: string
  pairedAt: string
  lastSeenAt: string
  activeUntil?: string
  expiresAt?: string
  reserved: boolean
}

type ActiveSessionRequest = {
  channelId: string
  maxActiveChannels: number
  reserved: boolean
  ttlSeconds: number
}

function channelKey(channelId: string) {
  return `channel:${channelId}`
}

function tokenKey(token: string) {
  return `token:${token}`
}

const activeSessionsKey = 'active:channels:v2'

function isExpired(pairing: ChannelPairing) {
  return Date.parse(pairing.expiresAt) <= Date.now()
}

async function readJson<T>(request: Request) {
  return (await request.json()) as T
}

export class PairingState {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url)

    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 })

    switch (url.pathname) {
      case '/save':
        return this.savePairing(await readJson<SavePairingRequest>(request))
      case '/status':
        return this.getStatus(await readJson<ChannelRequest>(request))
      case '/validate-token':
        return this.validateToken(await readJson<TokenRequest>(request))
      case '/revoke-token':
        return this.revokeToken(await readJson<TokenRequest>(request))
      case '/revoke-channel':
        return this.revokeChannel(await readJson<ChannelRequest>(request))
      case '/active/admit':
        return this.admitActiveChannel(await readJson<ActiveSessionRequest>(request))
      case '/active/can-admit':
        return this.canAdmitActiveChannel(await readJson<ActiveSessionRequest>(request))
      default:
        return Response.json({ error: 'not_found' }, { status: 404 })
    }
  }

  private async savePairing(input: SavePairingRequest) {
    const existing = await this.state.storage.get<ChannelPairing>(channelKey(input.channelId))
    if (existing?.token && existing.token !== input.token) await this.state.storage.delete(tokenKey(existing.token))

    const pairedAt = new Date().toISOString()
    const pairing: ChannelPairing = {
      token: input.token,
      pairedAt,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
    }

    await this.state.storage.put(channelKey(input.channelId), pairing)
    await this.state.storage.put(tokenKey(input.token), input.channelId)

    return Response.json({ paired: true, pairedAt })
  }

  private async getStatus(input: ChannelRequest) {
    const pairing = await this.state.storage.get<ChannelPairing>(channelKey(input.channelId))
    if (!pairing) return Response.json({ paired: false })

    if (isExpired(pairing)) {
      await this.deletePairing(input.channelId, pairing)
      return Response.json({ paired: false })
    }

    return Response.json({ paired: true, pairedAt: pairing.pairedAt })
  }

  private async validateToken(input: TokenRequest) {
    const channelId = await this.state.storage.get<string>(tokenKey(input.token))
    if (!channelId) return Response.json({ channelId: null })

    const pairing = await this.state.storage.get<ChannelPairing>(channelKey(channelId))
    if (!pairing || pairing.token !== input.token || isExpired(pairing)) {
      await this.state.storage.delete(tokenKey(input.token))
      if (pairing && isExpired(pairing)) await this.deletePairing(channelId, pairing)
      return Response.json({ channelId: null })
    }

    return Response.json({ channelId })
  }

  private async revokeToken(input: TokenRequest) {
    const channelId = await this.state.storage.get<string>(tokenKey(input.token))
    if (!channelId) return Response.json({ revoked: false } satisfies RevokeTokenResponse)

    const pairing = await this.state.storage.get<ChannelPairing>(channelKey(channelId))
    if (pairing) await this.deletePairing(channelId, pairing)
    else {
      await this.state.storage.delete(tokenKey(input.token))
      await this.deleteActiveChannel(channelId)
    }

    return Response.json({ revoked: true } satisfies RevokeTokenResponse)
  }

  private async revokeChannel(input: ChannelRequest) {
    const pairing = await this.state.storage.get<ChannelPairing>(channelKey(input.channelId))
    if (pairing) await this.deletePairing(input.channelId, pairing)
    else await this.state.storage.delete(channelKey(input.channelId))

    return Response.json({ revoked: true })
  }

  private async deletePairing(channelId: string, pairing: ChannelPairing) {
    await this.state.storage.delete(tokenKey(pairing.token))
    await this.state.storage.delete(channelKey(channelId))
    await this.deleteActiveChannel(channelId)
  }

  private async readActiveSessions(): Promise<ActiveSession[]> {
    const sessions = (await this.state.storage.get<ActiveSession[]>(activeSessionsKey)) ?? []
    return Array.isArray(sessions) ? sessions : []
  }

  private isActiveSession(session: ActiveSession, ttlSeconds?: number) {
    if (!session.channelId) return false

    const pairedAt = Date.parse(session.pairedAt)
    const activeUntil =
      session.activeUntil ??
      session.expiresAt ??
      (Number.isFinite(pairedAt) && ttlSeconds
        ? new Date(pairedAt + ttlSeconds * 1000).toISOString()
        : undefined)

    if (!activeUntil) return false
    return Date.parse(activeUntil) > Date.now()
  }

  private async loadActiveSessions(ttlSeconds?: number): Promise<ActiveSession[]> {
    const sessions = await this.readActiveSessions()
    return sessions.filter((session) => this.isActiveSession(session, ttlSeconds))
  }

  private async saveActiveSessions(sessions: ActiveSession[]) {
    await this.state.storage.put(activeSessionsKey, sessions)
  }

  private oldestNonReservedIndex(sessions: ActiveSession[]) {
    let index = -1
    for (let i = 0; i < sessions.length; i += 1) {
      if (sessions[i].reserved) continue
      if (index === -1 || sessions[i].lastSeenAt < sessions[index].lastSeenAt) index = i
    }
    return index
  }

  private async admitActiveChannel(input: ActiveSessionRequest) {
    const now = new Date().toISOString()
    const activeUntil = new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
    const sessions = await this.loadActiveSessions(input.ttlSeconds)
    const existing = sessions.find((session) => session.channelId === input.channelId)

    if (existing) {
      existing.lastSeenAt = now
      existing.activeUntil ??= activeUntil
      delete existing.expiresAt
      existing.reserved = input.reserved
      await this.saveActiveSessions(sessions)
      return Response.json({ ok: true })
    }

    if (sessions.length < input.maxActiveChannels) {
      sessions.push({
        channelId: input.channelId,
        pairedAt: now,
        lastSeenAt: now,
        activeUntil,
        reserved: input.reserved,
      })
      await this.saveActiveSessions(sessions)
      return Response.json({ ok: true })
    }

    if (!input.reserved) return Response.json({ ok: false, error: 'active_streamers_limit_reached' })

    const evictedIndex = this.oldestNonReservedIndex(sessions)
    if (evictedIndex === -1) return Response.json({ ok: false, error: 'active_streamers_limit_reached' })

    const [evicted] = sessions.splice(evictedIndex, 1)
    sessions.push({
      channelId: input.channelId,
      pairedAt: now,
      lastSeenAt: now,
      activeUntil,
      reserved: input.reserved,
    })
    await this.saveActiveSessions(sessions)
    return Response.json({ ok: true, evictedChannelId: evicted.channelId })
  }

  private async canAdmitActiveChannel(input: ActiveSessionRequest) {
    const sessions = await this.loadActiveSessions(input.ttlSeconds)
    if (sessions.some((session) => session.channelId === input.channelId)) return Response.json({ ok: true })
    if (sessions.length < input.maxActiveChannels) return Response.json({ ok: true })
    return Response.json({ ok: input.reserved && this.oldestNonReservedIndex(sessions) !== -1 })
  }

  private async deleteActiveChannel(channelId: string) {
    const sessions = await this.readActiveSessions()
    const hadChannel = sessions.some((session) => session.channelId === channelId)
    const remaining = sessions.filter(
      (session) => session.channelId !== channelId && this.isActiveSession(session)
    )
    if (remaining.length === sessions.length) return false
    await this.saveActiveSessions(remaining)
    return hadChannel
  }
}
