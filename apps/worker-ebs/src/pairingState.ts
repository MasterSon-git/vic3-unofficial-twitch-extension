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

function channelKey(channelId: string) {
  return `channel:${channelId}`
}

function tokenKey(token: string) {
  return `token:${token}`
}

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
    if (!channelId) return Response.json({ revoked: false })

    const pairing = await this.state.storage.get<ChannelPairing>(channelKey(channelId))
    if (pairing) await this.deletePairing(channelId, pairing)
    else await this.state.storage.delete(tokenKey(input.token))

    return Response.json({ revoked: true, channelId })
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
  }
}
