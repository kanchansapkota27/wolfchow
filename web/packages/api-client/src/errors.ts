/**
 * Thrown for any non-2xx response. Carries the HTTP status, the parsed response
 * body, and — when the backend used the standard `{ error, code? }` shape — a
 * machine-readable `code` for callers to branch on.
 */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly code: string | undefined

  constructor(status: number, body: unknown) {
    const code = extractCode(body)
    super(code ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.code = code
  }
}

function extractCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: unknown }).error
    if (typeof err === 'string') return err
  }
  return undefined
}
