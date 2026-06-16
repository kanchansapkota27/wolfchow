import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'
import { RealtimeService, orderChannel } from './realtime'

interface SendCall {
  channel: string
  message: { type: string; event: string; payload: Record<string, unknown> }
}

/**
 * Fake SupabaseClient recording every `channel(name).send(message)`. `send` can
 * be made slow to prove `broadcast` does not await it. Only the `.channel`
 * surface RealtimeService touches is implemented.
 */
function makeClient(sendDelayMs = 0) {
  const calls: SendCall[] = []
  const client = {
    channel(name: string) {
      return {
        send: async (message: SendCall['message']) => {
          if (sendDelayMs > 0) await new Promise((r) => setTimeout(r, sendDelayMs))
          calls.push({ channel: name, message })
          return 'ok'
        },
      }
    },
  }
  return { calls, client: client as unknown as SupabaseClient }
}

/** ExecutionContext whose waitUntil collects promises so tests can await them. */
function makeCtx() {
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException: () => {},
    props: {},
  }
  return { pending, ctx: ctx as unknown as ExecutionContext }
}

const env = {} as Env

describe('STORY-041 · Realtime broadcast service', () => {
  it('broadcast new_order: correct channel and payload shape', async () => {
    const { calls, client } = makeClient()
    const { pending, ctx } = makeCtx()
    const svc = new RealtimeService(env, client)

    svc.broadcast('r1', 'new_order', { order_id: 'o-1', total: 42 }, ctx)
    await Promise.all(pending)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.channel).toBe(orderChannel('r1'))
    expect(calls[0]?.channel).toBe('orders:r1')
    expect(calls[0]?.message).toEqual({
      type: 'broadcast',
      event: 'new_order',
      payload: { order_id: 'o-1', total: 42 },
    })
  })

  it('response not delayed by broadcast (< 5ms overhead)', async () => {
    const { calls, client } = makeClient(50) // send takes 50ms
    const { pending, ctx } = makeCtx()
    const svc = new RealtimeService(env, client)

    const start = performance.now()
    svc.broadcast('r1', 'order_accepted', { order_id: 'o-1' }, ctx)
    const elapsed = performance.now() - start

    // broadcast returned without awaiting the slow send.
    expect(elapsed).toBeLessThan(5)
    expect(calls).toHaveLength(0)

    // The send completes in the background.
    await Promise.all(pending)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.message.event).toBe('order_accepted')
  })

  it('unknown event type: TypeScript compile error', () => {
    const { client } = makeClient()
    const { ctx } = makeCtx()
    const svc = new RealtimeService(env, client)

    // @ts-expect-error 'not_a_real_event' is not a member of EventType.
    svc.broadcast('r1', 'not_a_real_event', {}, ctx)
    // Reaching here at runtime is fine; the assertion is that the line above
    // would not compile without the @ts-expect-error directive.
    expect(true).toBe(true)
  })
})
