import type { OperationHandler, ResponseBody } from '../lib/types'
import { text } from '../lib/responses'

/**
 * getHealth: returns text/plain per spec.
 */
export const handleGetHealthOperation: OperationHandler<'getHealth', 'text/plain'> = async () => {
  const body: ResponseBody<'getHealth', 200, 'text/plain'> = 'ok'
  return text(body)
}
