import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SnapshotSchema, type Snapshot, BootstrapSchema, type Bootstrap } from "./schema";
import { sendPubSubBroadcast } from "./twitch";
import type { Bindings } from "./types";
import { jwtVerify } from "jose";

type ExtJwtPayload = {
  channel_id: string;
  role: string; // "broadcaster" | "viewer" | "admin" ...
  user_id: string;
  exp: number;
  iat: number;
};

async function verifyExtensionJwt(
  env: { EXT_SHARED_SECRET: string },
  authHeader?: string
): Promise<ExtJwtPayload> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("missing_bearer");
  const token = authHeader.slice("Bearer ".length).trim();
  const secret = Uint8Array.from(atob(env.EXT_SHARED_SECRET), (c) =>
    c.charCodeAt(0)
  );
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return payload as unknown as ExtJwtPayload;
}

const app = new Hono<{ Bindings: Bindings }>();

// ---------- CORS ----------
// Allow Twitch extension origins (config & live views)
function isAllowedOrigin(origin: string) {
  try {
    const url = new URL(origin);
    // Twitch hosted assets & extension frames
    if (url.host.endsWith(".ext-twitch.tv")) return true;
    if (url.host === "extension-files.twitch.tv") return true;
    // Optional: allow custom Domain/CDN
    // if (host.endsWith("yourdomain.tld")) return true;
    // Development: localhost
    if (url.hostname === "localhost") return true;
  } catch {}
  return false;
}

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") || c.req.header("origin") || "";
  if (origin && isAllowedOrigin(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    c.header("Access-Control-Max-Age", "600");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  return next();
});

// ---------- Health ----------
app.get("/health", (c) => c.text("ok"));

// ---------- Pairing (broadcaster config view -> code; desktop app -> token) ----------
app.post("/pair/init", async (c) => {
  const channelId = c.req.query("channelId");
  if (!channelId) return c.json({ error: "channelId_missing" }, 400);

  // Verify broadcaster Twitch JWT
  try {
    const jwt = await verifyExtensionJwt(c.env, c.req.header("authorization"));
    if (jwt.role !== "broadcaster" && jwt.role !== "admin")
      return c.json({ error: "forbidden" }, 403);
    if (jwt.channel_id !== channelId)
      return c.json({ error: "channel_mismatch" }, 400);
  } catch {
    return c.json({ error: "invalid_twitch_jwt" }, 401);
  }

  // Enforce active streamer cap
  const max = Number(c.env.MAX_ACTIVE_CHANNELS || 100);
  const activeCount = Number((await c.env.KV.get("active:count")) || "0");
  const alreadyActive = await c.env.KV.get(`active:${channelId}`);
  if (!alreadyActive && activeCount >= max) {
    return c.json({ error: "active_streamers_limit_reached", max }, 403);
  }

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  await c.env.KV.put(`pair:${code}`, channelId, { expirationTtl: 600 });

  if (!alreadyActive) {
    await c.env.KV.put(`active:${channelId}`, "1", { expirationTtl: 86400 });
    await c.env.KV.put("active:count", String(activeCount + 1));
  }

  return c.json({ code, expiresIn: 600 });
});

app.post("/pair/complete", async (c) => {
  const { code } = await c.req.json<{ code: string }>().catch(() => ({ code: "" }));
  if (!code) return c.json({ error: "code_missing" }, 400);
  const channelId = await c.env.KV.get(`pair:${code}`);
  if (!channelId) return c.json({ error: "invalid_or_expired_code" }, 400);

  const token = crypto.randomUUID();
  await c.env.KV.put(`ingest:${token}`, channelId, { expirationTtl: 7 * 24 * 3600 }); // 7 days
  await c.env.KV.delete(`pair:${code}`);
  return c.json({ channelId, ingestToken: token, expiresIn: 7 * 24 * 3600 });
});

