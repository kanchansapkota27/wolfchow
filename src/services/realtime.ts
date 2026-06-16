import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'
import { createAdminClient } from './supabase'

/**
 * Events pushed to clients over Supabase Realtime. Exhaustive union — adding a
 * call site with an event name not listed here is a compile error, and callers
 * cannot pass an arbitrary string.
 */
export type EventType =
  | 'new_order'
  | 'order_status_changed'
  | 'order_accepted'
  | 'order_rejected'
  | 'menu_availability_changed'
  | 'pause_state_changed'
  | 'notice_created'
  | 'notice_removed'
  | 'closure_updated'

/** Channel a restaurant's clients subscribe to for live order/menu events. */
export function orderChannel(restaurantId: string): string {
  return `orders:${restaurantId}`
}

/**
 * Centralised Realtime broadcaster.
 *
 * Every push goes to the restaurant's `orders:{restaurant_id}` channel via the
 * service-role client. `broadcast` is fire-and-forget: it schedules the send on
 * `ctx.waitUntil` and returns immediately, so the HTTP response is never delayed
 * by — nor failed by — a Realtime hiccup. Workers are stateless and short-lived,
 * so the unsubscribed `channel.send` uses Realtime's HTTP broadcast endpoint
 * rather than holding open a websocket.
 */
export class RealtimeService {
  private readonly client: SupabaseClient

  constructor(env: Env, client?: SupabaseClient) {
    this.client = client ?? createAdminClient(env)
  }

  /** Schedule a broadcast in the background; never awaited in the request path. */
  broadcast(
    restaurantId: string,
    event: EventType,
    payload: Record<string, unknown>,
    ctx: ExecutionContext,
  ): void {
    ctx.waitUntil(this.send(restaurantId, event, payload))
  }

  private async send(
    restaurantId: string,
    event: EventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const channel = this.client.channel(orderChannel(restaurantId))
    await channel.send({ type: 'broadcast', event, payload })
  }
}
