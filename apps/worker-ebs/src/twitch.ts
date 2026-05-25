import { SignJWT } from "jose";
import type { Env } from "./types";

export class PubSubBroadcastError extends Error {
  constructor(
    public readonly kind: "transient" | "rejected",
    public readonly upstreamStatus?: number
  ) {
    super(
      upstreamStatus
        ? `pubsub_${kind}:${upstreamStatus}`
        : `pubsub_${kind}`
    );
  }
}

/** Build EBS JWT for Extensions PubSub (role=external). */
export async function buildEbsJwt(
  env: Env,
  channelId: string,
  ttlSeconds = 60
): Promise<string> {
  const secret = Uint8Array.from(atob(env.EXT_SHARED_SECRET), (c) =>
    c.charCodeAt(0)
  );
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: "external",
    user_id: env.EXT_OWNER_USER_ID,
    channel_id: channelId,
    pubsub_perms: { send: ["broadcast"] }
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function sendPubSubBroadcastOnce(env: Env, channelId: string, message: string) {
  let jwt: string;
  try {
    jwt = await buildEbsJwt(env, channelId);
  } catch {
    throw new PubSubBroadcastError("rejected");
  }

  const res = await fetch("https://api.twitch.tv/helix/extensions/pubsub", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${jwt}`,
      "Client-Id": String(env.EXT_CLIENT_ID),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      broadcaster_id: channelId,
      target: ["broadcast"],
      message
    })
  });

  if (res.ok) return;

  throw new PubSubBroadcastError(
    isRetryableStatus(res.status) ? "transient" : "rejected",
    res.status
  );
}

/** Send a broadcast message to all viewers in a channel. Message must be a string ≤ 5 KB. */
export async function sendPubSubBroadcast(env: Env, channelId: string, message: string) {
  const backoffMs = [250, 750];
  let lastError: unknown;

  for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
    try {
      await sendPubSubBroadcastOnce(env, channelId, message);
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof PubSubBroadcastError && error.kind === "rejected") throw error;
      if (attempt === backoffMs.length) break;
      await delay(backoffMs[attempt]);
    }
  }

  if (lastError instanceof PubSubBroadcastError) throw lastError;
  throw new PubSubBroadcastError("transient");
}