// ---------- Ingest (strict: >= 5 min AND new autosave) ----------
app.post("/ingest", zValidator("json", SnapshotSchema), async (c) => {
  const token = c.req.header("x-ingest-token");
  if (!token) return c.json({ error: "missing_ingest_token" }, 401);
  const channelId = await c.env.KV.get(`ingest:${token}`);
  if (!channelId) return c.json({ error: "invalid_ingest_token" }, 401);

  const baseInterval = Number(c.env.INGEST_BASE_INTERVAL_MS || 300000); // 5 min
  const snapshot = await c.req.json<Snapshot>();

  if (snapshot.channelId !== channelId) {
    return c.json({ error: "channel_mismatch" }, 400);
  }

  const metaKey = `meta:${channelId}`;
  const metaRaw = (await c.env.KV.get(metaKey, { type: "json" })) as any | null;
  const now = Date.now();
  const lastTs = metaRaw?.ts ?? 0;
  const lastSeq = metaRaw?.seq ?? -1;
  const lastSave = metaRaw?.save_hash ?? "";

  // Reject non-newer seq
  if (snapshot.seq <= lastSeq) {
    return c.json({ error: "stale_sequence", lastSeq }, 409);
  }

  const since = now - lastTs;
  const isNewAutosave = snapshot.save_hash && snapshot.save_hash !== lastSave;

  // NEW POLICY:
  // 1) must be a NEW autosave
  if (!isNewAutosave) {
    return c.json({ error: "needs_new_autosave" }, 409);
  }
  // 2) and at least 5 minutes since last accepted update
  if (since < baseInterval) {
    return c.json({ error: "too_soon", retryInMs: baseInterval - since }, 429);
  }

  // Store last snapshot for internal use (not exposed publicly)
  const lastKey = `last:${channelId}`;
  await c.env.KV.put(lastKey, JSON.stringify(snapshot), { expirationTtl: 7200 });
  await c.env.KV.put(
    metaKey,
    JSON.stringify({ ts: now, seq: snapshot.seq, save_hash: snapshot.save_hash }),
    { expirationTtl: 86400 }
  );

  // Prepare compact pubsub message (≤ 5 KB)
  const payload = { type: "vic3:snapshot", payload: snapshot };
  const message = JSON.stringify(payload);
  if (new TextEncoder().encode(message).length > 4800) {
    return c.json(
      { error: "payload_too_large", hint: "Use bootstrap dictionaries & reduce per-snapshot size." },
      413
    );
  }

  try {
    await sendPubSubBroadcast(c.env, channelId, message);
    return c.json({ status: "ok" });
  } catch (e: any) {
    return c.json({ error: e.message ?? "pubsub_failed" }, 502);
  }
});

// ---------- Bootstrap dictionaries ----------
app.put("/bootstrap", zValidator("json", BootstrapSchema), async (c) => {
  const token = c.req.header("x-ingest-token");
  if (!token) return c.json({ error: "missing_ingest_token" }, 401);
  const channelId = await c.env.KV.get(`ingest:${token}`);
  if (!channelId) return c.json({ error: "invalid_ingest_token" }, 401);

  const bootstrap = await c.req.json<Bootstrap>();
  const key = `boot:${channelId}`;
  const etag = `W/"${bootstrap.version}"`;
  await c.env.KV.put(key, JSON.stringify(bootstrap), { expirationTtl: 30 * 24 * 3600 });
  return new Response(null, { status: 204, headers: { ETag: etag } });
});

app.get("/bootstrap/:channelId", async (c) => {
  const { channelId } = c.req.param();
  const key = `boot:${channelId}`;
  const data = await c.env.KV.get(key);
  if (!data) return c.json({ error: "not_found" }, 404);
  const version = (JSON.parse(data) as Bootstrap).version;
  const etag = `W/"${version}"`;
  if (c.req.header("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "public, max-age=86400" }
    });
  }
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      "Cache-Control": "public, max-age=86400"
    }
  });
});

export default app;
