import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Orders } from './Orders'
import type { Order, OrderItem } from '@wolfchow/types'
import type { PauseState } from '@wolfchow/api-client'

// ── Mock API ──────────────────────────────────────────────────────────────────

const mockListActive = vi.fn()
const mockAcceptOrder = vi.fn()
const mockRejectOrder = vi.fn()
const mockGetPauseState = vi.fn()
const mockPauseOrders = vi.fn()
const mockUnpauseOrders = vi.fn()
const mockGetAutomationConfig = vi.fn()
const mockListTransactions = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    orders: {
      listActive: mockListActive,
      acceptOrder: mockAcceptOrder,
      rejectOrder: mockRejectOrder,
    },
    admin: {
      getPauseState: mockGetPauseState,
      pauseOrders: mockPauseOrders,
      unpauseOrders: mockUnpauseOrders,
      getAutomationConfig: mockGetAutomationConfig,
      listTransactions: mockListTransactions,
    },
  }),
}))

// ── Mock realtime ─────────────────────────────────────────────────────────────

type RealtimeHandler = (event: { eventType: string; new: Order }) => void
let _realtimeHandler: RealtimeHandler | null = null

vi.mock('../lib/realtime', () => ({
  subscribeToOrders: (_restaurantId: string, handler: RealtimeHandler) => {
    _realtimeHandler = handler
    return () => { _realtimeHandler = null }
  },
}))

// ── Mock auth ─────────────────────────────────────────────────────────────────

vi.mock('@wolfchow/auth', () => ({
  useAuth: () => ({ restaurantId: 'rest-1' }),
}))

// ── Mock UI ───────────────────────────────────────────────────────────────────

