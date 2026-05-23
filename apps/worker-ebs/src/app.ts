import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { Context } from 'hono'
import Ajv from 'ajv'
import type { AnySchema } from 'ajv'
import spec from '../../../spec/openapi.json' with { type: 'json' }
import { operationHandlers } from './handlers'
import { workerRoutes } from './generated/openapi/routes'
import type { OperationHandler } from './lib/types'
import type { HandlerResult } from './lib/responses'
import type { Bindings } from './types'

type AppEnv = { Bindings: Bindings }

const ajv = new Ajv({ allErrors: true, strict: false })
const schemas = ((spec as any).components?.schemas ?? {}) as Record<string, AnySchema>
for (const [name, schema] of Object.entries(schemas)) {
  ajv.addSchema(schema, `#/components/schemas/${name}`)
}

async function readJson(c: Context<AppEnv>) {
  try {
    return await c.req.json()
  } catch {
    return undefined
  }
}

function lowerCaseHeaders(headers: Headers) {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

function searchParamsToRecord(searchParams: URLSearchParams) {
  const out: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    out[key] = value
  })
  return out
}

function schemaByRef(ref: string) {
  const prefix = '#/components/schemas/'
  if (!ref.startsWith(prefix)) throw new Error(`Unsupported schema ref '${ref}'`)
  const schemaName = ref.slice(prefix.length)
  const schema = schemas[schemaName]
  if (!schema) throw new Error(`Unknown schema ref '${ref}'`)
  return schema
}

function isTruthyEnv(value: string | boolean | undefined) {
  return value === true || value === 'true' || value === '1'
}

function isAllowedOrigin(origin: string, env: Bindings) {
  try {
    const url = new URL(origin)
    const isLocalhost = url.hostname === 'localhost'
    const isHttps = url.protocol === 'https:'
    const isTryCloudflare = url.hostname.endsWith('.trycloudflare.com')

    return (
      isLocalhost ||
      (isHttps &&
        (url.hostname.endsWith('.ext-twitch.tv') ||
          url.hostname === 'extension-files.twitch.tv' ||
          (isTryCloudflare && isTruthyEnv(env.ALLOW_TRYCLOUDFLARE_ORIGINS))))
    )
  } catch {
    return false
  }
}

function registerCors(app: Hono<AppEnv>) {
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin') ?? ''
    if (origin && isAllowedOrigin(origin, c.env)) {
      c.header('Access-Control-Allow-Origin', origin)
      c.header('Vary', 'Origin')
      c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-ingest-token')
      c.header('Access-Control-Max-Age', '600')
    }
    if (c.req.method === 'OPTIONS') return c.body(null, 204)
    await next()
  })
}

function validationError(errors: unknown) {
  return { body: { error: 'validation_failed', details: errors }, status: 400, contentType: 'application/json' } satisfies HandlerResult
}

function sendResult(c: Context<AppEnv>, result: HandlerResult) {
  if (result.contentType === 'text/plain') {
    return c.text(String(result.body), result.status as any)
  }

  return c.json(result.body, result.status as any)
}

const app = new Hono<AppEnv>()

app.use('*', logger())
registerCors(app)

for (const route of workerRoutes) {
  const validateBody = route.requestBodySchemaRef
    ? ajv.compile(schemaByRef(route.requestBodySchemaRef))
    : undefined
  const handler = operationHandlers[route.operationId] as OperationHandler<typeof route.operationId>

  app.on(route.method, route.path, async (c) => {
    const requestBody = validateBody ? await readJson(c) : undefined
    if (validateBody && !validateBody(requestBody)) return sendResult(c, validationError(validateBody.errors))

    const url = new URL(c.req.url)
    const result = await handler({
      requestBody,
      pathParameters: c.req.param(),
      queryParameters: searchParamsToRecord(url.searchParams),
      requestHeaders: lowerCaseHeaders(c.req.raw.headers),
      env: c.env,
      executionContext: c.executionCtx,
    } as never)
    return sendResult(c, result)
  })
}

app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app
