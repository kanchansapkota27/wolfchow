/**
 * TenantCounterDO — atomic per-tenant counters via Cloudflare Durable Objects.
 *
 * One instance per restaurant (`idFromName(restaurant_id)`). All mutations for
 * a given tenant are serialised by the DO runtime, so increment-and-check is
 * truly atomic with no race window.
 *
 * Key schema: `{counter}:{period}` e.g. `smtp:2026-07`
 *
 * HTTP interface (all relative to the DO stub origin):
 *   POST /increment  { counter, period, limit }
 *     → 200 { count }   — incremented; count is the new value
 *     → 429 { count, limit } — at/over limit; counter NOT incremented
 *
 *   GET  /read?counter=&period=
 *     → 200 { count }   — current value (0 if absent)
 *
 *   POST /reset  { counter, period }
 *     → 200 { ok: true } — counter deleted (superadmin / test use)
 */
export class TenantCounterDO {
  private readonly state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/increment') {
      return this.handleIncrement(request)
    }
    if (request.method === 'GET' && url.pathname === '/read') {
      return this.handleRead(url)
    }
    if (request.method === 'POST' && url.pathname === '/reset') {
      return this.handleReset(request)
    }

    return new Response('not_found', { status: 404 })
  }

  private async handleIncrement(request: Request): Promise<Response> {
    let body: { counter?: unknown; period?: unknown; limit?: unknown }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }

    const counter = typeof body.counter === 'string' ? body.counter : null
    const period = typeof body.period === 'string' ? body.period : null
    const limit = typeof body.limit === 'number' ? body.limit : null

    if (!counter || !period || limit === null) {
      return json({ error: 'missing_fields' }, 400)
    }

    const key = `${counter}:${period}`

    // Atomic: check and increment inside a single storage transaction.
    // The DO runtime serialises all requests to this instance, so no
    // concurrent increment can slip between the read and the write.
    const result = await this.state.storage.transaction(async (txn) => {
      const current = (await txn.get<number>(key)) ?? 0
      if (current >= limit) {
        return { allowed: false, count: current }
      }
      const next = current + 1
      await txn.put(key, next)
      return { allowed: true, count: next }
    })

    if (!result.allowed) {
      return json({ count: result.count, limit }, 429)
    }

    // Prune old periods for this counter lazily — keep the three most recent.
    void this.pruneOldPeriods(counter, period)

    return json({ count: result.count })
  }

  private async handleRead(url: URL): Promise<Response> {
    const counter = url.searchParams.get('counter')
    const period = url.searchParams.get('period')

    if (!counter || !period) {
      return json({ error: 'missing_fields' }, 400)
    }

    const key = `${counter}:${period}`
    const count = (await this.state.storage.get<number>(key)) ?? 0
    return json({ count })
  }

  private async handleReset(request: Request): Promise<Response> {
    let body: { counter?: unknown; period?: unknown }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }

    const counter = typeof body.counter === 'string' ? body.counter : null
    const period = typeof body.period === 'string' ? body.period : null

    if (!counter || !period) {
      return json({ error: 'missing_fields' }, 400)
    }

    await this.state.storage.delete(`${counter}:${period}`)
    return json({ ok: true })
  }

  /**
   * Prune all but the three most-recent periods for a given counter type.
   * Periods are ISO `YYYY-MM` strings so lexicographic order = chronological.
   */
  private async pruneOldPeriods(counter: string, _currentPeriod: string): Promise<void> {
    const all = await this.state.storage.list<number>({ prefix: `${counter}:` })
    const keys = [...all.keys()].sort()
    if (keys.length <= 3) return
    const toDelete = keys.slice(0, keys.length - 3)
    await this.state.storage.delete(toDelete)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
