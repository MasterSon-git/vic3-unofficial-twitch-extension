import type { ExactOperationHandlerMap, AssertExactOperationMap } from '../lib/types'
import { handleGetHealthOperation } from './getHealth'
import { handleInitPairOperation } from './initPair'
import { handleGetPairStatusOperation } from './getPairStatus'
import { handleCompletePairOperation } from './completePair'
import { handleIngestSnapshotOperation } from './ingestSnapshot'

/**
 * Central registry: keys must match operationId from the spec.
 */
export const operationHandlers = {
  getHealth: handleGetHealthOperation,
  initPair: handleInitPairOperation,
  getPairStatus: handleGetPairStatusOperation,
  completePair: handleCompletePairOperation,
  ingestSnapshot: handleIngestSnapshotOperation,
} satisfies ExactOperationHandlerMap

// Compile-time guard: missing or extra operationIds trigger TS errors.
const _assertExactOperationMap: AssertExactOperationMap<typeof operationHandlers> = true
