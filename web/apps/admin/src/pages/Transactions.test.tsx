import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Transactions } from './Transactions'
import type { TransactionRow, TransactionListResponse } from '@wolfchow/api-client'

const mockListTransactions = vi.fn()
const mockGetTransaction = vi.fn()
const mockRefundTransaction = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      listTransactions: mockListTransactions,
      getTransaction: mockGetTransaction,
      refundTransaction: mockRefundTransaction,
    },
  }),
}))

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

const TX_CARD: TransactionRow = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  status: 'completed',
  total_cents: 2500,
  payment_intent_id: 'pi_test_123',
  created_at: '2026-01-15T12:00:00Z',
  customer_name: 'Alice Smith',
  customer_email: 'alice@example.com',
  refund_id: null,
  refunded_at: null,
}

const TX_CASH: TransactionRow = {
  ...TX_CARD,
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  payment_intent_id: null,
  customer_name: 'Bob Jones',
  customer_email: 'bob@example.com',
}

const TX_OLD: TransactionRow = {
  ...TX_CARD,
  id: 'cccccccc-0000-0000-0000-000000000003',
  created_at: '2025-11-01T10:00:00Z',
  customer_name: 'Old Customer',
}

function makeResponse(txs: TransactionRow[], history_days = 30): TransactionListResponse {
  return { transactions: txs, total: txs.length, page: 1, page_size: 50, history_days }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListTransactions.mockResolvedValue(makeResponse([TX_CARD]))
})

describe('STORY-065 · transaction history & refunds UI', () => {
  it('30-day plan: banner shown when history_days is 30', async () => {
    render(<Transactions />)
    await screen.findByText('Alice Smith')
    expect(screen.getByText(/Showing last 30 days/)).toBeTruthy()
  })

  it('full history plan: banner absent when history_days > 30', async () => {
    mockListTransactions.mockResolvedValue(makeResponse([TX_CARD], 90))
    render(<Transactions />)
    await screen.findByText('Alice Smith')
    expect(screen.queryByText(/Showing last 30 days/)).toBeNull()
  })

  it('full refund: amount pre-filled, on confirm status updates', async () => {
    const refundedTx: TransactionRow = { ...TX_CARD, status: 'refunded', refund_id: 're_test_456', refunded_at: '2026-01-15T13:00:00Z' }
    mockRefundTransaction.mockResolvedValue(refundedTx)
    render(<Transactions />)
    await screen.findByText('Alice Smith')
    // click row to open detail
    fireEvent.click(screen.getByLabelText('Transaction AAAAAAAA'))
    const panel = await screen.findByLabelText('Transaction detail')
    expect(panel).toBeTruthy()
    // click Issue refund
    fireEvent.click(screen.getByText('Issue refund'))
    const modal = await screen.findByRole('dialog', { name: 'Refund order' })
    // full refund mode pre-selected, shows total amount
    expect(modal.textContent).toContain('$25.00')
    // submit
    fireEvent.submit(modal.querySelector('form')!)
    await waitFor(() => expect(mockRefundTransaction).toHaveBeenCalledWith(
      TX_CARD.id,
      expect.objectContaining({ amount_cents: undefined }),
    ))
    // status updates to refunded
    await waitFor(() => expect(screen.queryByText('Issue refund')).toBeNull())
  })

  it('partial refund > original: validation error', async () => {
    render(<Transactions />)
    await screen.findByText('Alice Smith')
    fireEvent.click(screen.getByLabelText('Transaction AAAAAAAA'))
    await screen.findByLabelText('Transaction detail')
    fireEvent.click(screen.getByText('Issue refund'))
    const modal = await screen.findByRole('dialog', { name: 'Refund order' })
    // switch to partial mode
    const partialRadio = modal.querySelectorAll('input[type="radio"]')[1]!
    fireEvent.click(partialRadio)
    const amountInput = await screen.findByLabelText('Refund amount')
    // enter amount greater than original ($25.00)
    fireEvent.change(amountInput, { target: { value: '99.99' } })
    fireEvent.submit(modal.querySelector('form')!)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('cannot exceed')
    expect(mockRefundTransaction).not.toHaveBeenCalled()
  })

  it('pickup order: no refund button, shows cash message', async () => {
    mockListTransactions.mockResolvedValue(makeResponse([TX_CASH]))
    render(<Transactions />)
    await screen.findByText('Bob Jones')
    fireEvent.click(screen.getByLabelText('Transaction BBBBBBBB'))
    await screen.findByLabelText('Transaction detail')
    expect(screen.getByText('Cash order — no refund available')).toBeTruthy()
    expect(screen.queryByText('Issue refund')).toBeNull()
  })

  it('search by customer name: filters table', async () => {
    mockListTransactions.mockResolvedValue(makeResponse([TX_CARD, TX_CASH]))
    render(<Transactions />)
    await screen.findByText('Alice Smith')
    await screen.findByText('Bob Jones')
    const search = screen.getByLabelText('Search transactions')
    fireEvent.change(search, { target: { value: 'alice' } })
    await waitFor(() => expect(screen.queryByText('Bob Jones')).toBeNull())
    expect(screen.getByText('Alice Smith')).toBeTruthy()
  })

  it('payment method badge: card vs cash', async () => {
    mockListTransactions.mockResolvedValue(makeResponse([TX_CARD, TX_CASH]))
    render(<Transactions />)
    await screen.findByText('Alice Smith')
    const badges = screen.getAllByText('Card')
    expect(badges.length).toBeGreaterThan(0)
    expect(screen.getByText('Cash')).toBeTruthy()
  })
})
