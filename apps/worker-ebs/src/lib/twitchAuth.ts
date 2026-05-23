import { jwtVerify } from 'jose'

export type ExtJwtPayload = {
  channel_id?: string
  role?: string
}

export type ExtensionAuthResult =
  | { ok: true; payload: ExtJwtPayload }
  | { ok: false; status: 400 | 401 | 403; error: string }

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

export async function verifyBroadcasterOrAdminForChannel(
  secretBase64: string,
  authHeader: string | undefined,
  channelId: string
): Promise<ExtensionAuthResult> {
  let payload: ExtJwtPayload
  try {
    if (!authHeader?.startsWith('Bearer ')) throw new Error('missing_bearer')
    const token = authHeader.slice('Bearer '.length).trim()
    const verified = await jwtVerify(token, base64ToBytes(secretBase64), { algorithms: ['HS256'] })
    payload = verified.payload as ExtJwtPayload
  } catch {
    return { ok: false, status: 401, error: 'invalid_twitch_jwt' }
  }

  if (payload.channel_id !== channelId) return { ok: false, status: 400, error: 'channel_mismatch' }
  if (payload.role !== 'broadcaster' && payload.role !== 'admin') {
    return { ok: false, status: 403, error: 'forbidden' }
  }

  return { ok: true, payload }
}
