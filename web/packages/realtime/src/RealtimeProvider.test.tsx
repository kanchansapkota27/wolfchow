import { useEffect, useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { RealtimeProvider, useRealtime } from './RealtimeProvider'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockOn = vi.fn()
const mockSubscribe = vi.fn()
const mockRemoveChannel = vi.fn()
const mockChannel = vi.fn()

let subscribeCallback: ((status: string) => void) | null = null
let broadcastCallback: ((args: { event: string; payload: Record<string, unknown> }) => void) | null = null

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}))

function resetChannelMocks() {
  mockOn.mockImplementation((_type: string, _filter: unknown, cb: typeof broadcastCallback) => {
    broadcastCallback = cb
    return { subscribe: mockSubscribe }
  })
  mockSubscribe.mockImplementation((cb: (status: string) => void) => {
    subscribeCallback = cb
    return { unsubscribe: vi.fn() }
  })
  mockChannel.mockImplementation(() => ({ on: mockOn }))
}

// ── Test harness ────────────────────────────────────────────────────────────

function Listener({ event, onEvent }: { event: string; onEvent: (e: string, p: Record<string, unknown>) => void }) {
  const { subscribe, status, connected } = useRealtime()
  const [, setTick] = useState(0)
  useEffect(() => {
    const unsub = subscribe(event, (e: string, p: Record<string, unknown>) => {
      onEvent(e, p)
      setTick((t) => t + 1)
    })
    return unsub
  }, [event, subscribe])
  return <div data-testid="status">{connected ? 'connected' : status}</div>
}

beforeEach(() => {
  vi.resetAllMocks()
  resetChannelMocks()
  subscribeCallback = null
  broadcastCallback = null
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
})

describe('STORY-077/078 · RealtimeProvider', () => {
  it('restaurantId null: does not connect', () => {
    render(
      <RealtimeProvider restaurantId={null}>
        <Listener event="menu_availability_changed" onEvent={() => {}} />
      </RealtimeProvider>,
    )
    expect(mockChannel).not.toHaveBeenCalled()
    expect(screen.getByTestId('status').textContent).toBe('disconnected')
  })

  it('restaurantId set: subscribes to orders:{restaurantId} channel', () => {
    render(
      <RealtimeProvider restaurantId="rest-1">
        <Listener event="menu_availability_changed" onEvent={() => {}} />
      </RealtimeProvider>,
    )
    expect(mockChannel).toHaveBeenCalledWith('orders:rest-1')
  })

  it('SUBSCRIBED status: connected becomes true', () => {
    render(
      <RealtimeProvider restaurantId="rest-1">
        <Listener event="menu_availability_changed" onEvent={() => {}} />
      </RealtimeProvider>,
    )
    act(() => subscribeCallback?.('SUBSCRIBED'))
    expect(screen.getByTestId('status').textContent).toBe('connected')
  })

  it('broadcast event matching subscribed name: handler fires with payload', () => {
    const onEvent = vi.fn()
    render(
      <RealtimeProvider restaurantId="rest-1">
        <Listener event="menu_availability_changed" onEvent={onEvent} />
      </RealtimeProvider>,
    )
    act(() => broadcastCallback?.({ event: 'menu_availability_changed', payload: { foo: 'bar' } }))
    expect(onEvent).toHaveBeenCalledWith('menu_availability_changed', { foo: 'bar' })
  })

  it('CHANNEL_ERROR: status becomes reconnecting and old channel removed', () => {
    render(
      <RealtimeProvider restaurantId="rest-1">
        <Listener event="menu_availability_changed" onEvent={() => {}} />
      </RealtimeProvider>,
    )
    act(() => subscribeCallback?.('CHANNEL_ERROR'))
    expect(screen.getByTestId('status').textContent).toBe('reconnecting')
    expect(mockRemoveChannel).toHaveBeenCalled()
  })

  it('no Supabase env vars configured: does not connect', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    render(
      <RealtimeProvider restaurantId="rest-1">
        <Listener event="menu_availability_changed" onEvent={() => {}} />
      </RealtimeProvider>,
    )
    expect(mockChannel).not.toHaveBeenCalled()
  })

  it('useRealtime outside provider: throws', () => {
    function Bare() {
      useRealtime()
      return null
    }
    expect(() => render(<Bare />)).toThrow('useRealtime must be used within <RealtimeProvider>')
  })
})
