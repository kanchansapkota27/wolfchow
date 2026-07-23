import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { Order } from '@wolfchow/types'
import { useOrders } from './useOrders'
import { makeTestQueryClient } from './test-utils'

// ── Mock API ──────────────────────────────────────────────────────────────────

const mockListActive = vi.fn()
const mockAcceptOrder = vi.fn()
const mockRejectOrder = vi.fn()
const mockUpdateOrderStatus = vi.fn()
const mockGetOrder = vi.fn()

vi.mock('./api', () => ({
  useApi: () => ({
    orders: {
      listActive: mockListActive,
      acceptOrder: mockAcceptOrder,
      rejectOrder: mockRejectOrder,
      updateOrderStatus: mockUpdateOrderStatus,
      getOrder: mockGetOrder,
    },
  }),
}))

// ── Mock realtime ─────────────────────────────────────────────────────────────

type RealtimeHandler = (event: string, payload: Record<string, unknown>) => void
let handlers: Map<string, Set<RealtimeHandler>>

vi.mock('./realtime', () => ({
  useRealtime: () => ({
    status: 'connected',
    connected: true,
    subscribe: (event: string, handler: RealtimeHandler) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
      return () => {
        handlers.get(event)?.delete(handler)
      }
    },
  }),
}))

function fireEvent(event: string, payload: Record<string, unknown>) {
  handlers.get(event)?.forEach((h) => h(event, payload))
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NEW_ORDER: Order = {
  id: 'order-1',
  restaurant_id: 'rest-1',
  tracking_token: 'ord_live_abc',
  status: 'auth_success',
  payment_method: 'card',
  payment_status: 'authorized',
  stripe_intent_id: 'pi_test_123',
  stripe_amount_authorized: 2700,
  accept_deadline_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  auto_accept: false,
  scheduled_for: null,
  customer_name: 'Alice Smith',
  customer_email: 'alice@example.com',
  customer_phone: '+1-555-0100',
  marketing_consent: false,
  marketing_consent_at: null,
  tip_amount: 200,
  promo_id: null,
  promo_discount: 0,
  subtotal: 2400,
  tax_amount: 100,
  tax_rate: 0.1,
  tax_inclusive: false,
  total: 2700,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [],
}

function renderUseOrders() {
  const client = makeTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return renderHook(() => useOrders(), { wrapper })
}

// Flushes pending microtasks (promise resolutions from the query/mutation
// machinery) without touching fake timers -- safe to use while fake timers
// are active, unlike `waitFor`, which polls via a real/faked interval and
// deadlocks once `vi.useFakeTimers()` is in effect.
async function flushMicrotasks(times = 20) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  handlers = new Map()
  mockListActive.mockResolvedValue([NEW_ORDER])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('STORY-082 · useOrders scheduling invariants', () => {
  it('never refetches passively on window focus, reconnect, or remount', async () => {
    const { result, rerender, unmount } = renderUseOrders()

    await flushMicrotasks()
    expect(result.current.loading).toBe(false)
    expect(mockListActive).toHaveBeenCalledTimes(1)

    // Simulate a window focus event -- TanStack Query's default
    // refetchOnWindowFocus listens on 'visibilitychange'/'focus'.
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flushMicrotasks()
    expect(mockListActive).toHaveBeenCalledTimes(1)

    // Simulate a reconnect event.
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await flushMicrotasks()
    expect(mockListActive).toHaveBeenCalledTimes(1)

    // Simulate a remount (new component instance reusing the same query
    // client / cache) -- refetchOnMount: false must keep this from
    // triggering another network call for already-cached data.
    rerender()
    await flushMicrotasks()
    expect(mockListActive).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('schedules the auto-reject timer exactly once per order, even after a realtime cache update', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    const { result } = renderUseOrders()

    await flushMicrotasks()
    expect(result.current.loading).toBe(false)
    expect(result.current.newOrders).toHaveLength(1)
    // The initial fetch's schedule-once effect should have registered
    // exactly one auto-reject timer for the one auth_success order (other
    // setTimeout calls may originate from React Query's own internals, e.g.
    // batching/retry scheduling, so we isolate calls whose delay matches the
    // ~5 minute auto-reject deadline rather than counting all setTimeout use).
    function autoRejectTimerCalls() {
      return setTimeoutSpy.mock.calls.filter(([, delay]) => {
        const ms = typeof delay === 'number' ? delay : Number(delay)
        return ms > 4 * 60_000 && ms <= 5 * 60_000
      })
    }
    expect(autoRejectTimerCalls()).toHaveLength(1)

    // A realtime status-changed event updates the cached order (e.g. a
    // no-op status echo) -- this rewrites the `orders` array reference,
    // which is exactly the situation the initialScheduleDone ref guards
    // against re-triggering scheduling for.
    act(() => {
      fireEvent('order_status_changed', { order_id: NEW_ORDER.id, new_status: 'auth_success' })
    })
    await flushMicrotasks()

    // No new auto-reject setTimeout should have been registered as a
    // result of the cache update.
    expect(autoRejectTimerCalls()).toHaveLength(1)

    // Advance to the deadline: the auto-reject timer scheduled once
    // (during the initial fetch) should fire exactly once.
    mockRejectOrder.mockResolvedValue(undefined)
    act(() => {
      vi.advanceTimersByTime(5 * 60_000 + 1000)
    })
    await flushMicrotasks()

    expect(mockRejectOrder).toHaveBeenCalledTimes(1)
    expect(mockRejectOrder).toHaveBeenCalledWith(NEW_ORDER.id, 'auto_reject')
    expect(autoRejectTimerCalls()).toHaveLength(1)

    setTimeoutSpy.mockRestore()
  })
})
