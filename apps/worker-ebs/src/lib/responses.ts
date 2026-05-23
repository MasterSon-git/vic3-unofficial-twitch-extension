export type HandlerResult = {
  body: unknown
  status: number
  contentType: 'application/json' | 'text/plain'
}

export function json(body: unknown, status = 200): HandlerResult {
  return {
    body,
    status,
    contentType: 'application/json',
  }
}

export function text(body: string, status = 200): HandlerResult {
  return {
    body,
    status,
    contentType: 'text/plain',
  }
}
