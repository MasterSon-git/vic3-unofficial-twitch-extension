import type { operations } from '../generated/openapi/types'
import type { Bindings } from '../types'
import type { HandlerResult } from './responses'

/**
 * All operationIds from the OpenAPI spec.
 */
export type OperationId = keyof operations

/**
 * JSON request body type for a given operation (undefined if none).
 */
export type RequestBodyJson<Op extends OperationId> =
  operations[Op] extends { requestBody: { content: { 'application/json': infer Body } } }
    ? Body
    : undefined

/**
 * Generic response body type by content type (defaults to application/json).
 * Pass a different content type for non-JSON responses (e.g. 'text/plain').
 */
export type ResponseBody<
  Op extends OperationId,
  StatusCode extends keyof operations[Op]['responses'] = 200,
  ContentType extends string = 'application/json'
> =
  operations[Op]['responses'][StatusCode] extends {
    content: Record<ContentType, infer R>
  }
    ? R
    : never

/**
 * Path parameters type for a given operation.
 */
export type PathParameters<Op extends OperationId> =
  operations[Op] extends { parameters: { path: infer Params } }
    ? Params
    : Record<string, never>

/**
 * Query parameters type for a given operation.
 */
export type QueryParameters<Op extends OperationId> =
  operations[Op] extends { parameters: { query: infer Query } }
    ? Query
    : Record<string, never>

/**
 * Base handler signature for a single OpenAPI operation.
 * - Response content type defaults to application/json.
 * - Override ResponseContentType for endpoints like getHealth ('text/plain').
 */
export type OperationHandler<
  Op extends OperationId,
  ResponseContentType extends string = 'application/json'
> = (args: {
  requestBody: RequestBodyJson<Op>
  pathParameters: PathParameters<Op>
  queryParameters: QueryParameters<Op>
  requestHeaders: Record<string, string>
  env: Bindings
  executionContext: unknown
}) => Promise<HandlerResult> | HandlerResult

/**
 * Enforce that every operationId has a handler and no extras exist.
 */
export type ExactOperationHandlerMap = { [K in OperationId]: OperationHandler<K, any> }

/**
 * Compile-time assertion utilities (missing/extra keys).
 */
type MissingOperations<HM> = Exclude<OperationId, keyof HM>
type ExtraOperations<HM> = Exclude<keyof HM, OperationId>
export type AssertExactOperationMap<HM> =
  [MissingOperations<HM>] extends [never]
    ? ([ExtraOperations<HM>] extends [never] ? true : never)
    : never
