import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { App } from './App'

// ── Realtime mock ────────────────────────────────────────────────────────────

type RealtimeHandler = (event: string, payload: Record<string, unknown>) => void
const realtimeHandlers = new Map<string, Set<RealtimeHandler>>()

function fireRealtimeEvent(event: string, payload: Record<string, unknown>) {
  act(() => {
    realtimeHandlers.get(event)?.forEach((h) => h(event, payload))
  })
}

vi.mock('@wolfchow/realtime', () => ({
  RealtimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useRealtime: () => ({
    status: 'connected',
    connected: true,
    subscribe: (event: string, handler: RealtimeHandler) => {
      if (!realtimeHandlers.has(event)) realtimeHandlers.set(event, new Set())
      realtimeHandlers.get(event)!.add(handler)
      return () => realtimeHandlers.get(event)?.delete(handler)
    },
  }),
}))

// ── fetch mock ───────────────────────────────────────────────────────────────

const ORDER_ID = 'order-1'
const RESTAURANT_ID = 'rest-1'
const TOKEN = 'tok_test'

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    order_id: ORDER_ID,
    tracking_token: TOKEN,
    restaurant_id: RESTAURANT_ID,
    restaurant_name: 'The Burger Place',
    status: 'preparing',
    payment_method: 'card',
    customer_name: 'Test Customer',
    subtotal: 20,
    promo_discount: 0,
    tax_amount: 0,
    tip_amount: 0,
    total: 20,
    created_at: '2026-07-18T10:00:00.000Z',
    scheduled_for: null,
    estimated_ready: new Date(Date.now() + 10 * 60_000).toISOString(),
    items: [{ id: 'item-1', item_name: 'Burger', variant_name: null, quantity: 1, modifiers: [], notes: null }],
    ...overrides,
  }
}

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  }))
}

function setToken(token: string | null) {
  const search = token ? `?token=${token}` : ''
  window.history.pushState({}, '', `/${search}`)
}

beforeEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  realtimeHandlers.clear()
  setToken(TOKEN)
  document.title = ''
})

describe('STORY-078 · Tracking page realtime status updates', () => {
  it('order_status_changed for this order: stepper advances without a refetch', async () => {
    mockFetchOnce(baseOrder({ status: 'accepted' }))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('order-status').textContent).toBe('Accepted'))

    const fetchSpy = fetch as unknown as ReturnType<typeof vi.fn>
    fetchSpy.mockClear()

    fireRealtimeEvent('order_status_changed', { order_id: ORDER_ID, previous_status: 'accepted', new_status: 'preparing' })

    await waitFor(() => expect(screen.getByTestId('order-status').textContent).toBe('Being prepared'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('event for a different order_id: state unchanged', async () => {
    mockFetchOnce(baseOrder({ status: 'accepted' }))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('order-status').textContent).toBe('Accepted'))

    fireRealtimeEvent('order_status_changed', { order_id: 'some-other-order', previous_status: 'accepted', new_status: 'preparing' })

    expect(screen.getByTestId('order-status').textContent).toBe('Accepted')
  })

  it('order_accepted for this order: status becomes accepted', async () => {
    mockFetchOnce(baseOrder({ status: 'auth_success' }))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('order-status').textContent).toBe('Awaiting confirmation'))

    fireRealtimeEvent('order_accepted', { order_id: ORDER_ID })

    await waitFor(() => expect(screen.getByTestId('order-status').textContent).toBe('Accepted'))
  })

  it('order_rejected for this order: rejected card shown', async () => {
    mockFetchOnce(baseOrder({ status: 'auth_success' }))
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('order-status').textContent).toBe('Awaiting confirmation'))

    fireRealtimeEvent('order_rejected', { order_id: ORDER_ID })

    await waitFor(() => expect(screen.getByTestId('order-status').textContent).toBe('Order not accepted'))
  })

  it('page title updates with status and emoji', async () => {
    mockFetchOnce(baseOrder({ status: 'preparing' }))
    render(<App />)
    await waitFor(() => expect(document.title).toBe('🟡 Being prepared — Your Order | Wolfchow'))
  })

  it('scheduled order not yet activated: pre-step message shown instead of stepper', async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    mockFetchOnce(baseOrder({ status: 'pending_payment', scheduled_for: future }))
    render(<App />)

    await waitFor(() => expect(screen.getByText(/we'll start preparing closer to your scheduled time/i)).toBeTruthy())
  })

  it('restaurant_name and payment_method rendered', async () => {
    mockFetchOnce(baseOrder({ payment_method: 'pickup' }))
    render(<App />)

    await waitFor(() => expect(screen.getByText('The Burger Place')).toBeTruthy())
    expect(screen.getByText('Pay at pickup')).toBeTruthy()
  })
})