vi.mock('@wolfchow/ui', () => ({
  Button: ({ children, onClick, loading, disabled, type, variant }: {
    children: React.ReactNode
    onClick?: () => void
    loading?: boolean
    disabled?: boolean
    type?: string
    variant?: string
  }) => (
    <button onClick={onClick} disabled={disabled ?? loading} type={type as 'button' | 'submit' | 'reset' | undefined} data-variant={variant}>{children}</button>
  ),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ITEM: OrderItem & { name: string } = {
  id: 'item-1',
  order_id: 'order-1',
  restaurant_id: 'rest-1',
  item_id: 'menu-item-1',
  item_name: 'Margherita Pizza',
  variant_id: null,
  variant_name: null,
  name: 'Margherita Pizza',
  quantity: 2,
  unit_price: 1200,
  modifiers: [{ group_id: 'g1', option_id: 'o1', name: 'Extra cheese', price_delta: 100 }],
  notes: 'Well done',
}

const ACTIVE_ORDER: Order = {
  id: 'order-1',
  restaurant_id: 'rest-1',
  tracking_token: 'ord_live_abc',
  status: 'auth_success',
  payment_method: 'card',
  payment_status: 'authorized',
  stripe_intent_id: 'pi_test_123',
  stripe_amount_authorized: 2700,
  accept_deadline_at: null,
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
  notes: 'Please ring bell',
  created_at: new Date(Date.now() - 120000).toISOString(),
  updated_at: new Date().toISOString(),
  items: [ITEM],
}

const NOT_PAUSED: PauseState = {
  orders_paused: false,
  pause_mode: null,
  pause_until: null,
  pause_reason: null,
  pause_scheduled_orders: false,
}

const PAUSED_TIMED: PauseState = {
  orders_paused: true,
  pause_mode: 'timed',
  pause_until: new Date(Date.now() + 900000).toISOString(), // 15 min from now
  pause_reason: 'Kitchen busy',
  pause_scheduled_orders: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  _realtimeHandler = null
  mockListActive.mockResolvedValue([ACTIVE_ORDER])
  mockGetPauseState.mockResolvedValue(NOT_PAUSED)
  mockGetAutomationConfig.mockResolvedValue({ auto_accept: false, auto_reject_enabled: false, auto_reject_minutes: 15 })
  mockListTransactions.mockResolvedValue({ transactions: [], total: 0, page: 1, page_size: 50, history_days: 30 })
})

describe('STORY-057 · admin orders dashboard', () => {
  it('Realtime: new order card appears without refresh', async () => {
    mockListActive.mockResolvedValue([])
    render(<Orders />)
    await screen.findByText('No active orders')
    expect(_realtimeHandler).toBeTruthy()
    const newOrder: Order = { ...ACTIVE_ORDER, id: 'order-99', customer_name: 'Bob Jones' }
    act(() => {
      _realtimeHandler?.({ eventType: 'INSERT', new: newOrder })
    })
    await waitFor(() => expect(screen.getByText('Bob Jones')).toBeTruthy())
  })

  it('pause timed: banner shown with countdown', async () => {
    mockGetPauseState.mockResolvedValue(PAUSED_TIMED)
    render(<Orders />)
    await waitFor(() => expect(screen.getByText(/Orders paused/)).toBeTruthy())
    // Should show some countdown (minutes remaining)
    expect(screen.getByText(/remaining/)).toBeTruthy()
    expect(screen.getByLabelText('Unpause orders')).toBeTruthy()
  })

  it('unpause: banner disappears', async () => {
    mockGetPauseState.mockResolvedValue(PAUSED_TIMED)
    mockUnpauseOrders.mockResolvedValue(NOT_PAUSED)
    render(<Orders />)
    const unpauseBtn = await screen.findByLabelText('Unpause orders')
    fireEvent.click(unpauseBtn)
    await waitFor(() => expect(mockUnpauseOrders).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/Orders paused/)).toBeNull())
  })

  it('expand card: full items + modifiers shown', async () => {
    render(<Orders />)
    await screen.findByText('Alice Smith')
    const expandBtn = screen.getByLabelText(/Expand order/)
    fireEvent.click(expandBtn)
    await waitFor(() => expect(screen.getAllByText(/Margherita Pizza/).length).toBeGreaterThan(0))
    expect(screen.getByText(/Extra cheese/)).toBeTruthy()
    expect(screen.getByText(/Well done/)).toBeTruthy()
  })

  it('accept order: calls acceptOrder and updates status', async () => {
    const acceptedOrder: Order = { ...ACTIVE_ORDER, status: 'accepted' }
    mockAcceptOrder.mockResolvedValue(acceptedOrder)
    render(<Orders />)
    await screen.findByText('Alice Smith')
    fireEvent.click(screen.getByText('Accept'))
    await waitFor(() => expect(mockAcceptOrder).toHaveBeenCalledWith('order-1'))
  })

  it('reject order: calls rejectOrder and removes from active feed', async () => {
    const rejectedOrder: Order = { ...ACTIVE_ORDER, status: 'rejected' }
    mockRejectOrder.mockResolvedValue(rejectedOrder)
    render(<Orders />)
    await screen.findByText('Alice Smith')
    fireEvent.click(screen.getByText('Reject'))
    await waitFor(() => expect(mockRejectOrder).toHaveBeenCalledWith('order-1'))
    await waitFor(() => expect(screen.queryByText('Alice Smith')).toBeNull())
  })

  it('pause timed 15m: calls pauseOrders with correct args', async () => {
    mockPauseOrders.mockResolvedValue(PAUSED_TIMED)
    render(<Orders />)
    await screen.findByText('Pause orders')
    fireEvent.click(screen.getByText('Pause orders'))
    await screen.findByText('15 min')
    fireEvent.click(screen.getByText('15 min'))
    await waitFor(() => expect(mockPauseOrders).toHaveBeenCalledWith({ mode: 'timed', duration_minutes: 15 }))
  })

  it('auto-accept chip shown when enabled', async () => {
    mockGetAutomationConfig.mockResolvedValue({ auto_accept: true, auto_reject_enabled: false, auto_reject_minutes: 15 })
    render(<Orders />)
    await screen.findByText('Auto-accept on')
  })

  it('history tab: loads completed orders from transactions', async () => {
    mockListTransactions.mockResolvedValue({
      transactions: [{ ...ACTIVE_ORDER, status: 'completed', total_cents: 2700 }],
      total: 1, page: 1, page_size: 50, history_days: 30,
    })
    render(<Orders />)
    await screen.findByText('Active (1)')
    fireEvent.click(screen.getByText('History'))
    await waitFor(() => expect(mockListTransactions).toHaveBeenCalled())
  })
})
