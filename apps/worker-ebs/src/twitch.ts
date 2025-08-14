import { SignJWT } from "jose";
import type { Env } from "./types";

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

/** Send a broadcast message to all viewers in a channel. Message must be a string ≤ 5 KB. */
export async function sendPubSubBroadcast(env: Env, channelId: string, message: string) {
  const jwt = await buildEbsJwt(env, channelId);
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PubSub failed ${res.status}: ${text}`);
  }
}
