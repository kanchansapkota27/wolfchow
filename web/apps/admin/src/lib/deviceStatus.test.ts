import { describe, expect, it } from 'vitest'
import { isDeviceOnline } from './deviceStatus'

const NOW = new Date('2026-07-24T12:00:00Z').getTime()

describe('isDeviceOnline', () => {
  it('null last_seen_at: offline', () => {
    expect(isDeviceOnline(null, NOW)).toBe(false)
  })

  it('heartbeat 2 minutes ago: online', () => {
    expect(isDeviceOnline(new Date(NOW - 2 * 60_000).toISOString(), NOW)).toBe(true)
  })

  it('heartbeat exactly at the 10-minute threshold: offline', () => {
    expect(isDeviceOnline(new Date(NOW - 10 * 60_000).toISOString(), NOW)).toBe(false)
  })

  it('heartbeat 20 minutes ago: offline', () => {
    expect(isDeviceOnline(new Date(NOW - 20 * 60_000).toISOString(), NOW)).toBe(false)
  })
})
