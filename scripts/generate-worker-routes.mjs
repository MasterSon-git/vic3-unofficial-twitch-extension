import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const specPath = resolve(root, 'spec/openapi.json')
const outputPath = resolve(root, 'apps/worker-ebs/src/generated/openapi/routes.ts')

const spec = JSON.parse(await readFile(specPath, 'utf8'))

function honoPath(openApiPath) {
  return openApiPath.replace(/\{([^}]+)\}/g, ':$1')
}

function jsonRequestBodySchemaRef(operation) {
  const schema = operation.requestBody?.content?.['application/json']?.schema
  if (!schema) return undefined
  if (schema.$ref) return schema.$ref
  throw new Error(`Operation '${operation.operationId}' uses an inline JSON request body schema. Use a named component schema.`)
}

const routes = []

for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const method of ['get', 'put', 'post', 'delete', 'patch', 'options', 'head']) {
    const operation = pathItem?.[method]
    if (!operation) continue
    if (!operation.operationId) throw new Error(`${method.toUpperCase()} ${path} is missing operationId`)

    routes.push({
      operationId: operation.operationId,
      method: method.toUpperCase(),
      path: honoPath(path),
      requestBodySchemaRef: jsonRequestBodySchemaRef(operation),
    })
  }
}

routes.sort((a, b) => a.operationId.localeCompare(b.operationId))

const routeLines = routes
  .map(
    (route) =>
      `  ${JSON.stringify(route).replace(/"([^"]+)":/g, '$1:')} as const,`
  )
  .join('\n')

const contents = `// This file was auto-generated from spec/openapi.json.
// Do not make direct changes to this file.

import type { OperationId } from '../../lib/types'

export type GeneratedWorkerRoute = {
  operationId: OperationId
  method: string
  path: string
  requestBodySchemaRef?: string
}

export const workerRoutes = [
${routeLines}
] satisfies readonly GeneratedWorkerRoute[]
`

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, contents, 'utf8')
