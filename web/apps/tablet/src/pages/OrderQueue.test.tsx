import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Order } from '@wolfchow/types'
import { OrderQueue } from './OrderQueue'

const mockAccept = vi.fn().mockResolvedValue(undefined)
const mockReject = vi.fn().mockResolvedValue(undefined)
const mockUpdateStatus = vi.fn().mockResolvedValue(undefined)

let newOrders: Order[] = []
let activeOrders: Order[] = []

vi.mock('../lib/useOrders', () => ({
  useOrders: () => ({
    newOrders,
    activeOrders,
    loading: false,
    accept: mockAccept,
    reject: mockReject,
    updateStatus: mockUpdateStatus,
  }),
}))

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    restaurant_id: 'rest-1',
    status: 'auth_success',
    payment_method: 'pickup',
    customer_name: 'Test Customer',
    total: 12.5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    accept_deadline_at: null,
    scheduled_for: null,
    items: [{ item_name: 'Burger', variant_name: null, quantity: 1, modifiers: [], notes: null }],
    notes: null,
    ...overrides,
  } as Order
}

beforeEach(() => {
  mockAccept.mockClear()
  mockUpdateStatus.mockClear()
  newOrders = []
  activeOrders = []
})

describe('STORY-087 · scheduled orders on the tablet KDS', () => {
  it('ASAP order: Accept immediately advances to preparing', async () => {
    newOrders = [baseOrder({ scheduled_for: null })]
    render(<OrderQueue />)

    await userEvent.click(screen.getByRole('button', { name: /accept/i }))

    expect(mockAccept).toHaveBeenCalledWith('order-1')
    expect(mockUpdateStatus).toHaveBeenCalledWith('order-1', 'preparing')
  })

  it('scheduled order: Accept does NOT advance to preparing', async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    newOrders = [baseOrder({ scheduled_for: future })]
    render(<OrderQueue />)

    await userEvent.click(screen.getByRole('button', { name: /accept/i }))

    expect(mockAccept).toHaveBeenCalledWith('order-1')
    expect(mockUpdateStatus).not.toHaveBeenCalled()
  })

  it('scheduled order sitting in "accepted": shows a scheduled badge and a manual Start Preparing button', () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    activeOrders = [baseOrder({ status: 'accepted', scheduled_for: future })]
    render(<OrderQueue />)

    expect(screen.getByText(/scheduled/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start preparing/i })).toBeInTheDocument()
  })

  it('scheduled order accepted long ago but not yet due: no false "overdue" styling triggers the error-red button', () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    const longAgo = new Date(Date.now() - 60 * 60_000).toISOString()
    activeOrders = [baseOrder({ status: 'accepted', scheduled_for: future, updated_at: longAgo })]
    render(<OrderQueue />)

    const button = screen.getByRole('button', { name: /start preparing/i })
    // Overdue styling uses var(--md-error); scheduled-but-not-due uses the
    // blue accent instead — assert it did NOT fall into the error branch.
    expect(button).toHaveStyle({ background: '#60a5fa' })
  })
})
